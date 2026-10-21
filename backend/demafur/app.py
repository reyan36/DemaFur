import hashlib
import hmac
import io
import json
import os
import time
import uuid
import zipfile
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from datetime import datetime, timedelta, timezone
from typing import Annotated
from fastapi import FastAPI, Depends, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import ValidationError
from .ai import summarize
from .db import Database, timeline
from .models import EventIn, PickupIn, Confirmation, ActionDecision, Question, now
from .risk import assess
from .dashboard import overview, deliveries_page, coverage
from .pipeline import Pipeline, routes as pipeline_routes

def auto_deter():
    """Owner setting: run lights and warnings at once instead of waiting for approval."""
    return os.getenv('DEMAFUR_AUTO_DETER', 'true') != 'false'

def create_app(api_key=None, webhook_secret=None):
    key = api_key or os.getenv('DEMAFUR_API_KEY', '')
    secret = webhook_secret or os.getenv('DEMAFUR_WEBHOOK_SECRET', '')
    if len(key) < 24 or len(secret) < 24:
        raise RuntimeError(
            'Set distinct DEMAFUR_API_KEY and DEMAFUR_WEBHOOK_SECRET '
            '(at least 24 characters each).')
    if key == secret:
        raise RuntimeError('Owner and webhook credentials must differ.')

    db = Database()
    app = FastAPI(
        title='DemaFur Safety Agent', version='0.4.0',
        description='Single-household backend powered by Firebase Firestore.')
    cors_env = os.getenv('DEMAFUR_CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000,*')
    origins = [o.strip() for o in cors_env.split(',') if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=['*'] if '*' in origins else origins,
        allow_methods=['GET', 'POST', 'DELETE', 'OPTIONS'],
        allow_headers=['*'])

    bearer = HTTPBearer(
        auto_error=False,
        description='Paste the DEMAFUR_API_KEY value only.')

    def owner(credentials: Annotated[
            HTTPAuthorizationCredentials | None, Depends(bearer)]):
        if not credentials or not hmac.compare_digest(
                credentials.credentials.encode(), key.encode()):
            raise HTTPException(
                401, 'Valid owner bearer token required',
                headers={'WWW-Authenticate': 'Bearer'})
    auth = [Depends(owner)]

    def get_delivery(db, delivery_id):
        row = db.get_delivery(delivery_id)
        if not row:
            raise HTTPException(404, 'Delivery not found')
        return row

    def build_view(delivery, events, windows, states):
        assessment = assess(events, windows, delivery.get('resolution'), now())
        return {**delivery, **assessment, 'timeline': events,
                'analysis_coverage': coverage(assessment, states)}

    def snapshot(db, delivery_id):
        delivery, events, windows, states = db.read_many(
            lambda: db.get_delivery(delivery_id),
            lambda: timeline(db, delivery_id),
            lambda: db.list_pickups(delivery_id=delivery_id),
            lambda: db.job_states_for_delivery(delivery_id))
        if not delivery:
            raise HTTPException(404, 'Delivery not found')
        return build_view(delivery, events, windows, states)

    def audit(db, delivery_id, operation):
        db.add_audit(delivery_id, operation, now().isoformat())

    # Firestore bills every document read and the dashboard polls every few seconds, so list
    # views are rebuilt only after a write, or once they are old enough for time-based rules.
    cache_seconds = float(os.getenv('DEMAFUR_READ_CACHE_SECONDS', '30'))
    cache = {}
    summaries = {}

    def cached(key, build):
        hit = cache.get(key)
        if hit and hit[0] == db.version and time.monotonic() - hit[1] < cache_seconds:
            return hit[2]
        version = db.version   # read first: a write during build makes the next call rebuild
        value = build()
        cache[key] = (version, time.monotonic(), value)
        return value

    def sync_actions(db, view, existing=None):
        desired = view['suggested_actions']
        if existing is None:
            existing = db.list_actions(delivery_id=view['id'])
        for row in existing:
            if (row['kind'] not in desired
                    and row['status'] in ('pending_approval', 'queued')):
                db.update_action(row['id'], status='cancelled')
        by_kind = {row['kind']: row for row in existing}
        for kind in desired:
            # Try to reactivate a cancelled action
            action = by_kind.get(kind)
            if action and action['status'] == 'cancelled':
                db.update_action(
                    action['id'],
                    status='queued' if kind == 'notify_owner' or auto_deter()
                    else 'pending_approval',
                    reason=' '.join(view['risk']['reasons']))
            elif not action:
                db.create_action(
                    str(uuid.uuid4()), view['id'], kind,
                    'queued' if kind == 'notify_owner' or auto_deter()
                    else 'pending_approval',
                    ' '.join(view['risk']['reasons']), now().isoformat())

    def build_evidence(db, view):
        report = (
            f"Owner-reported missing package, delivery {view['id']}.\n"
            + '\n'.join(
                f"{e['occurred_at']}: {e['kind']} "
                f"(observation confidence {e['confidence']})"
                for e in view['timeline'])
            + '\nThese observations do not establish identity or criminal '
              'intent. Review against original recordings before submission.')
        bundle = {
            'delivery_id': view['id'],
            'created_at': now().isoformat(),
            'classification': 'owner_reported_missing',
            'timeline': view['timeline'],
            'summary': ' '.join(view['risk']['reasons']),
            'media': [
                {'event_id': e['event_id'], 'media_ref': e['media_ref'],
                 'status': 'reference_only_not_downloaded_or_verified'}
                for e in view['timeline'] if e.get('media_ref')],
            'report_draft': report,
            'neighbours_draft': (
                'A delivery was reported missing from my property. '
                'Please contact me privately if you have relevant '
                'information. No person has been identified.'),
            'review_required': True, 'submitted': False,
            'clip_extraction': 'not_configured'}
        db.set_evidence(view['id'], bundle['created_at'], json.dumps(bundle))
        return bundle

    @app.api_route('/health', methods=['GET', 'HEAD'])
    def health():
        return {'status': 'ok', 'service': 'DemaFur',
                'hardware_mode': 'simulated'}

    @app.get('/ready', dependencies=auth)
    def ready():
        try:
            # Quick Firestore connectivity check
            db.fs.collection('_health').document('ping').set(
                {'ts': now().isoformat()})
        except Exception:
            raise HTTPException(503, 'Database unavailable') from None
        return {'status': 'ready', 'database': 'firestore'}

    @app.post('/v1/events', dependencies=auth, status_code=201)
    def event(event: EventIn, response: Response):
        return ingest(event, response)

    def ingest(event, response):
        payload = event.model_dump(mode='json')
        payload['occurred_at'] = event.occurred_at.isoformat()
        canonical = json.dumps(payload, sort_keys=True)
        # Everything this event needs is read at once and written in one batch: done one
        # after another, the Firestore round trips made each event take several seconds.
        existing, delivery, events, windows, states, actions = db.read_many(
            lambda: db.get_event(event.event_id),
            lambda: db.get_delivery(event.delivery_id),
            lambda: timeline(db, event.delivery_id),
            lambda: db.list_pickups(delivery_id=event.delivery_id),
            lambda: db.job_states_for_delivery(event.delivery_id),
            lambda: db.list_actions(delivery_id=event.delivery_id))
        if existing:
            if json.loads(existing['payload']) != payload:
                raise HTTPException(
                    409, 'Event ID already exists with different data')
            response.status_code = 200
            return {'duplicate': True,
                    'delivery': build_view(delivery, events, windows, states)}
        if delivery and delivery['camera_id'] != event.camera_id:
            raise HTTPException(409, 'Delivery belongs to another camera')
        if len(events) >= 2000:
            raise HTTPException(409, 'Delivery event limit reached')
        created_at = now().isoformat()
        db.record_event(event.event_id, event.delivery_id, event.camera_id,
                        payload['occurred_at'], canonical, created_at,
                        new_delivery=delivery is None)
        delivery = delivery or {'id': event.delivery_id, 'camera_id': event.camera_id,
                                'created_at': created_at, 'resolution': None, 'resolved_at': None}
        events = sorted(events + [json.loads(canonical)], key=lambda e: e['occurred_at'])
        view = build_view(delivery, events, windows, states)
        sync_actions(db, view, actions)
        if view.get('resolution') == 'missing':
            build_evidence(db, view)
        view['auto_deterrents'] = ([a for a in view['suggested_actions'] if a != 'notify_owner']
                                   if auto_deter() else [])
        return {'duplicate': False, 'delivery': view}

    @app.post('/v1/webhooks/events', status_code=201)
    async def webhook(request: Request, response: Response,
                      x_demafur_timestamp: Annotated[str, Header()],
                      x_demafur_signature: Annotated[str, Header()]):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 65536:
                raise HTTPException(413, 'Webhook exceeds 64 KiB')
        try:
            stamp = int(x_demafur_timestamp)
        except ValueError:
            raise HTTPException(401, 'Invalid timestamp')
        if abs(time.time() - stamp) > 300:
            raise HTTPException(401, 'Expired webhook')
        signed = x_demafur_timestamp.encode() + b'.' + bytes(body)
        expected = hmac.new(
            secret.encode(), signed, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, x_demafur_signature):
            raise HTTPException(401, 'Invalid webhook signature')
        try:
            ev = EventIn.model_validate_json(bytes(body))
        except ValidationError:
            raise HTTPException(422, 'Invalid event payload')
        return ingest(ev, response)

    @app.get('/v1/dashboard', dependencies=auth)
    def dashboard(response: Response, activity_limit: int = 20,
                  delivery_limit: int = 20):
        if not 1 <= activity_limit <= 100 or not 1 <= delivery_limit <= 100:
            raise HTTPException(422, 'limits must be 1..100')

        def build():
            result = overview(db, activity_limit, delivery_limit)
            integration = pipeline.status()
            result['monitoringStatus'] = (
                'offline' if not integration['ring_configured']
                or integration['ring_disabled'] else 'warning')
            result['monitoringReason'] = (
                'Camera and worker liveness have not been verified.')
            result['integrations'] = integration
            return result
        response.headers['Cache-Control'] = 'no-store'
        return cached(('dashboard', activity_limit, delivery_limit), build)

    @app.get('/v1/deliveries', dependencies=auth)
    def deliveries(limit: int = 50, offset: int = 0):
        if not 1 <= limit <= 100 or offset < 0:
            raise HTTPException(
                422, 'limit must be 1..100; offset must be nonnegative')

        return cached(('deliveries', limit, offset), lambda: {
            'items': deliveries_page(db, limit, offset),
            'limit': limit, 'offset': offset})

    @app.post('/v1/deliveries/purge', dependencies=auth)
    def purge_all_deliveries(limit: int = 500):
        """Delete up to `limit` deliveries. Call again while `remaining` > 0 to report progress."""
        if not 1 <= limit <= 500:
            raise HTTPException(422, 'limit must be 1..500')
        ids = [d['id'] for d in db.list_deliveries()]
        deleted = ids[:limit]
        pipeline.remove_clips(db.delete_deliveries(deleted))
        return {'purged': len(deleted), 'remaining': len(ids) - len(deleted),
                'deliveries': deleted}

    @app.get('/v1/deliveries/{delivery_id}', dependencies=auth)
    def detail(delivery_id: str):
        return snapshot(db, delivery_id)

    @app.get('/v1/deliveries/{delivery_id}/summary', dependencies=auth)
    def summary(delivery_id: str):
        view = snapshot(db, delivery_id)
        # Reuse the AI report until the delivery changes: each one is a paid provider call.
        key = json.dumps([delivery_id, view.get('resolution'), view['risk'],
                          [e['event_id'] for e in view['timeline']]], sort_keys=True)
        if key not in summaries:
            result = summarize(view)
            if result.get('ai_unavailable'):
                return result                 # try the provider again next time
            if len(summaries) > 500:
                summaries.clear()
            summaries[key] = result
        return summaries[key]

    @app.post('/v1/pickup-windows', dependencies=auth, status_code=201)
    def pickup(data: PickupIn):
        start = data.starts_at.astimezone(timezone.utc)
        end = data.ends_at.astimezone(timezone.utc)
        if (end <= start or end <= now()
                or end - start > timedelta(hours=24)):
            raise HTTPException(
                422, 'Window must end in the future, after its start, '
                     'and last no more than 24 hours')
        view = snapshot(db, data.delivery_id)
        if (view['status'] in ('collected', 'incident')
                or any(e['kind'] == 'package_removed'
                       for e in view['timeline'])):
            raise HTTPException(
                409,
                'Cannot retroactively authorize pickup; '
                'use owner confirmation')
        record = {
            'id': str(uuid.uuid4()), 'delivery_id': data.delivery_id,
            'starts_at': start.isoformat(), 'ends_at': end.isoformat(),
            'created_at': now().isoformat(), 'revoked': 0}
        db.create_pickup(
            record['id'], data.delivery_id,
            record['starts_at'], record['ends_at'],
            record['created_at'])
        audit(db, data.delivery_id, 'pickup_window_created')
        return record

    @app.get('/v1/pickup-windows', dependencies=auth)
    def windows():
        return {'items': db.list_pickups_descending(limit=100)}

    @app.delete('/v1/pickup-windows/{window_id}', dependencies=auth)
    def revoke(window_id: str):
        row = db.get_pickup(window_id)
        if not row:
            raise HTTPException(404, 'Pickup window not found')
        db.update_pickup(window_id, revoked=1)
        sync_actions(db, snapshot(db, row['delivery_id']))
        audit(db, row['delivery_id'], 'pickup_window_revoked')
        return {'revoked': True}

    @app.post('/v1/deliveries/{delivery_id}/confirmation', dependencies=auth)
    def confirm(delivery_id: str, data: Confirmation):
        get_delivery(db, delivery_id)
        db.update_delivery(
            delivery_id,
            resolution=data.outcome, resolved_at=now().isoformat())
        view = snapshot(db, delivery_id)
        sync_actions(db, view)
        if data.outcome == 'missing':
            build_evidence(db, view)
        else:
            db.delete_evidence(delivery_id)
        audit(db, delivery_id, 'owner_confirmation_' + data.outcome)
        return view

    @app.get('/v1/actions', dependencies=auth)
    def actions(delivery_id: str | None = None):
        return {'items': db.list_actions(delivery_id=delivery_id, limit=200)}

    @app.post('/v1/actions/{action_id}/decision', dependencies=auth)
    def decide(action_id: str, data: ActionDecision):
        row = db.get_action(action_id)
        if not row:
            raise HTTPException(404, 'Action not found')
        sync_actions(db, snapshot(db, row['delivery_id']))
        # Re-fetch after sync
        row = db.get_action(action_id)
        if row['status'] != 'pending_approval':
            raise HTTPException(409, 'Action is not pending approval')
        status = 'queued' if data.approved else 'rejected'
        db.update_action(action_id, status=status)
        audit(db, row['delivery_id'], 'action_' + status)
        return {**row, 'status': status}

    @app.post('/v1/actions/dispatch', dependencies=auth)
    def dispatch():
        # Refresh all queued actions
        queued = db.list_actions(status='queued')
        seen = set()
        for row in queued:
            if row['delivery_id'] not in seen:
                sync_actions(db, snapshot(db, row['delivery_id']))
                seen.add(row['delivery_id'])
        # Re-fetch and dispatch
        queued = db.list_actions(status='queued')
        for row in queued:
            db.update_action(row['id'], status='simulated')
            audit(db, row['delivery_id'], 'simulated_' + row['kind'])
        return {'mode': 'simulated', 'dispatched': len(queued),
                'physical_actions_performed': False}

    @app.post('/v1/maintenance', dependencies=auth)
    def maintenance():
        retention = max(1, int(os.getenv('DEMAFUR_RETENTION_DAYS', '30')))
        cutoff = (now() - timedelta(days=retention)).isoformat()
        all_dels = db.list_deliveries()
        expired = []
        for d in all_dels:
            if d['created_at'] < cutoff:
                # Check if delivery has recent events
                events = db.list_events_for_delivery(d['id'])
                if not any(e.get('occurred_at', '') >= cutoff for e in events):
                    expired.append(d['id'])
        pipeline.remove_clips(db.delete_deliveries(expired))
        expired_count = len(expired)
        # Refresh risk for open deliveries only: an owner-resolved delivery's risk cannot change,
        # and the worker runs this every minute.
        for d in all_dels:
            if d['id'] not in expired and not d.get('resolution'):
                sync_actions(db, snapshot(db, d['id']))
        return {'deleted_deliveries': expired_count,
                'retention_days': retention, 'risk_refreshed': True}

    @app.get('/v1/deliveries/{delivery_id}/evidence', dependencies=auth)
    def evidence(delivery_id: str):
        get_delivery(db, delivery_id)
        row = db.get_evidence(delivery_id)
        if not row:
            raise HTTPException(
                409, 'Evidence requires an owner-reported missing package')
        return json.loads(row['payload'])

    @app.get('/v1/deliveries/{delivery_id}/evidence.zip', dependencies=auth)
    def download(delivery_id: str):
        bundle = evidence(delivery_id)
        files = {
            'evidence.json': json.dumps(bundle, indent=2).encode(),
            'report-draft.txt': bundle['report_draft'].encode(),
            'neighbours-draft.txt': bundle['neighbours_draft'].encode()}
        clips = db.list_completed_jobs(delivery_id)
        total, included = 0, []
        for clip in clips:
            path = pipeline.clip(clip)
            if (path.is_file()
                    and total + path.stat().st_size <= 64 * 1024 * 1024):
                content = path.read_bytes()
                name = 'clips/' + clip['id'] + '.mp4'
                files[name] = content
                included.append({
                    'job_id': clip['id'], 'path': name,
                    'media': json.loads(clip['media'])})
                total += len(content)
        bundle['included_recordings'] = included
        bundle['recordings_not_included'] = len(clips) - len(included)
        bundle['clip_extraction'] = (
            'event_windows_downloaded' if included else 'not_configured')
        files['evidence.json'] = json.dumps(bundle, indent=2).encode()
        manifest = {name: hashlib.sha256(content).hexdigest()
                    for name, content in files.items()}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, content in files.items():
                archive.writestr(name, content)
            archive.writestr(
                'sha256-manifest.json', json.dumps(manifest, indent=2))
        return Response(
            buffer.getvalue(), media_type='application/zip',
            headers={
                'Content-Disposition':
                    'attachment; filename="demafur-evidence.zip"'})

    @app.get('/v1/deliveries/{delivery_id}/audit', dependencies=auth)
    def audit_log(delivery_id: str):
        get_delivery(db, delivery_id)
        return {'items': db.list_audit(delivery_id)}

    @app.delete('/v1/deliveries/{delivery_id}', dependencies=auth)
    def delete(delivery_id: str):
        get_delivery(db, delivery_id)
        pipeline.remove_clips(db.delete_deliveries([delivery_id]))
        return {'deleted': True, 'external_media_deleted': False}

    @app.post('/v1/assistant/query', dependencies=auth)
    def query(data: Question):
        if data.delivery_id:
            return summary(data.delivery_id)
        rows = db.list_deliveries(limit=100)
        views = [snapshot(db, r['id']) for r in rows]
        if data.intent == 'today_summary':
            today = now().date()
            views = [v for v in views if any(
                e['occurred_at'][:10] == str(today)
                for e in v['timeline'])]
        texts = [
            f"{v['id']}: {v['status'].replace('_', ' ')}, "
            f"{v['risk']['level'].replace('_', ' ')}."
            for v in views]
        return {
            'text': ' '.join(texts) or 'No matching deliveries recorded.',
            'source': 'policy_template', 'timezone': 'UTC',
            'integration': 'authenticated_intent_api_not_native_alexa_skill'}

    def apply_analysis(db, job, media, analysis):
        delivery = get_delivery(db, job['delivery_id'])
        candidates = [{
            'event_id': 'ring-' + job['id'],
            'delivery_id': job['delivery_id'],
            'camera_id': job['camera_id'],
            'kind': job['event_kind'],
            'occurred_at': job['occurred_at'], 'confidence': 1,
            'observations': {'duration_seconds': 0, 'looking_around': False},
            'media_ref': 'ring/' + job['id'] + '.mp4',
            'provenance': 'ring_webhook'}]
        start = datetime.fromtimestamp(
            media['start_ms'] / 1000, timezone.utc)
        for index, observation in enumerate(analysis['observations']):
            occurred = start + timedelta(
                seconds=observation['offset_seconds'])
            if occurred > start + timedelta(
                    milliseconds=media['duration_ms']):
                raise ValueError('Observation outside recorded clip')
            candidates.append({
                'event_id': 'vision-' + job['id'] + '-' + str(index),
                'delivery_id': job['delivery_id'],
                'camera_id': job['camera_id'],
                'kind': observation['kind'],
                'occurred_at': occurred.isoformat(),
                'confidence': observation['confidence'],
                'observations': {
                    'duration_seconds': observation['duration_seconds'],
                    'looking_around': False},
                'media_ref': 'ring/' + job['id'] + '.mp4',
                'provenance': 'sampled_frame_analysis',
                'explanation': observation['explanation'],
                'frame_indices': observation['frame_indices']})
        existing = timeline(db, job['delivery_id'])
        if len(existing) + len(candidates) > 2000:
            raise ValueError('Delivery observation limit reached')
        for payload in candidates:
            # Skip duplicate vision observations within 5 seconds
            if (payload.get('provenance') == 'sampled_frame_analysis'
                    and any(
                        e.get('provenance') == 'sampled_frame_analysis'
                        and e['kind'] == payload['kind']
                        and abs((
                            datetime.fromisoformat(e['occurred_at'])
                            - datetime.fromisoformat(
                                payload['occurred_at'])
                        ).total_seconds()) <= 5
                        for e in existing)):
                continue
            db.create_event(
                payload['event_id'], job['delivery_id'],
                payload['occurred_at'], json.dumps(payload))
        view = snapshot(db, job['delivery_id'])
        sync_actions(db, view)
        if delivery.get('resolution') == 'missing':
            build_evidence(db, view)
        audit(db, job['delivery_id'], 'ring_clip_analyzed')

    pipeline = Pipeline(db, apply_analysis)
    app.state.pipeline = pipeline
    app.include_router(pipeline_routes(pipeline, owner))
    static = Path(__file__).parent / 'static'
    app.mount('/review-assets', StaticFiles(directory=static),
              name='review-assets')

    @app.get('/review', include_in_schema=False)
    def review():
        return FileResponse(static / 'review.html', headers={
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': (
                "default-src 'self'; script-src 'self'; "
                "style-src 'self'; frame-ancestors 'none'; "
                "base-uri 'none'; form-action 'self'")})

    return app
