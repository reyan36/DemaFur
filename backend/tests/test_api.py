import hashlib
import hmac
import io
import json
import sqlite3
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from demafur.app import create_app
from demafur.models import now

KEY = 'owner-test-key-123456789012345'
SECRET = 'bridge-test-secret-123456789012345'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    app = create_app(tmp_path / 'test.db', KEY, SECRET)
    with TestClient(app, headers={'Authorization': f'Bearer {KEY}'}) as c:
        yield c


def event(kind='package_delivered', eid='e1', delivery='d1', **overrides):
    return {'event_id': eid, 'delivery_id': delivery, 'camera_id': 'front',
            'kind': kind, 'occurred_at': (now() - timedelta(seconds=1)).isoformat(), **overrides}


def send(client, **kwargs):
    response = client.post('/v1/events', json=event(**kwargs))
    assert response.status_code == 201, response.text
    return response.json()['delivery']


def test_auth(client):
    assert client.get('/health', headers={'Authorization': ''}).status_code == 200
    assert client.get('/v1/deliveries', headers={'Authorization': ''}).status_code == 401
    assert client.get('/v1/deliveries', headers={'Authorization': 'Bearer wrong'}).status_code == 401


def test_duplicate_conflict_and_camera(client):
    data = event()
    assert client.post('/v1/events', json=data).status_code == 201
    assert client.post('/v1/events', json=data).status_code == 200
    data['kind'] = 'motion'
    assert client.post('/v1/events', json=data).status_code == 409
    assert client.post('/v1/events', json=event(eid='e2', camera_id='other')).status_code == 409
    assert len(client.get('/v1/deliveries/d1').json()['timeline']) == 1


def test_concurrent_retries(client):
    data = event()
    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = list(pool.map(lambda _: client.post('/v1/events', json=data).status_code, range(6)))
    assert codes.count(201) == 1
    assert codes.count(200) == 5


def test_removal_uncertain_no_evidence(client):
    send(client)
    view = send(client, kind='package_removed', eid='e2')
    assert view['risk']['level'] == 'needs_confirmation'
    assert view['status'] == 'needs_confirmation'
    assert client.get('/v1/deliveries/d1/evidence').status_code == 409
    rows = client.get('/v1/actions').json()['items']
    assert [r['kind'] for r in rows] == ['notify_owner']


def test_expected_pickup_cancels_action(client):
    send(client, kind='package_removed')
    view = client.post('/v1/deliveries/d1/confirmation', json={'outcome': 'expected'}).json()
    assert view['status'] == 'collected'
    assert client.get('/v1/actions').json()['items'][0]['status'] == 'cancelled'
    assert client.post('/v1/actions/dispatch').json()['dispatched'] == 0


def test_trusted_window_and_owner_override(client):
    send(client)
    window = client.post('/v1/pickup-windows', json={'delivery_id': 'd1',
        'starts_at': (now() - timedelta(minutes=1)).isoformat(),
        'ends_at': (now() + timedelta(hours=1)).isoformat()})
    assert window.status_code == 201
    view = send(client, kind='package_removed', eid='e2', occurred_at=now().isoformat())
    assert view['status'] == 'collected'
    assert client.get('/v1/actions').json()['items'] == []
    view = client.post('/v1/deliveries/d1/confirmation', json={'outcome': 'missing'}).json()
    assert view['status'] == 'incident'
    assert client.get('/v1/deliveries/d1/evidence').status_code == 200


def test_other_delivery_not_covered(client):
    send(client)
    client.post('/v1/pickup-windows', json={'delivery_id': 'd1', 'starts_at': now().isoformat(),
        'ends_at': (now() + timedelta(hours=1)).isoformat()})
    view = send(client, kind='package_removed', eid='e2', delivery='d2')
    assert view['risk']['level'] == 'needs_confirmation'


