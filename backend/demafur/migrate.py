"""Apply versioned PostgreSQL migrations with a migration-only DB credential."""
import hashlib
import os
from pathlib import Path


def postgres_connection(url):
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        raise RuntimeError('Install requirements.txt to enable PostgreSQL (psycopg).') from None
    return psycopg.connect(url, row_factory=dict_row, prepare_threshold=None,
        connect_timeout=10, sslmode=os.getenv('DATABASE_SSLMODE') or 'require')


def migrate(url):
    if not url.startswith(('postgresql://', 'postgres://')):
        raise ValueError('A PostgreSQL DATABASE_URL is required')
    with postgres_connection(url) as conn:
        # Serialize concurrent deploy migrations; transaction lock works with poolers.
        conn.execute('SELECT pg_advisory_xact_lock(17425003)')
        conn.execute('CREATE SCHEMA IF NOT EXISTS demafur')
        conn.execute('CREATE TABLE IF NOT EXISTS demafur.schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)')
        for path in sorted((Path(__file__).parent/'migrations').glob('*.sql')):
            version = int(path.stem.split('_')[0])
            sql = path.read_text()
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            existing = conn.execute('SELECT checksum FROM demafur.schema_migrations WHERE version=%s', (version,)).fetchone()
            if existing:
                if existing['checksum'] != checksum:
                    raise RuntimeError('Applied migration was modified; add a new migration instead')
                continue
            # Migration files are repository-controlled statements without procedural blocks.
            for statement in sql.split(';'):
                if statement.strip():
                    conn.execute(statement)
            conn.execute('INSERT INTO demafur.schema_migrations VALUES(%s,%s)', (version, checksum))


if __name__ == '__main__':
    migrate(os.environ.get('MIGRATION_DATABASE_URL') or os.environ['DATABASE_URL'])
    print('PostgreSQL migrations applied. No credentials printed.')
