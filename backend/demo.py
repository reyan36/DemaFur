"""Run against a running API; writes an example evidence bundle to the current directory."""
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx

base = os.getenv('DEMAFUR_URL', 'http://127.0.0.1:8000')
key, secret = os.environ['DEMAFUR_API_KEY'], os.environ['DEMAFUR_WEBHOOK_SECRET']
delivery = 'demo-' + uuid.uuid4().hex[:10]
anchor = datetime.now(timezone.utc) - timedelta(minutes=5)
with httpx.Client(base_url=base, headers={'Authorization': f'Bearer {key}'}, timeout=30) as client:
    for index, kind in enumerate(['package_delivered', 'person_approached', 'person_approached',
                                 'person_approached', 'person_lingering', 'package_removed']):
        data = {'event_id': f'{delivery}-{index}', 'delivery_id': delivery, 'camera_id': 'front-door',
                'kind': kind, 'occurred_at': (anchor + timedelta(seconds=index * 30)).isoformat(),
                'observations': {'duration_seconds': 120 if kind == 'person_lingering' else 0},
                'media_ref': f'recordings/{delivery}/{index}.mp4'}
        raw = json.dumps(data).encode()
        stamp = str(int(time.time()))
        signature = hmac.new(secret.encode(), stamp.encode() + b'.' + raw, hashlib.sha256).hexdigest()
        response = client.post('/v1/webhooks/events', content=raw, headers={
            'X-Demafur-Timestamp': stamp, 'X-Demafur-Signature': signature, 'Content-Type': 'application/json'})
        response.raise_for_status()
        print(kind, '→', response.json()['delivery']['risk']['level'])
    response = client.post(f'/v1/deliveries/{delivery}/confirmation', json={'outcome': 'missing'})
    response.raise_for_status()
    response = client.get(f'/v1/deliveries/{delivery}/evidence.zip')
    response.raise_for_status()
    path = Path(f'{delivery}-evidence.zip')
    path.write_bytes(response.content)
    print('Evidence export:', path.resolve())
    print('No hardware actions or external reports were sent.')
