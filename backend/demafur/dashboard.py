"""Read-only dashboard projection using the same policy as delivery details."""
import json
from collections import defaultdict
from .models import now
from .risk import assess


def overview(db, activity_limit=20, delivery_limit=20):
    clock = now()

    # Bulk reads across all events and pickups
    events = defaultdict(list)
    for row in db.list_all_events_ordered():
        events[row['delivery_id']].append(json.loads(row['payload']))

    windows = defaultdict(list)
    for row in db.all_pickups():
        windows[row['delivery_id']].append(row)

    active, historical, incidents, pending = [], 0, 0, 0
    for row in db.all_deliveries():
        view = {**row, **assess(
            events[row['id']], windows[row['id']],
            row.get('resolution'), clock)}
        if view['status'] in ('collected', 'incident'):
            historical += 1
        else:
            active.append(view)
        incidents += view['status'] == 'incident'
        pending += view['status'] == 'needs_confirmation'

    recent = db.list_recent_events(limit=activity_limit)
    return {
        'activePackages': len(active),
        'historicalPackages': historical,
        'activeIncidents': incidents,
        'pendingConfirmations': pending,
        'recentActivity': [json.loads(row['payload']) for row in recent],
        'activeDeliveries': active[:delivery_limit],
        'activeDeliveriesTruncated': len(active) > delivery_limit,
        'generatedAt': clock.isoformat()}
