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
from pydantic import ValidationError
from .ai import summarize
from .db import Database, timeline
from .models import EventIn, PickupIn, Confirmation, ActionDecision, Question, now
from .risk import assess
from .pipeline import Pipeline, routes as pipeline_routes


def create_app(db_path=None, api_key=None, webhook_secret=None):
    key = api_key or os.getenv('DEMAFUR_API_KEY', '')
    secret = webhook_secret or os.getenv('DEMAFUR_WEBHOOK_SECRET', '')
    if len(key) < 24 or len(secret) < 24:
        raise RuntimeError('Set distinct DEMAFUR_API_KEY and DEMAFUR_WEBHOOK_SECRET (at least 24 characters each).')
    if key == secret:
        raise RuntimeError('Owner and webhook credentials must differ.')
    source = db_path or os.getenv('DATABASE_URL')
    if not source and os.getenv('DEMAFUR_ALLOW_SQLITE') == 'true':
        source = os.getenv('DEMAFUR_DB') or './data/demafur.sqlite3'
    if not source:
        raise RuntimeError('Set DATABASE_URL for Supabase PostgreSQL. SQLite requires explicit DEMAFUR_ALLOW_SQLITE=true for local demos.')
    db = Database(source)
    app = FastAPI(title='DemaFur Safety Agent', version='0.3.0',
                  description='Single-household backend. Behaviour-based delivery safety; no identity tracking. Hardware adapters are simulated.')
    origins = [o.strip() for o in os.getenv('DEMAFUR_CORS_ORIGINS', '').split(',') if o.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins,
                           allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Authorization', 'Content-Type'])

    def owner(authorization: Annotated[str | None, Header()] = None):
        if not authorization or not hmac.compare_digest(authorization, f'Bearer {key}'):
            raise HTTPException(401, 'Valid owner bearer token required')
    auth = [Depends(owner)]

    def get_delivery(conn, delivery_id):
        row = conn.execute('SELECT * FROM deliveries WHERE id=?', (delivery_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Delivery not found')
        return dict(row)

    def snapshot(conn, delivery_id):
        delivery = get_delivery(conn, delivery_id)
        events = timeline(conn, delivery_id)
        windows = [dict(w) for w in conn.execute('SELECT * FROM pickups WHERE delivery_id=?', (delivery_id,))]
        assessment = assess(events, windows, delivery['resolution'], now())
        states = [r['state'] for r in conn.execute('SELECT state FROM ring_jobs WHERE delivery_id=?', (delivery_id,))]
        coverage = 'unavailable' if 'failed' in states else 'pending' if any(s in ('queued', 'retry', 'processing') for s in states) else 'sampled_frames' if 'completed' in states else 'not_analyzed'
        if coverage in ('unavailable', 'pending'):
            assessment['risk']['reasons'].append('Footage analysis is ' + coverage + '; the current score is not an all-clear assessment.')
        return {**delivery, **assessment, 'timeline': events, 'analysis_coverage': coverage}

    def audit(conn, delivery_id, operation):
        conn.execute('INSERT INTO audit(delivery_id,operation,created_at) VALUES(?,?,?)',
                     (delivery_id, operation, now().isoformat()))

    def sync_actions(conn, view):
        desired = view['suggested_actions']
        # Recommendations become stale after owner confirmation or trusted pickup.
        for row in conn.execute('SELECT * FROM actions WHERE delivery_id=?', (view['id'],)).fetchall():
            if row['kind'] not in desired and row['status'] in ('pending_approval', 'queued'):
                conn.execute("UPDATE actions SET status='cancelled' WHERE id=?", (row['id'],))
        for kind in desired:
            conn.execute("UPDATE actions SET status=?,reason=? WHERE delivery_id=? AND kind=? AND status='cancelled'",
                         ('queued' if kind == 'notify_owner' else 'pending_approval', ' '.join(view['risk']['reasons']), view['id'], kind))
            conn.execute('INSERT INTO actions VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',
                         (str(uuid.uuid4()), view['id'], kind,
                          'queued' if kind == 'notify_owner' else 'pending_approval',
                          ' '.join(view['risk']['reasons']), now().isoformat()))

    def build_evidence(conn, view):
        report = (f"Owner-reported missing package, delivery {view['id']}.\n"
                  + '\n'.join(f"{e['occurred_at']}: {e['kind']} (observation confidence {e['confidence']})" for e in view['timeline'])
                  + '\nThese observations do not establish identity or criminal intent. Review against original recordings before submission.')
        bundle = {'delivery_id': view['id'], 'created_at': now().isoformat(),
                  'classification': 'owner_reported_missing', 'timeline': view['timeline'],
                  'summary': ' '.join(view['risk']['reasons']),
                  'media': [{'event_id': e['event_id'], 'media_ref': e['media_ref'],
                            'status': 'reference_only_not_downloaded_or_verified'} for e in view['timeline'] if e['media_ref']],
                  'report_draft': report,
                  'neighbours_draft': 'A delivery was reported missing from my property. Please contact me privately if you have relevant information. No person has been identified.',
                  'review_required': True, 'submitted': False,
                  'clip_extraction': 'not_configured'}
        conn.execute('INSERT INTO evidence VALUES(?,?,?) ON CONFLICT(delivery_id) DO UPDATE SET created_at=excluded.created_at,payload=excluded.payload',
                     (view['id'], bundle['created_at'], json.dumps(bundle)))
        return bundle

    @app.get('/health')
    def health():
        return {'status': 'ok', 'service': 'DemaFur', 'hardware_mode': 'simulated'}

    @app.get('/ready', dependencies=auth)
    def ready():
        try:
            with db.connect(timeout=1) as conn:
                conn.execute('SELECT 1').fetchone()
        except Exception:
            raise HTTPException(503, 'Database unavailable') from None
        return {'status': 'ready', 'database': 'postgresql' if db.postgres else 'sqlite_local'}

    @app.post('/v1/events', dependencies=auth, status_code=201)
    def event(event: EventIn, response: Response):
        return ingest(event, response)

    def ingest(event, response):
        payload = event.model_dump(mode='json')
        payload['occurred_at'] = event.occurred_at.isoformat()
        canonical = json.dumps(payload, sort_keys=True)
        with db.connect() as conn:
            existing = conn.execute('SELECT payload FROM events WHERE id=?', (event.event_id,)).fetchone()
            if existing:
                if json.loads(existing['payload']) != payload:
                    raise HTTPException(409, 'Event ID already exists with different data')
                response.status_code = 200
                return {'duplicate': True, 'delivery': snapshot(conn, event.delivery_id)}
            delivery = conn.execute('SELECT * FROM deliveries WHERE id=?', (event.delivery_id,)).fetchone()
            if delivery and delivery['camera_id'] != event.camera_id:
                raise HTTPException(409, 'Delivery belongs to another camera')
            if conn.execute('SELECT COUNT(*) AS n FROM events WHERE delivery_id=?', (event.delivery_id,)).fetchone()['n'] >= 2000:
                raise HTTPException(409, 'Delivery event limit reached')
            conn.execute('INSERT INTO deliveries VALUES(?,?,?,NULL,NULL) ON CONFLICT DO NOTHING',
                         (event.delivery_id, event.camera_id, now().isoformat()))
            conn.execute('INSERT INTO events VALUES(?,?,?,?)',
                         (event.event_id, event.delivery_id, payload['occurred_at'], canonical))
            view = snapshot(conn, event.delivery_id)
            sync_actions(conn, view)
            if view['resolution'] == 'missing':
                build_evidence(conn, view)
            audit(conn, event.delivery_id, 'event_ingested')
            return {'duplicate': False, 'delivery': view}

    @app.post('/v1/webhooks/events', status_code=201)
    async def webhook(request: Request, response: Response,
                      x_demafur_timestamp: Annotated[str, Header()],
                      x_demafur_signature: Annotated[str, Header()]):
        # This is our bridge contract, not a claim about Ring's native webhook format.
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
        expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, x_demafur_signature):
            raise HTTPException(401, 'Invalid webhook signature')
        try:
            event = EventIn.model_validate_json(bytes(body))
        except ValidationError:
            raise HTTPException(422, 'Invalid event payload')
        return ingest(event, response)

    @app.get('/v1/deliveries', dependencies=auth)
    def deliveries(limit: int = 50, offset: int = 0):
        if not 1 <= limit <= 100 or offset < 0:
            raise HTTPException(422, 'limit must be 1..100; offset must be nonnegative')
        with db.connect() as conn:
            ids = conn.execute('SELECT id FROM deliveries ORDER BY created_at DESC,id LIMIT ? OFFSET ?', (limit, offset)).fetchall()
            views = [snapshot(conn, r['id']) for r in ids]
            return {'items': [{k: v for k, v in s.items() if k != 'timeline'} for s in views], 'limit': limit, 'offset': offset}

    @app.get('/v1/deliveries/{delivery_id}', dependencies=auth)
    def detail(delivery_id: str):
        with db.connect() as conn:
            return snapshot(conn, delivery_id)

    @app.get('/v1/deliveries/{delivery_id}/summary', dependencies=auth)
    def summary(delivery_id: str):
        with db.connect() as conn:
            view = snapshot(conn, delivery_id)
        return summarize(view)

    @app.post('/v1/pickup-windows', dependencies=auth, status_code=201)
    def pickup(data: PickupIn):
        start, end = data.starts_at.astimezone(timezone.utc), data.ends_at.astimezone(timezone.utc)
        if end <= start or end <= now() or end - start > timedelta(hours=24):
            raise HTTPException(422, 'Window must end in the future, after its start, and last no more than 24 hours')
        with db.connect() as conn:
            view = snapshot(conn, data.delivery_id)
            if view['status'] in ('collected', 'incident') or any(e['kind'] == 'package_removed' for e in view['timeline']):
                raise HTTPException(409, 'Cannot retroactively authorize pickup; use owner confirmation')
            record = {'id': str(uuid.uuid4()), 'delivery_id': data.delivery_id,
                      'starts_at': start.isoformat(), 'ends_at': end.isoformat(), 'created_at': now().isoformat(), 'revoked': 0}
            conn.execute('INSERT INTO pickups VALUES(?,?,?,?,?,?)', tuple(record[k] for k in ('id','delivery_id','starts_at','ends_at','created_at','revoked')))
            audit(conn, data.delivery_id, 'pickup_window_created')
            return record

    @app.get('/v1/pickup-windows', dependencies=auth)
    def windows():
        with db.connect() as conn:
            return {'items': [dict(r) for r in conn.execute('SELECT * FROM pickups ORDER BY starts_at DESC LIMIT 100')]}

    @app.delete('/v1/pickup-windows/{window_id}', dependencies=auth)
    def revoke(window_id: str):
        with db.connect() as conn:
            row = conn.execute('SELECT * FROM pickups WHERE id=?', (window_id,)).fetchone()
            if not row:
                raise HTTPException(404, 'Pickup window not found')
            conn.execute('UPDATE pickups SET revoked=1 WHERE id=?', (window_id,))
            sync_actions(conn, snapshot(conn, row['delivery_id']))
            audit(conn, row['delivery_id'], 'pickup_window_revoked')
            return {'revoked': True}

    @app.post('/v1/deliveries/{delivery_id}/confirmation', dependencies=auth)
    def confirm(delivery_id: str, data: Confirmation):
        with db.connect() as conn:
            get_delivery(conn, delivery_id)
            conn.execute('UPDATE deliveries SET resolution=?,resolved_at=? WHERE id=?',
                         (data.outcome, now().isoformat(), delivery_id))
            view = snapshot(conn, delivery_id)
            sync_actions(conn, view)
            if data.outcome == 'missing':
                build_evidence(conn, view)
            else:
                conn.execute('DELETE FROM evidence WHERE delivery_id=?', (delivery_id,))
            audit(conn, delivery_id, 'owner_confirmation_' + data.outcome)
            return view

    @app.get('/v1/actions', dependencies=auth)
    def actions():
        with db.connect() as conn:
            return {'items': [dict(r) for r in conn.execute('SELECT * FROM actions ORDER BY created_at DESC LIMIT 200')]}

    @app.post('/v1/actions/{action_id}/decision', dependencies=auth)
    def decide(action_id: str, data: ActionDecision):
        with db.connect() as conn:
            row = conn.execute('SELECT * FROM actions WHERE id=?', (action_id,)).fetchone()
            if not row:
                raise HTTPException(404, 'Action not found')
            sync_actions(conn, snapshot(conn, row['delivery_id']))
            row = conn.execute('SELECT * FROM actions WHERE id=?', (action_id,)).fetchone()
            if row['status'] != 'pending_approval':
                raise HTTPException(409, 'Action is not pending approval')
            status = 'queued' if data.approved else 'rejected'
            conn.execute('UPDATE actions SET status=? WHERE id=?', (status, action_id))
            audit(conn, row['delivery_id'], 'action_' + status)
            return {**dict(row), 'status': status}

    @app.post('/v1/actions/dispatch', dependencies=auth)
    def dispatch():
        with db.connect() as conn:
            for row in conn.execute("SELECT DISTINCT delivery_id FROM actions WHERE status='queued'").fetchall():
                sync_actions(conn, snapshot(conn, row['delivery_id']))
            rows = conn.execute("SELECT * FROM actions WHERE status='queued'").fetchall()
            for row in rows:
                conn.execute("UPDATE actions SET status='simulated' WHERE id=?", (row['id'],))
                audit(conn, row['delivery_id'], 'simulated_' + row['kind'])
            return {'mode': 'simulated', 'dispatched': len(rows), 'physical_actions_performed': False}

    @app.post('/v1/maintenance', dependencies=auth)
    def maintenance():
        retention = max(1, int(os.getenv('DEMAFUR_RETENTION_DAYS', '30')))
        cutoff = (now() - timedelta(days=retention)).isoformat()
        with db.connect() as conn:
            # Retention includes incidents; export reviewed evidence before expiry.
            expired = conn.execute('SELECT id FROM deliveries WHERE created_at<? AND id NOT IN (SELECT delivery_id FROM events WHERE occurred_at>=?)', (cutoff, cutoff)).fetchall()
            for row in expired:
                pipeline.remove_delivery(conn, row['id'])
                conn.execute('DELETE FROM deliveries WHERE id=?', (row['id'],))
            for row in conn.execute('SELECT id FROM deliveries').fetchall():
                sync_actions(conn, snapshot(conn, row['id']))
            return {'deleted_deliveries': len(expired), 'retention_days': retention, 'risk_refreshed': True}

    @app.get('/v1/deliveries/{delivery_id}/evidence', dependencies=auth)
    def evidence(delivery_id: str):
        with db.connect() as conn:
            get_delivery(conn, delivery_id)
            row = conn.execute('SELECT payload FROM evidence WHERE delivery_id=?', (delivery_id,)).fetchone()
            if not row:
                raise HTTPException(409, 'Evidence requires an owner-reported missing package')
            return json.loads(row['payload'])

    @app.get('/v1/deliveries/{delivery_id}/evidence.zip', dependencies=auth)
    def download(delivery_id: str):
        bundle = evidence(delivery_id)
        files = {'evidence.json': json.dumps(bundle, indent=2).encode(),
                 'report-draft.txt': bundle['report_draft'].encode(),
                 'neighbours-draft.txt': bundle['neighbours_draft'].encode()}
        manifest = {name: hashlib.sha256(content).hexdigest() for name, content in files.items()}
        with db.connect() as conn:
            clips = conn.execute("SELECT * FROM ring_jobs WHERE delivery_id=? AND state='completed' ORDER BY occurred_at", (delivery_id,)).fetchall()
            # Bound archive memory use; remaining clips remain individually downloadable.
            total = 0
            included = []
            for clip in clips:
                path = pipeline.clip(clip)
                if path.is_file() and total + path.stat().st_size <= 64 * 1024 * 1024:
                    content = path.read_bytes()
                    name = 'clips/' + clip['id'] + '.mp4'
                    files[name] = content
                    included.append({'job_id': clip['id'], 'path': name, 'media': json.loads(clip['media'])})
                    total += len(content)
            bundle['included_recordings'] = included
            bundle['recordings_not_included'] = len(clips) - len(included)
            bundle['clip_extraction'] = 'event_windows_downloaded' if included else 'not_configured'
            files['evidence.json'] = json.dumps(bundle, indent=2).encode()
        manifest = {name: hashlib.sha256(content).hexdigest() for name, content in files.items()}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, content in files.items():
                archive.writestr(name, content)
            archive.writestr('sha256-manifest.json', json.dumps(manifest, indent=2))
        return Response(buffer.getvalue(), media_type='application/zip',
                        headers={'Content-Disposition': 'attachment; filename="demafur-evidence.zip"'})

    @app.get('/v1/deliveries/{delivery_id}/audit', dependencies=auth)
    def audit_log(delivery_id: str):
        with db.connect() as conn:
            get_delivery(conn, delivery_id)
            return {'items': [dict(r) for r in conn.execute('SELECT * FROM audit WHERE delivery_id=? ORDER BY id', (delivery_id,))]}

    @app.delete('/v1/deliveries/{delivery_id}', dependencies=auth)
    def delete(delivery_id: str):
        with db.connect() as conn:
            get_delivery(conn, delivery_id)
            pipeline.remove_delivery(conn, delivery_id)
            conn.execute('DELETE FROM deliveries WHERE id=?', (delivery_id,))
            return {'deleted': True, 'external_media_deleted': False}

    @app.post('/v1/assistant/query', dependencies=auth)
    def query(data: Question):
        if data.delivery_id:
            return summary(data.delivery_id)
        with db.connect() as conn:
            ids = conn.execute('SELECT id FROM deliveries ORDER BY created_at DESC LIMIT 100').fetchall()
            views = [snapshot(conn, r['id']) for r in ids]
        if data.intent == 'today_summary':
            today = now().date()
            views = [v for v in views if any(e['occurred_at'][:10] == str(today) for e in v['timeline'])]
        texts = [f"{v['id']}: {v['status'].replace('_', ' ')}, {v['risk']['level'].replace('_', ' ')}." for v in views]
        return {'text': ' '.join(texts) or 'No matching deliveries recorded.', 'source': 'policy_template',
                'timezone': 'UTC', 'integration': 'authenticated_intent_api_not_native_alexa_skill'}

    def apply_analysis(conn, job, media, analysis):
        delivery = get_delivery(conn, job['delivery_id'])
        candidates = [{'event_id': 'ring-' + job['id'], 'delivery_id': job['delivery_id'],
                       'camera_id': job['camera_id'], 'kind': job['event_kind'],
                       'occurred_at': job['occurred_at'], 'confidence': 1,
                       'observations': {'duration_seconds': 0, 'looking_around': False},
                       'media_ref': 'ring/' + job['id'] + '.mp4', 'provenance': 'ring_webhook'}]
        start = datetime.fromtimestamp(media['start_ms']/1000, timezone.utc)
        for index, observation in enumerate(analysis['observations']):
            occurred = start + timedelta(seconds=observation['offset_seconds'])
            if occurred > start + timedelta(milliseconds=media['duration_ms']):
                raise ValueError('Observation outside recorded clip')
            candidates.append({'event_id': 'vision-' + job['id'] + '-' + str(index),
                'delivery_id': job['delivery_id'], 'camera_id': job['camera_id'],
                'kind': observation['kind'], 'occurred_at': occurred.isoformat(),
                'confidence': observation['confidence'],
                'observations': {'duration_seconds': observation['duration_seconds'], 'looking_around': False},
                'media_ref': 'ring/' + job['id'] + '.mp4', 'provenance': 'sampled_frame_analysis',
                'explanation': observation['explanation'], 'frame_indices': observation['frame_indices']})
        existing = timeline(conn, job['delivery_id'])
        if len(existing) + len(candidates) > 2000:
            raise ValueError('Delivery observation limit reached')
        for payload in candidates:
            # Avoid double-counting the same action in overlapping event clips.
            if payload['provenance'] == 'sampled_frame_analysis' and any(
                e.get('provenance') == 'sampled_frame_analysis' and e['kind'] == payload['kind']
                and abs((datetime.fromisoformat(e['occurred_at']) - datetime.fromisoformat(payload['occurred_at'])).total_seconds()) <= 5
                for e in existing):
                continue
            conn.execute('INSERT INTO events VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
                (payload['event_id'], job['delivery_id'], payload['occurred_at'], json.dumps(payload)))
        view = snapshot(conn, job['delivery_id'])
        sync_actions(conn, view)
        if delivery['resolution'] == 'missing':
            build_evidence(conn, view)
        audit(conn, job['delivery_id'], 'ring_clip_analyzed')

    pipeline = Pipeline(db, apply_analysis)
    app.state.pipeline = pipeline
    app.include_router(pipeline_routes(pipeline, owner))
    static = Path(__file__).parent / 'static'
    app.mount('/review-assets', StaticFiles(directory=static), name='review-assets')

    @app.get('/review', include_in_schema=False)
    def review():
        return FileResponse(static / 'review.html', headers={
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})

    return app
