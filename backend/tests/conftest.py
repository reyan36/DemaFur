"""Every test uses the in-memory database, so tests never touch the real Firestore."""
import pytest


@pytest.fixture(autouse=True)
def local_database(tmp_path, monkeypatch):
    monkeypatch.setenv('DEMAFUR_LOCAL_DB', 'memory')
    monkeypatch.setenv('DEMAFUR_DATA_DIR', str(tmp_path / 'data'))