"""Every test uses the in-memory database, so tests never touch the real Firestore."""
import pytest


@pytest.fixture(autouse=True)
def local_database(tmp_path, monkeypatch):
    monkeypatch.setenv('DEMAFUR_LOCAL_DB', 'memory')
    monkeypatch.setenv('DEMAFUR_DATA_DIR', str(tmp_path / 'data'))
    # Most tests check the owner-approval flow; auto-deter tests turn it on explicitly.
    monkeypatch.setenv('DEMAFUR_AUTO_DETER', 'false')
    # Read caching is tested on its own; elsewhere every read sees the latest data.
    monkeypatch.setenv('DEMAFUR_READ_CACHE_SECONDS', '0')
