-- Run once with a trusted migration connection, not a browser/client API key.
CREATE SCHEMA IF NOT EXISTS demafur;
REVOKE ALL ON SCHEMA demafur FROM PUBLIC;
SET LOCAL search_path TO demafur, pg_catalog;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS workflow_lock (id INTEGER PRIMARY KEY CHECK(id=1));
INSERT INTO workflow_lock VALUES(1) ON CONFLICT DO NOTHING;


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
 state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at DOUBLE PRECISION NOT NULL,
 lease_until DOUBLE PRECISION, claim TEXT, error TEXT, media TEXT, analysis TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ring_jobs_ready ON ring_jobs(state,available_at);
CREATE TABLE IF NOT EXISTS audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
 operation TEXT NOT NULL, created_at TEXT NOT NULL
);

-- Browser clients must use FastAPI. Do not expose this schema through Supabase Data API.
REVOKE ALL ON ALL TABLES IN SCHEMA demafur FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA demafur FROM PUBLIC;
