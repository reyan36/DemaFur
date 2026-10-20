"""Sends edge events to the DemaFur backend as signed webhooks, on a background thread."""
import hashlib
import hmac
import json
import queue
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx

# How sure we are that the event happened. These come from multi-frame rules, not from a
# single detector score (the backend ignores events below 0.7).
CONFIDENCE = {'package_delivered': 0.8, 'person_approached': 0.85, 'person_lingering': 0.85,
              'package_touched': 0.85, 'package_removed': 0.85, 'person_left': 0.85, 'entered_home': 0.8}


class Bridge:
    def __init__(self, url, secret, delivery_id, camera_id='front-door', on_deterrents=None):
        self.url = url.rstrip('/') + '/v1/webhooks/events'
        self.secret = secret.encode()
        self.delivery_id, self.camera_id = delivery_id, camera_id
        self.started_at = datetime.now(timezone.utc)   # video time 0 = this moment
        self.count = 0
        self.outbox = queue.Queue()
        self.worker = threading.Thread(target=self._run, daemon=True)
        self.worker.start()
        self.on_deterrents = on_deterrents

    def send(self, event):
        """Queue an event; returns immediately so the video never waits for the network."""
        self.count += 1
        observations = {key: event[key] for key in ('carried_package', 'came_from_door', 'box') if key in event}
        if event.get('person_id') is not None:
            observations['track_id'] = event['person_id']
        if 'duration_seconds' in event:
            observations['duration_seconds'] = event['duration_seconds']
        self.outbox.put({
            'event_id': f'{self.delivery_id}-{self.count:03d}-{event["kind"]}',
            'delivery_id': self.delivery_id,
            'camera_id': self.camera_id,
            'kind': event['kind'],
            'occurred_at': (self.started_at + timedelta(seconds=event['t'])).isoformat(),
            'confidence': CONFIDENCE.get(event['kind'], 0.8),
            'observations': observations,
        })

    def _run(self):
        with httpx.Client(timeout=90) as client:   # Render can take ~60 s to wake up
            while True:
                payload = self.outbox.get()
                if payload is None:
                    return
                raw = json.dumps(payload).encode()
                stamp = str(int(time.time()))
                signature = hmac.new(self.secret, stamp.encode() + b'.' + raw, hashlib.sha256).hexdigest()
                try:
                    response = client.post(self.url, content=raw, headers={
                        'Content-Type': 'application/json',
                        'X-Demafur-Timestamp': stamp, 'X-Demafur-Signature': signature})
                    risk = response.json().get('delivery', {}).get('risk', {}) if response.is_success else {}
                    print(f'  -> backend {response.status_code} {payload["kind"]}'
                          + (f'  risk={risk.get("level")} ({risk.get("score")})' if risk else f'  {response.text[:120]}'))
                    # Ignore late replies about an earlier delivery (e.g. the previous lap of a looping video).
                    if response.is_success and self.on_deterrents and payload['delivery_id'] == self.delivery_id:
                        actions = response.json()['delivery'].get('auto_deterrents') or []
                        if actions:
                            self.on_deterrents(actions)
                except httpx.HTTPError as error:
                    print(f'  -> backend unreachable ({type(error).__name__}); {payload["kind"]} not sent')

    def close(self, wait=30):
        """Finish sending what is queued (up to `wait` seconds)."""
        self.outbox.put(None)
        self.worker.join(wait)