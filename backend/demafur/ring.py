"""Server-side Ring Partner API adapter. No unofficial consumer-account API."""
import base64
import hashlib
import hmac
import json
import os
import threading
import time
from pathlib import Path
from urllib.parse import quote
import httpx

API = 'https://api.amazonvision.com'
OAUTH = 'https://oauth.ring.com/oauth/token'
MAX_CLIP_BYTES = 32 * 1024 * 1024


class IntegrationError(Exception):
    def __init__(self, code, retryable=False):
        self.code, self.retryable = code, retryable
        super().__init__(code)


class RingClient:
    """One linked household per deployment. Refresh tokens rotate into a private file.

    Initial account linking is performed through the Ring developer app. Supply its
    authorized refresh token and account ID through deployment secrets. Never expose
    tokens to the browser. Use an encrypted volume/secret store in deployment.
    """
    def __init__(self, token_path, transport=None):
        self.path = Path(token_path)
        self.lock = threading.RLock()
        self.transport = transport

    def account_id(self):
        configured = os.getenv('RING_ACCOUNT_ID')
        if configured:
            return configured
        try:
            identity = self.path if self.path.exists() else self.path.parent / 'account.json'
            return json.loads(identity.read_text()).get('account_id') if identity.exists() else None
        except (ValueError, OSError):
            return None

    def configured(self):
        return all(os.getenv(k) for k in ('RING_CLIENT_ID', 'RING_CLIENT_SECRET', 'RING_HMAC_SIGNING_KEY')) and bool(self.account_id()) and (
            self.path.exists() or bool(os.getenv('RING_REFRESH_TOKEN')))

    def save(self, path, payload):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_suffix('.tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as handle:
            json.dump(payload, handle)
        os.replace(temporary, path)

    def pending_code(self, code):
        if not all(os.getenv(k) for k in ('RING_CLIENT_ID', 'RING_CLIENT_SECRET', 'RING_HMAC_SIGNING_KEY')):
            raise IntegrationError('ring_app_not_configured')
        with self.lock:
            folder = self.path.parent / 'pending'
            folder.mkdir(parents=True, exist_ok=True, mode=0o700)
            for path in folder.glob('*.json'):
                if time.time() - path.stat().st_mtime > 600:
                    path.unlink()
            if len(list(folder.glob('*.json'))) >= 10:
                raise IntegrationError('ring_pending_links_full')
            try:
                with self._http() as client:
                    response = client.post(OAUTH, data={'grant_type': 'authorization_code', 'code': code,
                        'client_id': os.environ['RING_CLIENT_ID'], 'client_secret': os.environ['RING_CLIENT_SECRET']})
                    self._check(response)
                    tokens = response.json()
                    access, refresh = tokens['access_token'], tokens['refresh_token']
                    expiry = float(tokens['expires_in'])
                    if not access or not refresh or not 120 < expiry <= 86400:
                        raise ValueError()
                    profile = client.get(API + '/v1/users/me', headers={'Authorization': f'Bearer {access}'})
                    self._check(profile)
                    account = profile.json()['data']['id']
                    if not isinstance(account, str) or not account:
                        raise ValueError()
                    if self.account_id() and self.account_id() != account:
                        raise IntegrationError('ring_account_mismatch')
                filename = hashlib.sha256(account.encode()).hexdigest() + '.json'
                self.save(folder / filename, {'account_id': account, 'access_token': access,
                    'refresh_token': refresh, 'expires_at': time.time() + expiry, 'created_at': time.time()})
            except httpx.HTTPError:
                raise IntegrationError('ring_network_error', True)
            except (KeyError, ValueError, TypeError):
                raise IntegrationError('ring_invalid_response')

    def claim(self, nonce, timestamp):
        secret = os.getenv('RING_HMAC_SIGNING_KEY')
        if not secret:
            raise IntegrationError('ring_app_not_configured')
        age = time.time() - timestamp / 1000
        if not 0 <= age <= 600:
            raise IntegrationError('ring_link_expired')
        with self.lock:
            for path in (self.path.parent / 'pending').glob('*.json'):
                tokens = json.loads(path.read_text())
                if time.time() - tokens['created_at'] > 600:
                    path.unlink(missing_ok=True)
                    continue
                expected = base64.urlsafe_b64encode(hmac.new(secret.encode(),
                    f"{timestamp}:{tokens['account_id']}".encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
                if not hmac.compare_digest(expected, nonce):
                    continue
                if self.account_id() and self.account_id() != tokens['account_id']:
                    raise IntegrationError('ring_account_mismatch')
                try:
                    with self._http() as client:
                        headers = {'Authorization': 'Bearer ' + tokens['access_token']}
                        response = client.post(API + '/v1/accounts/me/app-integrations', headers=headers,
                                               json={'nonce': nonce})
                        self._check(response)
                        response = client.patch(API + '/v1/accounts/me/app-integrations', headers=headers,
                                                json={'status': 'completed'})
                        self._check(response)
                    self.save(self.path, tokens)
                    self.save(self.path.parent / 'account.json', {'account_id': tokens['account_id']})
                    path.unlink()
                    return
                except httpx.HTTPError:
                    raise IntegrationError('ring_network_error', True)
            raise IntegrationError('ring_link_not_found_or_used')

    def _http(self):
        return httpx.Client(timeout=httpx.Timeout(60, connect=10), follow_redirects=False,
                            transport=self.transport)

    def _check(self, response):
        if response.status_code not in (200, 206):
            # Do not expose provider response bodies, URLs, or credentials in errors.
            raise IntegrationError(f'ring_http_{response.status_code}',
                                   response.status_code in (408, 416, 429, 500, 502, 503, 504))

    def token(self, force=False):
        if not self.configured():
            raise IntegrationError('ring_not_configured')
        with self.lock:
            tokens = json.loads(self.path.read_text()) if self.path.exists() else {
                'refresh_token': os.getenv('RING_REFRESH_TOKEN')}
            if not force and tokens.get('expires_at', 0) > time.time() + 120:
                return tokens['access_token']
            try:
                with self._http() as client:
                    response = client.post(OAUTH, data={
                        'grant_type': 'refresh_token', 'refresh_token': tokens['refresh_token'],
                        'client_id': os.environ['RING_CLIENT_ID'],
                        'client_secret': os.environ['RING_CLIENT_SECRET']})
                    self._check(response)
                    updated = response.json()
                    access, refresh = updated['access_token'], updated['refresh_token']
                    expiry = float(updated['expires_in'])
                    if not access or not refresh or not 120 < expiry <= 86400:
                        raise ValueError('invalid token response')
                    # Verify the provider token is for the configured household.
                    profile = client.get(API + '/v1/users/me', headers={'Authorization': f'Bearer {access}'})
                    self._check(profile)
                    if profile.json()['data']['id'] != self.account_id():
                        raise IntegrationError('ring_account_mismatch')
                self.save(self.path, {'access_token': access, 'refresh_token': refresh,
                                     'expires_at': time.time() + expiry, 'account_id': profile.json()['data']['id']})
                return access
            except httpx.HTTPError:
                raise IntegrationError('ring_network_error', True)
            except (KeyError, ValueError, TypeError):
                raise IntegrationError('ring_invalid_response')

    def devices(self):
        try:
            for attempt in range(2):
                with self._http() as client:
                    response = client.get(API + '/v1/devices?include=capabilities',
                        headers={'Authorization': f'Bearer {self.token(force=bool(attempt))}'})
                if response.status_code == 401 and attempt == 0:
                    continue
                self._check(response)
                payload = response.json()
                if not isinstance(payload.get('data'), list):
                    raise IntegrationError('ring_invalid_response')
                return payload
        except httpx.HTTPError:
            raise IntegrationError('ring_network_error', True)
        except (ValueError, TypeError):
            raise IntegrationError('ring_invalid_response')

    def download(self, device, component, timestamp_ms, path):
        body = {'timestamp': timestamp_ms, 'duration': 60000,
                'video_options': {'codec': 'avc', 'frame_rate': 10,
                                  'resolution': {'width': 640, 'height': 360}},
                'audio_options': {'audio_enabled': False}}
        if component:
            body['components'] = [{'component_id': component}]
        path = Path(path)
        try:
            for attempt in range(2):
                with self._http() as client:
                    with client.stream('POST', API + '/v1/devices/' + quote(device, safe='') + '/media/video/download',
                        headers={'Authorization': f'Bearer {self.token(force=bool(attempt))}'}, json=body) as response:
                        if response.status_code == 401 and attempt == 0:
                            continue
                        self._check(response)
                        if response.headers.get('content-type', '').split(';')[0] != 'video/mp4':
                            raise IntegrationError('ring_invalid_media')
                        if 'x-media-timestamp' not in response.headers:
                            raise IntegrationError('ring_media_missing_timestamp')
                        actual = int(response.headers['x-media-timestamp'])
                        duration = int(response.headers.get('x-media-length', 60000))
                        if response.status_code == 206 and 'x-media-length' not in response.headers:
                            raise IntegrationError('ring_partial_media_missing_duration')
                        if abs(actual - timestamp_ms) > 60000 or not 0 < duration <= 60000:
                            raise IntegrationError('ring_invalid_media_timing')
                        size = 0
                        deadline = time.monotonic() + 90
                        with path.open('wb') as file:
                            for chunk in response.iter_bytes():
                                if time.monotonic() > deadline:
                                    raise IntegrationError('ring_download_timeout', True)
                                size += len(chunk)
                                if size > MAX_CLIP_BYTES:
                                    raise IntegrationError('ring_clip_too_large')
                                file.write(chunk)
                        if size < 16:
                            raise IntegrationError('ring_empty_media', True)
                        return {'start_ms': actual, 'duration_ms': duration,
                                'partial': response.status_code == 206, 'bytes': size}
        except httpx.HTTPError:
            raise IntegrationError('ring_network_error', True)
        except (ValueError, TypeError):
            raise IntegrationError('ring_invalid_media_timing')
