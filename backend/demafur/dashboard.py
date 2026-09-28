"""Read-only dashboard projection using the same policy as delivery details."""
import json
from collections import defaultdict
from .models import now
from .risk import assess


def overview(conn, activity_limit=20, delivery_limit=20):
    clock = now()
    events, windows = defaultdict(list), defaultdict(list)
    # Bulk reads avoid querying every delivery separately. Retention bounds this
    # single-household dataset; multi-household deployments need scoped projections.
    for row in conn.execute('SELECT delivery_id,payload FROM events ORDER BY occurred_at,id'):
        events[row['delivery_id']].append(json.loads(row['payload']))
    for row in conn.execute('SELECT * FROM pickups'):
        windows[row['delivery_id']].append(dict(row))
    active, historical, incidents, pending = [], 0, 0, 0
    for row in conn.execute('SELECT * FROM deliveries ORDER BY created_at DESC,id'):
        view = {**dict(row), **assess(events[row['id']], windows[row['id']], row['resolution'], clock)}
        if view['status'] in ('collected', 'incident'):
            historical += 1
        else:
            active.append(view)
        incidents += view['status'] == 'incident'
        pending += view['status'] == 'needs_confirmation'
    recent = conn.execute('SELECT payload FROM events ORDER BY occurred_at DESC,id DESC LIMIT ?', (activity_limit,))
    return {'activePackages': len(active), 'historicalPackages': historical,
            'activeIncidents': incidents, 'pendingConfirmations': pending,
            'recentActivity': [json.loads(row['payload']) for row in recent],
            'activeDeliveries': active[:delivery_limit],
            'activeDeliveriesTruncated': len(active) > delivery_limit,
            'generatedAt': clock.isoformat()}
