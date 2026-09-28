"""Exercise a deployed API with one synthetic parcel; clean up that parcel only."""
import getpass
import os
import uuid
from datetime import datetime, timezone
import httpx


def run(client):
    def check(response, code=200):
        if response.status_code != code:
            raise RuntimeError(f'Unexpected HTTP {response.status_code}; expected {code}')
        return response

    check(client.get('/ready'))
    parcel = 'smoke-' + uuid.uuid4().hex
    created = False
    try:
        for index, kind in enumerate(('package_delivered', 'package_removed')):
            event = {'event_id': parcel+f'-{index}', 'delivery_id': parcel,
                     'camera_id': 'smoke-camera', 'kind': kind,
                     'occurred_at': datetime.now(timezone.utc).isoformat(), 'confidence': 1}
            # Mark for cleanup before the request in case the response is lost.
            created = True
            check(client.post('/v1/events', json=event), 201)
            check(client.post('/v1/events', json=event), 200)
        view = check(client.get('/v1/deliveries/'+parcel)).json()
        if view['status'] != 'needs_confirmation' or len(view['timeline']) != 2:
            raise RuntimeError('Delivery state or idempotency check failed')
        check(client.get('/v1/dashboard'))
        check(client.post('/v1/deliveries/'+parcel+'/confirmation', json={'outcome':'expected'}))
        if check(client.get('/v1/deliveries/'+parcel)).json()['status'] != 'collected':
            raise RuntimeError('Owner confirmation check failed')
    finally:
        if created:
            try:
                response = client.delete('/v1/deliveries/'+parcel)
            except httpx.HTTPError:
                raise RuntimeError(f'Cleanup could not connect; remove synthetic delivery {parcel} when connectivity returns') from None
            if response.status_code not in (200, 204, 404):
                raise RuntimeError(f'Cleanup failed for synthetic delivery {parcel}: HTTP {response.status_code}')
    print('PASS: readiness, create/read, duplicate handling, dashboard, confirmation and cleanup.')


if __name__ == '__main__':
    url = os.getenv('DEMAFUR_URL') or input('Backend HTTPS URL: ').strip()
    parsed = httpx.URL(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password:
        raise SystemExit('Use an HTTPS URL without credentials.')
    key = os.getenv('DEMAFUR_API_KEY') or getpass.getpass('DemaFur API key (hidden): ')
    print('Creates one synthetic parcel and deletes it afterward. No AI or hardware calls are made.')
    try:
        with httpx.Client(base_url=url.rstrip('/'), headers={'Authorization':'Bearer '+key}, timeout=30, follow_redirects=False) as client:
            run(client)
    except (httpx.HTTPError, RuntimeError) as error:
        # Never print headers, response bodies, or credentials.
        raise SystemExit('Smoke test failed: '+ (str(error) if isinstance(error, RuntimeError) else type(error).__name__)) from None