def test_retroactive_window_rejected(client):
    send(client, kind='package_removed')
    r = client.post('/v1/pickup-windows', json={'delivery_id': 'd1', 'starts_at': now().isoformat(),
        'ends_at': (now() + timedelta(hours=1)).isoformat()})
    assert r.status_code == 409


def test_late_removal_not_retroactively_authorized(client):
    send(client)
    client.post('/v1/pickup-windows', json={'delivery_id': 'd1',
        'starts_at': (now() - timedelta(hours=1)).isoformat(),
        'ends_at': (now() + timedelta(hours=1)).isoformat()})
    view = send(client, kind='package_removed', eid='e2', occurred_at=(now() - timedelta(minutes=5)).isoformat())
    assert view['status'] == 'needs_confirmation'


def test_suspicious_approval_and_dispatch(client):
    send(client)
    for i in range(3):
        send(client, kind='person_approached', eid=f'a{i}')
    view = send(client, kind='person_lingering', eid='linger', observations={'duration_seconds': 120})
    assert view['risk']['level'] == 'suspicious'
    rows = client.get('/v1/actions').json()['items']
    lights = next(r for r in rows if r['kind'] == 'turn_on_lights')
    assert lights['status'] == 'pending_approval'
    assert client.post('/v1/actions/dispatch').json()['dispatched'] == 1
    assert client.post(f"/v1/actions/{lights['id']}/decision", json={'approved': True}).status_code == 200
    assert client.post('/v1/actions/dispatch').json()['dispatched'] == 1
    assert client.post('/v1/actions/dispatch').json()['dispatched'] == 0
    assert client.post(f"/v1/actions/{lights['id']}/decision", json={'approved': True}).status_code == 409


def test_low_confidence(client):
    view = send(client, kind='package_removed', confidence=.3)
    assert view['risk']['level'] == 'normal'
    assert 'Low-confidence' in ' '.join(view['risk']['reasons'])


def test_out_of_order_and_old_behavior(client):
    send(client, kind='package_removed', eid='e2')
    view = send(client, occurred_at=(now() - timedelta(hours=3)).isoformat())
    assert [e['event_id'] for e in view['timeline']] == ['e1', 'e2']
    for i in range(4):
        view = send(client, kind='person_approached', eid=f'old{i}', occurred_at=(now() - timedelta(hours=4)).isoformat())
    assert view['risk']['score'] == 35


def test_unattended(client):
    view = send(client, occurred_at=(now() - timedelta(hours=3)).isoformat())
    assert view['risk']['level'] == 'needs_confirmation'
    assert view['status'] == 'delivered'


def test_evidence_export_and_retraction(client):
    send(client, media_ref='recordings/clip-1.mp4')
    client.post('/v1/deliveries/d1/confirmation', json={'outcome': 'missing'})
    data = client.get('/v1/deliveries/d1/evidence.zip')
    assert data.status_code == 200
    with zipfile.ZipFile(io.BytesIO(data.content)) as z:
        manifest = json.loads(z.read('sha256-manifest.json'))
        for name, digest in manifest.items():
            assert hashlib.sha256(z.read(name)).hexdigest() == digest
        bundle = json.loads(z.read('evidence.json'))
        assert bundle['clip_extraction'] == 'not_configured'
        assert not bundle['submitted']
    client.post('/v1/deliveries/d1/confirmation', json={'outcome': 'expected'})
    assert client.get('/v1/deliveries/d1/evidence').status_code == 409


def test_webhook(client):
    raw = json.dumps(event()).encode()
    stamp = str(int(time.time()))
    signature = hmac.new(SECRET.encode(), stamp.encode() + b'.' + raw, hashlib.sha256).hexdigest()
    headers = {'X-Demafur-Timestamp': stamp, 'X-Demafur-Signature': signature, 'Authorization': ''}
    assert client.post('/v1/webhooks/events', content=raw, headers=headers).status_code == 201
    assert client.post('/v1/webhooks/events', content=raw, headers=headers).status_code == 200
    assert client.post('/v1/webhooks/events', content=raw+b' ', headers=headers).status_code == 401
    headers['X-Demafur-Timestamp'] = '1'
    assert client.post('/v1/webhooks/events', content=raw, headers=headers).status_code == 401


