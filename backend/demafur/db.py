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
CREATE TABLE IF NOT EXISTS ring_routes (
 device_id TEXT NOT NULL, component_id TEXT NOT NULL DEFAULT '',
 delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 PRIMARY KEY(device_id, component_id)
);
CREATE TABLE IF NOT EXISTS integration_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ring_jobs (
 id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 camera_id TEXT NOT NULL, device_id TEXT NOT NULL, component_id TEXT NOT NULL,
 occurred_at TEXT NOT NULL, event_kind TEXT NOT NULL, fingerprint TEXT NOT NULL,
 state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at REAL NOT NULL,
 lease_until REAL, claim TEXT, error TEXT, media TEXT, analysis TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ring_jobs_ready ON ring_jobs(state,available_at);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 operation TEXT NOT NULL, created_at TEXT NOT NULL
);
'''


class PostgresConnection:
    """Only adapts placeholders in our static SQL; values remain driver-bound."""
    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, params=()):
        return self.connection.execute(sql.replace('?', '%s'), params)


class Database:
    def __init__(self, source):
        import os
        self.postgres = str(source).startswith(('postgresql://', 'postgres://'))
        self.source = str(source)
        # Files must never be derived from a database URL containing credentials.
        self.data_dir = Path(os.getenv('DEMAFUR_DATA_DIR') or ('./data' if self.postgres else str(Path(source).parent)))
        if self.postgres:
            with self.connect() as conn:
                version = conn.execute('SELECT version FROM schema_migrations WHERE version=1').fetchone()
                if not version:
                    raise RuntimeError('Database migrations are missing; run python -m demafur.migrate')
        else:
            self.path = str(source)
            Path(source).parent.mkdir(parents=True, exist_ok=True)
            with self.connect() as conn:
                conn.executescript(SCHEMA)

    @contextmanager
    def connect(self, timeout=10):
        if self.postgres:
            from .migrate import postgres_connection
            with postgres_connection(self.source) as conn:
                conn.execute("SELECT set_config('lock_timeout', %s, true)", (str(int(timeout*1000))+'ms',))
                conn.execute('SET LOCAL search_path TO demafur, pg_catalog')
                # Transaction-scoped row lock keeps existing single-household workflows
                # atomic across API processes. Never held during provider requests.
                conn.execute('SELECT id FROM workflow_lock WHERE id=1 FOR UPDATE')
                yield PostgresConnection(conn)
            return
        conn = sqlite3.connect(self.path, timeout=timeout)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
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
