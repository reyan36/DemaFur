"""Durable Ring webhook inbox and bounded event-clip processing."""
import hashlib
import hmac
import json
import os
import shutil
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from urllib.parse import parse_qs
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import Field
from .models import StrictModel, Identifier, now
from .ring import RingClient, IntegrationError
from . import vision, providers


class LinkIn(StrictModel):
    nonce: str = Field(min_length=40, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    time: int = Field(gt=0)


class WatchIn(StrictModel):
    device_id: str = Field(min_length=1, max_length=250, pattern=r'^[a-zA-Z0-9_.:-]+$')
    component_id: str = Field(default='', max_length=100, pattern=r'^[a-zA-Z0-9_-]*$')
    delivery_id: Identifier


class Pipeline:
    def __init__(self, db, apply_result):
        self.db, self.apply_result = db, apply_result
        self.media_root = Path(os.getenv('DEMAFUR_MEDIA_DIR') or str(db.data_dir / 'media')).resolve()
        self.ring = RingClient(db.data_dir / 'ring-private' / 'tokens.json')

    def disabled(self, conn):
        row = conn.execute("SELECT value FROM integration_state WHERE key='ring_disabled'").fetchone()
        return row is not None and row['value'] == 'true'

    def status(self):
        with self.db.connect() as conn:
            disabled = self.disabled(conn)
            counts = {r['state']: r['n'] for r in conn.execute('SELECT state,COUNT(*) n FROM ring_jobs GROUP BY state')}
        return {'ring_configured': bool(self.ring.configured()), 'ring_disabled': disabled,
                'vision_enabled': os.getenv('DEMAFUR_VISION_ENABLED') == 'true',
                'vision_configured': providers.configuration(vision=True)['configured'],
                'ai': providers.configuration(vision=True),
                'database': 'postgresql' if self.db.postgres else 'sqlite_local',
                'ffmpeg_available': bool(shutil.which(os.getenv('FFMPEG_PATH') or 'ffmpeg')),
                'jobs': counts, 'hardware_actions': 'simulated',
                'onboarding': 'ring_driven_nonce_linking'}

    def accept(self, raw, signature):
        secret, account = os.getenv('RING_HMAC_SIGNING_KEY'), self.ring.account_id()
        if not secret or not account:
            raise HTTPException(503, 'Ring is not configured')
        expected = 'sha256=' + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature or ''):
            raise HTTPException(401, 'Invalid Ring signature')
        try:
            payload = json.loads(raw)
            meta, data = payload['meta'], payload['data']
            if meta['version'] != '1.1' or meta['account_id'] != account:
                raise HTTPException(403, 'Unsupported version or Ring household')
            kind, source_id = data['type'], data['id']
            if not isinstance(source_id, str) or not 1 <= len(source_id) <= 512:
                raise ValueError()
            sent = datetime.fromisoformat(meta['time'].replace('Z', '+00:00'))
            if sent.tzinfo is None or not -300 <= (now() - sent).total_seconds() <= 86400:
                raise ValueError()
            attrs = data['attributes']
            device = attrs.get('source', '')
            stamp = attrs['timestamp'] if kind in ('motion_detected', 'button_press', 'device_removed', 'app_integration_removed') else attrs.get('timestamp', int(sent.timestamp()*1000))
            occurred = datetime.fromtimestamp(int(stamp) / 1000, timezone.utc)
            if not -300 <= (now() - occurred).total_seconds() <= 86400:
                raise ValueError()
            components = attrs.get('component_ids', [])
            if not isinstance(components, list) or len(components) > 16 or any(not isinstance(c, str) for c in components):
                raise ValueError()
        except (KeyError, ValueError, TypeError, OverflowError, AttributeError):
            raise HTTPException(422, 'Malformed or stale Ring event')
        with self.db.connect(timeout=1) as conn:
            if kind in ('app_integration_removed', 'device_removed'):
                marker = 'ring_lifecycle_' + hashlib.sha256((account + ':' + source_id).encode()).hexdigest()
                if conn.execute('SELECT 1 FROM integration_state WHERE key=?', (marker,)).fetchone():
                    return {'accepted': True, 'duplicate': True}
                conn.execute('INSERT INTO integration_state VALUES(?,?)', (marker, occurred.isoformat()))
                linked = conn.execute("SELECT value FROM integration_state WHERE key='ring_linked_at'").fetchone()
                if linked and occurred.timestamp() < float(linked['value']):
                    return {'accepted': True, 'ignored': 'lifecycle_event_before_latest_link'}
            if kind == 'app_integration_removed':
                conn.execute("INSERT INTO integration_state VALUES('ring_disabled','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value")
                conn.execute("UPDATE ring_jobs SET state='cancelled',claim=NULL WHERE state IN ('queued','retry','processing')")
                conn.execute('DELETE FROM ring_routes')
                self.ring.path.unlink(missing_ok=True)
                for pending in (self.ring.path.parent / 'pending').glob('*.json'):
                    pending.unlink(missing_ok=True)
                return {'accepted': True, 'integration_disabled': True}
            if self.disabled(conn):
                return {'accepted': True, 'ignored': 'integration_disabled'}
            if kind == 'device_removed':
                conn.execute("UPDATE ring_jobs SET state='cancelled',claim=NULL WHERE device_id=? AND state IN ('queued','retry','processing')", (device,))
                conn.execute('DELETE FROM ring_routes WHERE device_id=?', (device,))
                return {'accepted': True, 'device_removed': True}
            if kind not in ('motion_detected', 'button_press'):
                return {'accepted': True, 'ignored': 'non_observation_event'}
            routes = conn.execute('SELECT r.*,d.camera_id FROM ring_routes r JOIN deliveries d ON d.id=r.delivery_id WHERE r.device_id=?', (device,)).fetchall()
            queued = []
            for route in routes:
                component = route['component_id']
                if (components and component not in components) or (not components and component):
                    continue
                job_id = hashlib.sha256(f'{account}:{source_id}:{component}'.encode()).hexdigest()
                fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
                old = conn.execute('SELECT fingerprint FROM ring_jobs WHERE id=?', (job_id,)).fetchone()
                if old:
                    if old['fingerprint'] != fingerprint:
                        raise HTTPException(409, 'Ring event ID reused with different data')
                    continue
                active = conn.execute("SELECT COUNT(*) AS n FROM ring_jobs WHERE state IN ('queued','retry','processing')").fetchone()['n']
                if active >= 100:
                    raise HTTPException(503, 'Analysis queue is full; retry later')
                conn.execute('''INSERT INTO ring_jobs(id,delivery_id,camera_id,device_id,component_id,
                    occurred_at,event_kind,fingerprint,state,available_at,created_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                    (job_id, route['delivery_id'], route['camera_id'], device, component,
                     occurred.isoformat(), 'motion' if kind == 'motion_detected' else 'doorbell',
                     fingerprint, 'queued', max(time.time(), occurred.timestamp() + 65), now().isoformat()))
                normalized = {'event_id': 'ring-' + job_id, 'delivery_id': route['delivery_id'],
                    'camera_id': route['camera_id'], 'kind': 'motion' if kind == 'motion_detected' else 'doorbell',
                    'occurred_at': occurred.isoformat(), 'confidence': 1,
                    'observations': {'duration_seconds': 0, 'looking_around': False},
                    'media_ref': None, 'provenance': 'ring_webhook'}
                count = conn.execute('SELECT COUNT(*) AS n FROM events WHERE delivery_id=?', (route['delivery_id'],)).fetchone()['n']
                if count >= 2000:
                    raise HTTPException(409, 'Delivery event limit reached')
                conn.execute('INSERT INTO events VALUES(?,?,?,?)',
                    (normalized['event_id'], route['delivery_id'], normalized['occurred_at'], json.dumps(normalized)))
                conn.execute('INSERT INTO audit(delivery_id,operation,created_at) VALUES(?,?,?)',
                    (route['delivery_id'], 'ring_event_received', now().isoformat()))
                queued.append(job_id)
            return {'accepted': True, 'queued': queued}

    def clip(self, job):
        # The server creates all filenames; no caller-controlled paths are resolved.
        return self.media_root / (job['id'] + '.mp4')

    def remove_delivery(self, conn, delivery_id):
        for row in conn.execute('SELECT id FROM ring_jobs WHERE delivery_id=?', (delivery_id,)):
            self.clip(row).unlink(missing_ok=True)

    def run_one(self):
        # No provider request while holding a database write lock.
        with self.db.connect() as conn:
            if self.disabled(conn):
                return {'processed': False, 'reason': 'integration_disabled'}
            conn.execute("UPDATE ring_jobs SET state='failed',error='worker_attempts_exhausted',claim=NULL WHERE state='processing' AND lease_until<? AND attempts>=5", (time.time(),))
            row = conn.execute('''SELECT * FROM ring_jobs WHERE
                ((state IN ('queued','retry') AND available_at<=?) OR (state='processing' AND lease_until<?))
                AND attempts<5 ORDER BY occurred_at,id LIMIT 1''', (time.time(), time.time())).fetchone()
            if not row:
                return {'processed': False}
            job = dict(row)
            claim = uuid.uuid4().hex
            conn.execute("UPDATE ring_jobs SET state='processing',attempts=attempts+1,claim=?,lease_until=? WHERE id=?",
                         (claim, time.time()+900, job['id']))
        path = self.clip(job)
        def require_active_claim():
            with self.db.connect() as conn:
                active = conn.execute("SELECT id FROM ring_jobs WHERE id=? AND claim=? AND state='processing'", (job['id'], claim)).fetchone()
                if not active or self.disabled(conn):
                    raise IntegrationError('analysis_cancelled')
        try:
            require_active_claim()
            if os.getenv('DEMAFUR_VISION_ENABLED') != 'true':
                raise IntegrationError('vision_not_enabled')
            if not providers.configuration(vision=True)['configured']:
                raise IntegrationError('vision_not_configured')
            if not shutil.which(os.getenv('FFMPEG_PATH') or 'ffmpeg'):
                raise IntegrationError('ffmpeg_not_installed')
            self.media_root.mkdir(parents=True, exist_ok=True, mode=0o700)
            media = json.loads(job['media']) if job['media'] else None
            analysis = json.loads(job['analysis']) if job['analysis'] else None
            if not media or not path.exists():
                # Atomic rename ensures an interrupted download is never treated as a valid clip.
                with tempfile.TemporaryDirectory(dir=self.media_root) as directory:
                    temporary = Path(directory) / 'download.mp4'
                    media = self.ring.download(job['device_id'], job['component_id'],
                                               int(datetime.fromisoformat(job['occurred_at']).timestamp()*1000), temporary)
                    os.chmod(temporary, 0o600)
                    os.replace(temporary, path)
                analysis = None
            if analysis is None:
                with tempfile.TemporaryDirectory(dir=self.media_root) as directory:
                    frames = vision.sample_frames(path, directory, media['duration_ms'])
                    require_active_claim()
                    analysis = vision.analyze(frames)
                with self.db.connect() as conn:
                    conn.execute('UPDATE ring_jobs SET media=?,analysis=? WHERE id=? AND claim=?',
                                 (json.dumps(media), json.dumps(analysis), job['id'], claim))
            with self.db.connect() as conn:
                current = conn.execute("SELECT * FROM ring_jobs WHERE id=? AND claim=? AND state='processing'", (job['id'], claim)).fetchone()
                if not current or self.disabled(conn):
                    path.unlink(missing_ok=True)
                    return {'processed': False, 'reason': 'cancelled_or_claim_lost'}
                conn.execute("UPDATE ring_jobs SET state='completed',error=NULL,claim=NULL,lease_until=NULL WHERE id=?", (job['id'],))
                self.apply_result(conn, job, media, analysis)
            return {'processed': True, 'id': job['id'], 'state': 'completed'}
        except IntegrationError as error:
            state = 'retry' if error.retryable and job['attempts'] + 1 < 5 else 'failed'
            with self.db.connect() as conn:
                updated = conn.execute('''UPDATE ring_jobs SET state=?,error=?,available_at=?,claim=NULL,lease_until=NULL
                    WHERE id=? AND claim=? AND state='processing' ''',
                    (state, error.code, time.time()+min(900, 30*2**job['attempts']), job['id'], claim))
            if updated.rowcount == 0:
                path.unlink(missing_ok=True)
                return {'processed': False, 'reason': 'cancelled_or_claim_lost'}
            if state == 'failed':
                path.unlink(missing_ok=True)
            return {'processed': True, 'id': job['id'], 'state': state, 'error': error.code}
        except Exception:
            # Recoverable lease state with a sanitized error, no exception details in client output.
            with self.db.connect() as conn:
                conn.execute("UPDATE ring_jobs SET state='failed',error='processing_error',claim=NULL WHERE id=? AND claim=?",
                             (job['id'], claim))
            path.unlink(missing_ok=True)
            return {'processed': True, 'id': job['id'], 'state': 'failed', 'error': 'processing_error'}


def routes(pipeline, owner):
    router = APIRouter()
    auth = [Depends(owner)]

    @router.post('/v1/integrations/ring/token')
    async def token_exchange(request: Request):
        # A code is redeemed only at Ring's fixed OAuth endpoint. Received tokens
        # stay unclaimed until the authenticated homeowner proves the Ring nonce.
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 8192:
                raise HTTPException(413, 'Token callback too large')
        try:
            if request.headers.get('content-type', '').split(';')[0] == 'application/x-www-form-urlencoded':
                code = parse_qs(raw.decode(), strict_parsing=True)['code'][0]
            else:
                code = json.loads(raw)['code']
            if not isinstance(code, str) or not 1 <= len(code) <= 4096:
                raise ValueError()
        except (ValueError, KeyError, TypeError, UnicodeError):
            raise HTTPException(422, 'Expected an authorization code in the code field')
        from starlette.concurrency import run_in_threadpool
        try:
            await run_in_threadpool(pipeline.ring.pending_code, code)
        except IntegrationError as error:
            raise HTTPException(503, error.code)
        return {'received': True, 'owner_link_required': True}

    @router.post('/v1/integrations/ring/link', dependencies=auth)
    def link(data: LinkIn):
        try:
            pipeline.ring.claim(data.nonce, data.time)
        except IntegrationError as error:
            raise HTTPException(400, error.code)
        with pipeline.db.connect() as conn:
            conn.execute("INSERT INTO integration_state VALUES('ring_disabled','false') ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            conn.execute("INSERT INTO integration_state VALUES('ring_linked_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(time.time()),))
        return {'linked': True}

    @router.get('/v1/integrations/status', dependencies=auth)
    def status():
        return pipeline.status()

    @router.get('/v1/integrations/ring/devices', dependencies=auth)
    def devices():
        with pipeline.db.connect() as conn:
            if pipeline.disabled(conn):
                raise HTTPException(409, 'Ring was disconnected; relink it before resuming')
        try:
            return pipeline.ring.devices()
        except IntegrationError as error:
            raise HTTPException(503, error.code)

    @router.post('/v1/integrations/ring/resume', dependencies=auth)
    def resume():
        try:
            pipeline.ring.token(force=True)
            pipeline.ring.devices()
        except IntegrationError as error:
            raise HTTPException(503, error.code)
        with pipeline.db.connect() as conn:
            conn.execute("INSERT INTO integration_state VALUES('ring_disabled','false') ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            conn.execute("INSERT INTO integration_state VALUES('ring_linked_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(time.time()),))
        return {'ring_disabled': False, 'watches_must_be_recreated': True}

    @router.post('/v1/integrations/ring/watch', dependencies=auth, status_code=201)
    def watch(data: WatchIn):
        # Prove device access before accepting a watch. No made-up camera ID is trusted.
        available = devices()
        if data.device_id not in {device['id'] for device in available['data']}:
            raise HTTPException(403, 'Device is not shared with this Ring app')
        camera = 'ring-' + hashlib.sha256(f'{data.device_id}:{data.component_id}'.encode()).hexdigest()[:24]
        with pipeline.db.connect() as conn:
            old = conn.execute('SELECT * FROM deliveries WHERE id=?', (data.delivery_id,)).fetchone()
            if old and old['camera_id'] != camera:
                raise HTTPException(409, 'Delivery belongs to a different camera')
            route = conn.execute('SELECT * FROM ring_routes WHERE device_id=? AND component_id=?', (data.device_id, data.component_id)).fetchone()
            if route and route['delivery_id'] != data.delivery_id:
                raise HTTPException(409, 'Stop the existing watch before tracking another parcel on this camera')
            conn.execute('INSERT INTO deliveries VALUES(?,?,?,NULL,NULL) ON CONFLICT DO NOTHING', (data.delivery_id, camera, now().isoformat()))
            conn.execute('INSERT INTO ring_routes VALUES(?,?,?) ON CONFLICT DO NOTHING', (data.device_id, data.component_id, data.delivery_id))
        return {'delivery_id': data.delivery_id, 'camera_id': camera, 'state': 'watching'}

    @router.delete('/v1/integrations/ring/watch/{delivery_id}', dependencies=auth)
    def stop_watch(delivery_id: str):
        with pipeline.db.connect() as conn:
            conn.execute('DELETE FROM ring_routes WHERE delivery_id=?', (delivery_id,))
            conn.execute("UPDATE ring_jobs SET state='cancelled',claim=NULL WHERE delivery_id=? AND state IN ('queued','retry','processing')", (delivery_id,))
        return {'watching': False}

    @router.post('/v1/webhooks/ring')
    async def webhook(request: Request, x_signature: Annotated[str | None, Header()] = None):
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 65536:
                raise HTTPException(413, 'Ring event exceeds 64 KiB')
        return pipeline.accept(bytes(raw), x_signature)

    @router.get('/v1/analysis/jobs', dependencies=auth)
    def jobs():
        with pipeline.db.connect() as conn:
            items = [dict(r) for r in conn.execute('''SELECT id,delivery_id,occurred_at,state,attempts,error,analysis,media
                FROM ring_jobs ORDER BY created_at DESC LIMIT 100''')]
        for item in items:
            for key in ('analysis', 'media'):
                item[key] = json.loads(item[key]) if item[key] else None
        return {'items': items}

    @router.post('/v1/analysis/process', dependencies=auth)
    def process():
        return pipeline.run_one()

    @router.post('/v1/analysis/jobs/{job_id}/retry', dependencies=auth)
    def retry(job_id: str):
        with pipeline.db.connect() as conn:
            job = conn.execute('SELECT * FROM ring_jobs WHERE id=?', (job_id,)).fetchone()
            if not job:
                raise HTTPException(404, 'Analysis not found')
            if pipeline.disabled(conn) or job['state'] != 'failed':
                raise HTTPException(409, 'Only failed jobs on a linked integration can be retried')
            conn.execute("UPDATE ring_jobs SET state='queued',attempts=0,error=NULL,available_at=? WHERE id=?", (time.time(), job_id))
        return {'state': 'queued'}

    @router.get('/v1/analysis/jobs/{job_id}/clip', dependencies=auth)
    def clip(job_id: str):
        with pipeline.db.connect() as conn:
            job = conn.execute("SELECT * FROM ring_jobs WHERE id=? AND state='completed'", (job_id,)).fetchone()
            if not job or not pipeline.clip(job).is_file():
                raise HTTPException(404, 'Recording not available')
        return FileResponse(pipeline.clip(job), media_type='video/mp4', filename='event-clip.mp4',
                            headers={'Cache-Control': 'no-store'})

    return router