@pytest.mark.parametrize('updates', [
    {'face_id': 'someone'}, {'observations': {'identity': 'owner'}},
    {'confidence': 2}, {'occurred_at': '2026-01-01T12:00:00'},
    {'occurred_at': (now() + timedelta(hours=1)).isoformat()}, {'media_ref': 'http://localhost/private'},
])
def test_validation(client, updates):
    assert client.post('/v1/events', json=event(**updates)).status_code == 422


def test_delete_cascades(client):
    send(client)
    client.post('/v1/deliveries/d1/confirmation', json={'outcome': 'missing'})
    assert client.delete('/v1/deliveries/d1').status_code == 200
    assert client.get('/v1/deliveries/d1').status_code == 404
    assert client.get('/v1/actions').json()['items'] == []


def test_summary_and_intents(client):
    send(client)
    assert client.get('/v1/deliveries/d1/summary').json()['source'] == 'policy_template'
    assert 'delivered' in client.post('/v1/assistant/query', json={'intent': 'package_status'}).json()['text']


def test_persistence_and_retention(tmp_path):
    path = tmp_path / 'persistent.db'
    with TestClient(create_app(path, KEY, SECRET), headers={'Authorization': f'Bearer {KEY}'}) as c:
        send(c, occurred_at=(now() - timedelta(days=40)).isoformat())
    with sqlite3.connect(path) as conn:
        conn.execute('UPDATE deliveries SET created_at=?', ((now() - timedelta(days=40)).isoformat(),))
    with TestClient(create_app(path, KEY, SECRET), headers={'Authorization': f'Bearer {KEY}'}) as c:
        assert c.get('/v1/deliveries/d1').status_code == 200
        assert c.post('/v1/maintenance').json()['deleted_deliveries'] == 1
        assert c.get('/v1/deliveries/d1').status_code == 404


def test_expired_and_revoked_windows(client):
    send(client)
    bad = client.post('/v1/pickup-windows', json={'delivery_id': 'd1',
        'starts_at': (now() - timedelta(hours=2)).isoformat(),
        'ends_at': (now() - timedelta(hours=1)).isoformat()})
    assert bad.status_code == 422
    window = client.post('/v1/pickup-windows', json={'delivery_id': 'd1',
        'starts_at': now().isoformat(), 'ends_at': (now() + timedelta(hours=1)).isoformat()}).json()
    assert client.delete('/v1/pickup-windows/' + window['id']).status_code == 200
    assert send(client, kind='package_removed', eid='e2', occurred_at=now().isoformat())['status'] == 'needs_confirmation'


def test_ai_failure_falls_back(client, monkeypatch):
    import httpx
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setenv('OPENAI_MODEL', 'test-model')
    def unavailable(*args, **kwargs):
        raise httpx.ConnectError('provider unavailable')
    monkeypatch.setattr('demafur.ai.httpx.post', unavailable)
    send(client)
    response = client.get('/v1/deliveries/d1/summary').json()
    assert response['source'] == 'policy_template'
    assert response['ai_unavailable'] is True


def test_ai_payload_minimized(client, monkeypatch):
    import httpx
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setenv('OPENAI_MODEL', 'test-model')
    def provider(*args, **kwargs):
        assert kwargs['json']['store'] is False
        assert 'camera_id' not in kwargs['json']['input']
        assert 'media_ref' not in kwargs['json']['input']
        return httpx.Response(200, request=httpx.Request('POST', args[0]),
            json={'output': [{'content': [{'type': 'output_text', 'text': 'Package delivered.'}]}]})
    monkeypatch.setattr('demafur.ai.httpx.post', provider)
    send(client, media_ref='private/recording.mp4')
    assert client.get('/v1/deliveries/d1/summary').json()['source'] == 'openai'
