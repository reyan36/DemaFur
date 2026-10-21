"""Read-only dashboard projection using the same policy as delivery details."""
import json
from collections import defaultdict
from .models import now
from .risk import assess


def coverage(assessment, states):
    """Footage analysis coverage from the delivery's Ring job states; notes it in the risk reasons."""
    result = ('unavailable' if 'failed' in states
              else 'pending' if any(s in ('queued', 'retry', 'processing') for s in states)
              else 'sampled_frames' if 'completed' in states
              else 'not_analyzed')
    if result in ('unavailable', 'pending'):
        assessment['risk']['reasons'].append(
            'Footage analysis is ' + result
            + '; the current score is not an all-clear assessment.')
    return result


def _events_and_windows(db):
    """Bulk reads across all events and pickups, grouped by delivery."""
    events = defaultdict(list)
    for row in db.list_all_events_ordered():
        events[row['delivery_id']].append(json.loads(row['payload']))

    windows = defaultdict(list)
    for row in db.all_pickups():
        windows[row['delivery_id']].append(row)
    return events, windows


def deliveries_page(db, limit=50, offset=0):
    """Delivery list with the same fields as delivery details (minus the timeline).

    Reads each collection once instead of running several queries per delivery, which took
    over ten seconds for fifty deliveries on Firestore.
    """
    clock = now()
    events, windows = _events_and_windows(db)
    states = defaultdict(list)
    for job in db.list_ring_jobs(limit=0):
        states[job.get('delivery_id')].append(job.get('state'))
    items = []
    for row in db.list_deliveries(limit=limit, offset=offset):
        assessment = assess(events[row['id']], windows[row['id']], row.get('resolution'), clock)
        items.append({**row, **assessment,
                      'analysis_coverage': coverage(assessment, states[row['id']])})
    return items


def overview(db, activity_limit=20, delivery_limit=20):
    clock = now()
    events, windows = _events_and_windows(db)

    active, historical, incidents, pending = [], 0, 0, 0
    for row in db.all_deliveries():
        view = {**row, **assess(
            events[row['id']], windows[row['id']],
            row.get('resolution'), clock)}
        if view['status'] in ('collected', 'incident'):
            historical += 1
        else:
            active.append(view)
        # Active incidents: owner-reported missing, or a high-risk removal still awaiting the owner.
        incidents += view['status'] == 'incident' or view['risk']['level'] == 'high_risk'
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
