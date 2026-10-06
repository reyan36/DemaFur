"""The production database is Firestore; local mode must be an explicit choice."""
import pytest
from demafur.app import create_app

KEY = 'database-test-owner-key-1234567890'
SECRET = 'database-test-webhook-secret-12345'


def test_production_requires_firebase_credentials(monkeypatch):
    monkeypatch.delenv('DEMAFUR_LOCAL_DB', raising=False)
    monkeypatch.delenv('FIREBASE_CREDENTIALS', raising=False)
    monkeypatch.delenv('FIREBASE_CREDENTIALS_JSON', raising=False)
    with pytest.raises(RuntimeError, match='FIREBASE_CREDENTIALS'):
        create_app(KEY, SECRET)


def test_local_mode_starts_empty_and_separate(monkeypatch):
    first, second = create_app(KEY, SECRET), create_app(KEY, SECRET)
    first.state.pipeline.db.create_delivery('d1', 'cam', '2026-01-01T00:00:00+00:00')
    assert second.state.pipeline.db.get_delivery('d1') is None