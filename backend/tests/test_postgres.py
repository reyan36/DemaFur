"""Real PostgreSQL tests run in CI or against an explicitly supplied test database."""
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from demafur.app import create_app
from demafur.db import Database, PostgresConnection
from demafur.migrate import migrate
from demafur.models import now


KEY='postgres-test-owner-key-1234567890'
SECRET='postgres-test-webhook-secret-12345'


def test_parameters_stay_bound():
    class RecordingConnection:
        def execute(self, sql, params):
            self.sql,self.params=sql,params
    raw=RecordingConnection()
    value="untrusted'; DROP TABLE deliveries; --"
    PostgresConnection(raw).execute('SELECT id FROM deliveries WHERE id=?',(value,))
    assert raw.sql == 'SELECT id FROM deliveries WHERE id=%s'
    assert raw.params == (value,)
    assert value not in raw.sql


def test_production_does_not_silently_fall_back_to_sqlite(monkeypatch):
    monkeypatch.delenv('DATABASE_URL',raising=False)
    monkeypatch.delenv('DEMAFUR_ALLOW_SQLITE',raising=False)
    with pytest.raises(RuntimeError,match='DATABASE_URL'):
        create_app(api_key=KEY,webhook_secret=SECRET)


def test_postgres_path_never_becomes_filesystem_path(monkeypatch,tmp_path):
    @contextmanager
    def connection(self,timeout=10):
        class Fake:
            def execute(self,*args):return self
            def fetchone(self):return {'version':1}
        yield Fake()
    monkeypatch.setattr(Database,'connect',connection)
    monkeypatch.setenv('DEMAFUR_DATA_DIR',str(tmp_path/'media-volume'))
    database=Database('postgresql://user:secret@host/db')
    assert database.postgres
    assert database.data_dir == tmp_path/'media-volume'
    assert not hasattr(database,'path')


@pytest.fixture
def pg_client(monkeypatch,tmp_path):
    url=os.getenv('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL is required for a real PostgreSQL test')
    # CI uses a dedicated disposable database, not a production Supabase instance.
    if not url.split('?',1)[0].endswith('/demafur_test'):
        pytest.fail('Integration tests require a dedicated database named demafur_test')
    monkeypatch.setenv('DEMAFUR_DATA_DIR',str(tmp_path))
    monkeypatch.setenv('AI_PROVIDER','bedrock')
    migrate(url)
    migrate(url)  # idempotent migrations
    database=Database(url)
    with database.connect() as conn:
        conn.execute('DELETE FROM deliveries')
    app=create_app(url,KEY,SECRET)
    with TestClient(app,headers={'Authorization':f'Bearer {KEY}'}) as client:
        yield client


def event():
    return {'event_id':'pg-event','delivery_id':'pg-delivery','camera_id':'camera',
            'kind':'package_removed','occurred_at':now().isoformat()}


def test_postgres_workflow(pg_client):
    data=event()
    assert pg_client.post('/v1/events',json=data).status_code == 201
    assert pg_client.post('/v1/events',json=data).status_code == 200
    assert pg_client.get('/ready').json()['database'] == 'postgresql'
    assert pg_client.get('/v1/deliveries/pg-delivery').json()['status'] == 'needs_confirmation'
    pg_client.post('/v1/deliveries/pg-delivery/confirmation',json={'outcome':'missing'})
    assert pg_client.get('/v1/deliveries/pg-delivery/evidence.zip').status_code == 200
    assert pg_client.get('/v1/deliveries/pg-delivery/audit').json()['items'][0]['id'] > 0
    pg_client.post('/v1/deliveries/pg-delivery/confirmation',json={'outcome':'expected'})
    assert pg_client.get('/v1/deliveries/pg-delivery/evidence').status_code == 409
    pg_client.delete('/v1/deliveries/pg-delivery')
    assert pg_client.get('/v1/actions').json()['items'] == []


def test_postgres_concurrent_retries(pg_client):
    data=event()
    with ThreadPoolExecutor(max_workers=5) as pool:
        results=list(pool.map(lambda _:pg_client.post('/v1/events',json=data).status_code,range(5)))
    assert results.count(201) == 1
    assert results.count(200) == 4
