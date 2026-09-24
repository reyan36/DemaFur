import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = '''
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS deliveries (
 id TEXT PRIMARY KEY, camera_id TEXT NOT NULL, created_at TEXT NOT NULL,
 resolution TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 occurred_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_delivery ON events(delivery_id, occurred_at);
CREATE TABLE IF NOT EXISTS pickups (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS actions (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(delivery_id, kind)
);
CREATE TABLE IF NOT EXISTS evidence (
 delivery_id TEXT PRIMARY KEY REFERENCES deliveries(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 operation TEXT NOT NULL, created_at TEXT NOT NULL
);
'''


class Database:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            # Serialize read-modify-write workflows, including concurrent retries.
            conn.execute('BEGIN IMMEDIATE')
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def timeline(conn, delivery_id):
    return [json.loads(r['payload']) for r in conn.execute(
        'SELECT payload FROM events WHERE delivery_id=? ORDER BY occurred_at,id', (delivery_id,))]
