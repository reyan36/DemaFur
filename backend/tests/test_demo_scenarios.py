import copy
import json
from datetime import datetime, timezone
import httpx
import pytest
from fastapi.testclient import TestClient
from demafur.app import create_app
from demo_scenarios import seed, verify, cleanup, validate_url

KEY = 'demo-scenarios-owner-key-1234567890'
SECRET = 'demo-scenarios-webhook-key-1234567890'


@pytest.fixture
def client():
    with TestClient(create_app(KEY, SECRET), headers={'Authorization':'Bearer '+KEY}) as client:
        yield client


def test_scenarios_evidence_and_scoped_cleanup(client, tmp_path):
    # Unrelated data must survive both seeding and cleanup.
    client.post('/v1/events', json={'event_id':'real-event', 'delivery_id':'real-parcel',
        'camera_id':'real-camera', 'kind':'package_delivered',
        'occurred_at':datetime.now(timezone.utc).isoformat()})
    path = tmp_path/'manifest.json'
    data = seed(client, path, 'http://localhost:8000')
    result = verify(client, data, tmp_path/'results')
    assert result['real_camera_or_ai_verified'] is False
    assert result['evidence_checksums_verified']
    assert result['scenarios']['uncertain']['risk'] == 'needs_confirmation'
    assert result['scenarios']['missing']['risk'] == 'high_risk'
    assert len(list((tmp_path/'results').glob('*.zip'))) == 1
    stats = client.get('/v1/dashboard').json()
    assert stats['activePackages'] == 3
    assert stats['historicalPackages'] == 2
    assert stats['pendingConfirmations'] == stats['activeIncidents'] == 1
    assert len(client.get('/v1/deliveries').json()['items']) == 5
    assert cleanup(client, data) == 4
    assert cleanup(client, data) == 0
    assert client.get('/v1/deliveries/real-parcel').status_code == 200
    assert json.loads(path.read_text())['state'] == 'seeded'


def test_manifest_cannot_be_overwritten(client, tmp_path):
    path = tmp_path/'manifest.json'
    data = seed(client, path, 'http://localhost:8000')
    with pytest.raises(FileExistsError):
        seed(client, path, 'http://localhost:8000')
    assert len(client.get('/v1/deliveries').json()['items']) == 4
    assert json.loads(path.read_text()) == data


def test_cleanup_rejects_unrelated_ids_and_camera(client, tmp_path):
    data = seed(client, tmp_path/'manifest.json', 'http://localhost:8000')
    tampered = copy.deepcopy(data)
    tampered['deliveries']['normal'] = 'real-parcel'
    with pytest.raises(ValueError):
        cleanup(client, tampered)
    db = client.app.state.pipeline.db
    db.update_delivery(data['deliveries']['missing'], camera_id='different-camera')
    with pytest.raises(RuntimeError, match='camera'):
        cleanup(client, data)
    # Preflight checks all four before deletion.
    assert len(client.get('/v1/deliveries').json()['items']) == 4


def test_partial_run_keeps_manifest_for_cleanup(client, tmp_path):
    path = tmp_path/'manifest.json'
    class FailingClient:
        def get(self, *args, **kwargs):
            return client.get(*args, **kwargs)
        def post(self, path, **kwargs):
            if path == '/v1/pickup-windows':
                return httpx.Response(503)
            return client.post(path, **kwargs)
    with pytest.raises(RuntimeError, match='503'):
        seed(FailingClient(), path, 'http://localhost:8000')
    data = json.loads(path.read_text())
    assert data['state'] == 'in_progress'
    assert cleanup(client, data) == 2


def test_expected_confirmation_retracts_incident_evidence(client, tmp_path):
    data = seed(client, tmp_path/'manifest.json', 'http://localhost:8000')
    incident = data['deliveries']['missing']
    assert client.post('/v1/deliveries/'+incident+'/confirmation', json={'outcome':'expected'}).status_code == 200
    assert client.get('/v1/deliveries/'+incident+'/evidence.zip').status_code == 409
    with pytest.raises(RuntimeError, match='status'):
        verify(client, data, tmp_path/'results')


@pytest.mark.parametrize('url', ['http://remote.example', 'https://user:password@example.com',
                                'https://example.com?key=secret', 'file:///tmp/test'])
def test_reject_unsafe_target(url):
    with pytest.raises(ValueError):
        validate_url(url)
