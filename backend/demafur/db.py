"""Firebase Firestore database layer replacing SQLite/PostgreSQL."""
import os
import json
import time
from pathlib import Path
from contextlib import contextmanager
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter


class Database:
    def __init__(self):
        if not firebase_admin._apps:
            cred_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
            cred_path = os.getenv('FIREBASE_CREDENTIALS')
            if cred_json:
                cred = credentials.Certificate(json.loads(cred_json))
            elif cred_path:
                cred = credentials.Certificate(cred_path)
            else:
                raise RuntimeError(
                    'Set FIREBASE_CREDENTIALS (path) or FIREBASE_CREDENTIALS_JSON (JSON string)')
            firebase_admin.initialize_app(cred)

        self.fs = firestore.client()
        self.data_dir = Path(os.getenv('DEMAFUR_DATA_DIR') or './data')
        # Kept for any code that checks db.postgres
        self.postgres = False

    @contextmanager
    def connect(self, timeout=10):
        """Yields self for backward compatibility with `with db.connect() as conn:`."""
        yield self

    # ---- Deliveries ----

    def get_delivery(self, delivery_id):
        doc = self.fs.collection('deliveries').document(delivery_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        data.setdefault('id', delivery_id)
        return data

    def create_delivery(self, delivery_id, camera_id, created_at,
                        resolution=None, resolved_at=None):
        ref = self.fs.collection('deliveries').document(delivery_id)
        if ref.get().exists:
            return  # ON CONFLICT DO NOTHING
        ref.set({
            'id': delivery_id, 'camera_id': camera_id,
            'created_at': created_at,
            'resolution': resolution, 'resolved_at': resolved_at
        })

    def update_delivery(self, delivery_id, **fields):
        self.fs.collection('deliveries').document(delivery_id).update(fields)

    def delete_delivery(self, delivery_id):
        # Delete the delivery and all related subcollection data
        batch = self.fs.batch()
        batch.delete(self.fs.collection('deliveries').document(delivery_id))
        # Cascade: events, pickups, actions, evidence, audit, ring_routes, ring_jobs
        for coll in ('events', 'pickups', 'actions', 'audit', 'ring_jobs'):
            for doc in self.fs.collection(coll).where(
                    filter=FieldFilter('delivery_id', '==', delivery_id)).stream():
                batch.delete(doc.reference)
        ev = self.fs.collection('evidence').document(delivery_id).get()
        if ev.exists:
            batch.delete(ev.reference)
        for doc in self.fs.collection('ring_routes').where(
                filter=FieldFilter('delivery_id', '==', delivery_id)).stream():
            batch.delete(doc.reference)
        batch.commit()

    def list_deliveries(self, limit=None, offset=0):
        query = self.fs.collection('deliveries').order_by(
            'created_at', direction=firestore.Query.DESCENDING)
        docs = list(query.stream())
        if offset:
            docs = docs[offset:]
        if limit:
            docs = docs[:limit]
        return [self._with_id(d) for d in docs]

    def all_deliveries(self):
        """All deliveries ordered newest first (for dashboard bulk reads)."""
        return self.list_deliveries()

    # ---- Events ----

    def get_event(self, event_id):
        doc = self.fs.collection('events').document(event_id).get()
        return doc.to_dict() if doc.exists else None

    def create_event(self, event_id, delivery_id, occurred_at, payload):
        ref = self.fs.collection('events').document(event_id)
        if ref.get().exists:
            return  # ON CONFLICT DO NOTHING
        ref.set({
            'id': event_id, 'delivery_id': delivery_id,
            'occurred_at': occurred_at, 'payload': payload
        })

    def count_events(self, delivery_id):
        docs = self.fs.collection('events').where(
            filter=FieldFilter('delivery_id', '==', delivery_id)).stream()
        return sum(1 for _ in docs)

    def list_events_for_delivery(self, delivery_id):
        """Events for a delivery, ordered by occurred_at ascending."""
        docs = self.fs.collection('events').where(
            filter=FieldFilter('delivery_id', '==', delivery_id)
        ).order_by('occurred_at').stream()
        return [doc.to_dict() for doc in docs]

    def list_all_events_ordered(self):
        """All events ordered by occurred_at, id ascending (for dashboard)."""
        docs = self.fs.collection('events').order_by('occurred_at').stream()
        return [doc.to_dict() for doc in docs]

    def list_recent_events(self, limit=20):
        """Recent events, newest first."""
        docs = self.fs.collection('events').order_by(
            'occurred_at', direction=firestore.Query.DESCENDING
        ).limit(limit).stream()
        return [doc.to_dict() for doc in docs]

    # ---- Pickups ----

    def get_pickup(self, pickup_id):
        doc = self.fs.collection('pickups').document(pickup_id).get()
        return doc.to_dict() if doc.exists else None

    def create_pickup(self, pickup_id, delivery_id, starts_at, ends_at,
                      created_at, revoked=0):
        self.fs.collection('pickups').document(pickup_id).set({
            'id': pickup_id, 'delivery_id': delivery_id,
            'starts_at': starts_at, 'ends_at': ends_at,
            'created_at': created_at, 'revoked': revoked
        })

    def update_pickup(self, pickup_id, **fields):
        self.fs.collection('pickups').document(pickup_id).update(fields)

    def list_pickups(self, delivery_id=None, limit=None):
        query = self.fs.collection('pickups')
        if delivery_id:
            query = query.where(
                filter=FieldFilter('delivery_id', '==', delivery_id))
        docs = query.stream()
        result = [doc.to_dict() for doc in docs]
        if limit:
            result = result[:limit]
        return result

    def list_pickups_descending(self, limit=100):
        docs = self.fs.collection('pickups').order_by(
            'starts_at', direction=firestore.Query.DESCENDING
        ).limit(limit).stream()
        return [doc.to_dict() for doc in docs]

    def all_pickups(self):
        """All pickups (for dashboard bulk reads)."""
        return [doc.to_dict() for doc in
                self.fs.collection('pickups').stream()]

    # ---- Actions ----

    def get_action(self, action_id):
        doc = self.fs.collection('actions').document(action_id).get()
        return doc.to_dict() if doc.exists else None

    def create_action(self, action_id, delivery_id, kind, status, reason,
                      created_at):
        ref = self.fs.collection('actions').document(action_id)
        if ref.get().exists:
            return  # ON CONFLICT DO NOTHING
        ref.set({
            'id': action_id, 'delivery_id': delivery_id,
            'kind': kind, 'status': status,
            'reason': reason, 'created_at': created_at
        })

    def update_action(self, action_id, **fields):
        self.fs.collection('actions').document(action_id).update(fields)

    def list_actions(self, delivery_id=None, status=None, limit=200):
        query = self.fs.collection('actions')
        if delivery_id:
            query = query.where(
                filter=FieldFilter('delivery_id', '==', delivery_id))
        if status:
            query = query.where(filter=FieldFilter('status', '==', status))
        query = query.order_by(
            'created_at', direction=firestore.Query.DESCENDING)
        if limit:
            query = query.limit(limit)
        return [doc.to_dict() for doc in query.stream()]

    def find_action(self, delivery_id, kind):
        """Find action by delivery + kind (replaces UNIQUE constraint lookup)."""
        docs = list(self.fs.collection('actions')
                    .where(filter=FieldFilter('delivery_id', '==', delivery_id))
                    .where(filter=FieldFilter('kind', '==', kind))
                    .limit(1).stream())
        return docs[0].to_dict() if docs else None

    # ---- Evidence ----

    def get_evidence(self, delivery_id):
        doc = self.fs.collection('evidence').document(delivery_id).get()
        return doc.to_dict() if doc.exists else None

    def set_evidence(self, delivery_id, created_at, payload):
        self.fs.collection('evidence').document(delivery_id).set({
            'delivery_id': delivery_id,
            'created_at': created_at, 'payload': payload
        })

    def delete_evidence(self, delivery_id):
        self.fs.collection('evidence').document(delivery_id).delete()

    # ---- Ring Routes ----

    def get_ring_route(self, device_id, component_id=''):
        doc_id = f'{device_id}_{component_id}'
        doc = self.fs.collection('ring_routes').document(doc_id).get()
        return doc.to_dict() if doc.exists else None

    def set_ring_route(self, device_id, component_id, delivery_id):
        doc_id = f'{device_id}_{component_id}'
        self.fs.collection('ring_routes').document(doc_id).set({
            'device_id': device_id,
            'component_id': component_id,
            'delivery_id': delivery_id
        })

    def delete_ring_routes(self, device_id=None, delivery_id=None):
        query = self.fs.collection('ring_routes')
        if device_id:
            query = query.where(
                filter=FieldFilter('device_id', '==', device_id))
        if delivery_id:
            query = query.where(
                filter=FieldFilter('delivery_id', '==', delivery_id))
        for doc in query.stream():
            doc.reference.delete()

    def delete_all_ring_routes(self):
        for doc in self.fs.collection('ring_routes').stream():
            doc.reference.delete()

    def list_ring_routes(self, device_id=None):
        query = self.fs.collection('ring_routes')
        if device_id:
            query = query.where(
                filter=FieldFilter('device_id', '==', device_id))
        return [doc.to_dict() for doc in query.stream()]

    def list_ring_routes_with_camera(self, device_id):
        """Join ring_routes with deliveries to get camera_id."""
        routes = self.list_ring_routes(device_id=device_id)
        for route in routes:
            delivery = self.get_delivery(route['delivery_id'])
            route['camera_id'] = delivery['camera_id'] if delivery else None
        return routes

    # ---- Integration State ----

    def get_state(self, key):
        doc = self.fs.collection('integration_state').document(key).get()
        if doc.exists:
            return doc.to_dict().get('value')
        return None

    def set_state(self, key, value):
        self.fs.collection('integration_state').document(key).set({
            'key': key, 'value': value
        })

    # ---- Ring Jobs ----

    def get_ring_job(self, job_id):
        doc = self.fs.collection('ring_jobs').document(job_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        data.setdefault('id', job_id)
        return data

    def create_ring_job(self, job_id, **fields):
        fields['id'] = job_id
        self.fs.collection('ring_jobs').document(job_id).set(fields)

    def update_ring_job(self, job_id, **fields):
        self.fs.collection('ring_jobs').document(job_id).update(fields)

    def list_ring_jobs(self, delivery_id=None, state=None, limit=100):
        query = self.fs.collection('ring_jobs')
        if delivery_id:
            query = query.where(
                filter=FieldFilter('delivery_id', '==', delivery_id))
        if state:
            query = query.where(filter=FieldFilter('state', '==', state))
        query = query.order_by(
            'created_at', direction=firestore.Query.DESCENDING)
        if limit:
            query = query.limit(limit)
        result = [doc.to_dict() for doc in query.stream()]
        for r in result:
            r.setdefault('id', r.get('id'))
        return result

    def count_ring_jobs_active(self):
        """Count jobs in queued/retry/processing states."""
        count = 0
        for state in ('queued', 'retry', 'processing'):
            docs = self.fs.collection('ring_jobs').where(
                filter=FieldFilter('state', '==', state)).stream()
            count += sum(1 for _ in docs)
        return count

    def next_ready_job(self):
        """Get the next job ready for processing.

        Looks for queued/retry jobs past their available_at time,
        or processing jobs past their lease_until time.
        """
        now_ts = time.time()
        # Check queued/retry jobs
        for state in ('queued', 'retry'):
            docs = list(self.fs.collection('ring_jobs')
                        .where(filter=FieldFilter('state', '==', state))
                        .where(filter=FieldFilter('available_at', '<=', now_ts))
                        .where(filter=FieldFilter('attempts', '<', 5))
                        .order_by('occurred_at')
                        .limit(1).stream())
            if docs:
                data = docs[0].to_dict()
                data.setdefault('id', docs[0].id)
                return data
        # Check expired leases
        docs = list(self.fs.collection('ring_jobs')
                    .where(filter=FieldFilter('state', '==', 'processing'))
                    .where(filter=FieldFilter('lease_until', '<', now_ts))
                    .where(filter=FieldFilter('attempts', '<', 5))
                    .order_by('occurred_at')
                    .limit(1).stream())
        if docs:
            data = docs[0].to_dict()
            data.setdefault('id', docs[0].id)
            return data
        return None

    def expire_exhausted_jobs(self):
        """Mark processing jobs with 5+ attempts as failed."""
        now_ts = time.time()
        docs = self.fs.collection('ring_jobs') \
            .where(filter=FieldFilter('state', '==', 'processing')) \
            .where(filter=FieldFilter('lease_until', '<', now_ts)) \
            .stream()
        for doc in docs:
            data = doc.to_dict()
            if data.get('attempts', 0) >= 5:
                doc.reference.update({
                    'state': 'failed',
                    'error': 'worker_attempts_exhausted',
                    'claim': None
                })

    def cancel_active_jobs(self, delivery_id=None, device_id=None):
        """Cancel queued/retry/processing jobs."""
        for state in ('queued', 'retry', 'processing'):
            query = self.fs.collection('ring_jobs').where(
                filter=FieldFilter('state', '==', state))
            if delivery_id:
                query = query.where(
                    filter=FieldFilter('delivery_id', '==', delivery_id))
            if device_id:
                query = query.where(
                    filter=FieldFilter('device_id', '==', device_id))
            for doc in query.stream():
                doc.reference.update({
                    'state': 'cancelled', 'claim': None
                })

    def cancel_all_active_jobs(self):
        """Cancel all active jobs (for integration disconnect)."""
        self.cancel_active_jobs()

    def list_completed_jobs(self, delivery_id):
        """Completed jobs for a delivery, ordered by occurred_at."""
        docs = self.fs.collection('ring_jobs') \
            .where(filter=FieldFilter('delivery_id', '==', delivery_id)) \
            .where(filter=FieldFilter('state', '==', 'completed')) \
            .order_by('occurred_at').stream()
        result = [doc.to_dict() for doc in docs]
        for r in result:
            r.setdefault('id', r.get('id'))
        return result

    def job_states_for_delivery(self, delivery_id):
        """Get all job states for a delivery."""
        docs = self.fs.collection('ring_jobs').where(
            filter=FieldFilter('delivery_id', '==', delivery_id)).stream()
        return [doc.to_dict().get('state') for doc in docs]

    # ---- Audit ----

    def add_audit(self, delivery_id, operation, created_at):
        self.fs.collection('audit').add({
            'delivery_id': delivery_id,
            'operation': operation, 'created_at': created_at
        })

    def list_audit(self, delivery_id):
        docs = self.fs.collection('audit').where(
            filter=FieldFilter('delivery_id', '==', delivery_id)
        ).order_by('created_at').stream()
        return [doc.to_dict() for doc in docs]

    # ---- Helpers ----

    @staticmethod
    def _with_id(doc_snapshot):
        data = doc_snapshot.to_dict()
        data.setdefault('id', doc_snapshot.id)
        return data


def timeline(db, delivery_id):
    """Return parsed event payloads for a delivery, ordered by occurred_at."""
    events = db.list_events_for_delivery(delivery_id)
    return [json.loads(e['payload']) for e in events]
