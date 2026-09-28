from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from demafur.app import create_app
from demafur.models import now

KEY = 'dashboard-test-owner-key-123456789'

@pytest.fixture
def client(tmp_path, monkeypatch):
    for name in ('RING_CLIENT_ID', 'RING_CLIENT_SECRET', 'RING_REFRESH_TOKEN'):
        monkeypatch.delenv(name, raising=False)
    app = create_app(tmp_path/'db.sqlite3', KEY, 'dashboard-test-webhook-key-123456789')
    with TestClient(app, headers={'Authorization': f'Bearer {KEY}'}) as client:
        yield client


def send(client, delivery, kind='package_delivered', suffix='delivered', seconds=0):
    response = client.post('/v1/events', json={'event_id': delivery+'-'+suffix,
        'delivery_id': delivery, 'camera_id': 'test-camera', 'kind': kind,
        'occurred_at': (now()-timedelta(seconds=seconds)).isoformat()})
    assert response.status_code == 201


def test_empty_and_auth(client):
    assert client.get('/v1/dashboard', headers={'Authorization': ''}).status_code == 401
    response = client.get('/v1/dashboard')
    assert response.headers['cache-control'] == 'no-store'
    data = response.json()
    assert data['activePackages'] == data['historicalPackages'] == data['activeIncidents'] == 0
    assert data['recentActivity'] == data['activeDeliveries'] == []
    assert data['monitoringStatus'] == 'offline'


def test_lifecycle_and_limits(client):
    for name in ('outside', 'collected', 'incident', 'pending'):
        send(client, name, seconds=10)
    for name in ('collected', 'incident', 'pending'):
        send(client, name, 'package_removed', 'removed')
    client.post('/v1/deliveries/collected/confirmation', json={'outcome':'expected'})
    client.post('/v1/deliveries/incident/confirmation', json={'outcome':'missing'})
    data = client.get('/v1/dashboard?activity_limit=2&delivery_limit=1').json()
    assert (data['activePackages'], data['historicalPackages'], data['activeIncidents'], data['pendingConfirmations']) == (2,2,1,1)
    assert len(data['recentActivity']) == 2
    assert len(data['activeDeliveries']) == 1
    assert data['activeDeliveriesTruncated']
    assert data['recentActivity'][0]['kind'] == 'package_removed'
    for view in data['activeDeliveries']:
        detail = client.get('/v1/deliveries/'+view['id']).json()
        assert view['status'] == detail['status']
        assert view['risk']['level'] == detail['risk']['level']
    for query in ('activity_limit=0', 'delivery_limit=101', 'activity_limit=abc'):
        assert client.get('/v1/dashboard?'+query).status_code == 422


def test_trusted_pickup_and_deletion(client):
    send(client, 'trusted')
    clock = now()
    assert client.post('/v1/pickup-windows', json={'delivery_id':'trusted',
        'starts_at':(clock-timedelta(minutes=1)).isoformat(),
        'ends_at':(clock+timedelta(minutes=5)).isoformat()}).status_code == 201
    send(client, 'trusted', 'package_removed', 'removed')
    data = client.get('/v1/dashboard').json()
    assert data['historicalPackages'] == 1
    assert data['activePackages'] == data['pendingConfirmations'] == 0
    client.delete('/v1/deliveries/trusted')
    data = client.get('/v1/dashboard').json()
    assert data['historicalPackages'] == 0
    assert data['recentActivity'] == []


def test_deployment_smoke_script(client):
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location('smoke_test', Path(__file__).parents[1]/'smoke_test.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.run(client)
    assert client.get('/v1/dashboard').json()['recentActivity'] == []
