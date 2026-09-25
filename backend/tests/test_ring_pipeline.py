import hashlib
import hmac
import io
import json
import os
import time
import zipfile
from datetime import timedelta
from pathlib import Path
import httpx
import pytest
from fastapi.testclient import TestClient
from demafur.app import create_app
from demafur.models import now
from demafur.ring import RingClient, IntegrationError
from demafur.vision import analyze

OWNER = 'owner-for-ring-tests-1234567890'
SIGNING = 'ring-signing-secret-for-tests'
ACCOUNT = 'ava1.ring.account.test'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'openai')
    for name, value in {'RING_CLIENT_ID': 'client', 'RING_CLIENT_SECRET': 'client-secret',
        'RING_ACCOUNT_ID': ACCOUNT, 'RING_HMAC_SIGNING_KEY': SIGNING, 'RING_REFRESH_TOKEN': 'refresh-secret',
        'DEMAFUR_VISION_ENABLED': 'true', 'OPENAI_API_KEY': 'vision-secret', 'OPENAI_VISION_MODEL': 'test-model',
        'DEMAFUR_MEDIA_DIR': str(tmp_path/'media')}.items():
        monkeypatch.setenv(name, value)
    app = create_app(tmp_path/'test.db', OWNER, 'internal-webhook-secret-1234567')
    monkeypatch.setattr(app.state.pipeline.ring, 'devices', lambda: {'data': [{'id': 'ava1.device.camera'}]})
    with TestClient(app, headers={'Authorization': f'Bearer {OWNER}'}) as client:
        yield client


def watch(client, **overrides):
    return client.post('/v1/integrations/ring/watch', json={
        'device_id': 'ava1.device.camera', 'delivery_id': 'parcel1', **overrides})


def payload(kind='motion_detected', event_id='ring-native-1', **attrs):
    return {'meta': {'version': '1.1', 'time': now().isoformat(), 'request_id': 'request1', 'account_id': ACCOUNT},
            'data': {'id': event_id, 'type': kind, 'attributes': {
                'source': 'ava1.device.camera', 'timestamp': int((now()-timedelta(minutes=2)).timestamp()*1000), **attrs}}}


def post(client, data, signature=None):
    raw = json.dumps(data).encode()
    signed = signature or 'sha256=' + hmac.new(SIGNING.encode(), raw, hashlib.sha256).hexdigest()
    return client.post('/v1/webhooks/ring', content=raw, headers={'X-Signature': signed, 'Authorization': ''})


def test_ring_native_signature_account_and_dedup(client):
    assert watch(client).status_code == 201
    data = payload()
    assert post(client, data, 'sha256=invalid').status_code == 401
    data['meta']['account_id'] = 'another-household'
    assert post(client, data).status_code == 403
    data['meta']['account_id'] = ACCOUNT
    first = post(client, data)
    assert first.status_code == 200
    assert len(first.json()['queued']) == 1
    # A retransmission can have a new request ID but the same source event.
    data['meta']['request_id'] = 'retry-request'
    assert post(client, data).json()['queued'] == []
    assert len(client.get('/v1/analysis/jobs').json()['items']) == 1
    timeline = client.get('/v1/deliveries/parcel1').json()['timeline']
    assert timeline[0]['kind'] == 'motion'
    assert timeline[0]['provenance'] == 'ring_webhook'
    data['data']['attributes']['timestamp'] += 1
    assert post(client, data).status_code == 409


def test_webhook_no_provider_work(client, monkeypatch):
    watch(client)
    def forbidden(*args, **kwargs):
        raise AssertionError('Network work must not run in webhook')
    monkeypatch.setattr(client.app.state.pipeline.ring, 'download', forbidden)
    assert post(client, payload()).status_code == 200


def test_components_routing_and_scope(client):
    assert watch(client, device_id='another-camera').status_code == 403
    assert watch(client, component_id='2').status_code == 201
    assert post(client, payload(component_ids=['1'])).json()['queued'] == []
    assert len(post(client, payload(component_ids=['2'])).json()['queued']) == 1
    assert watch(client, component_id='2', delivery_id='another-parcel').status_code == 409


def test_stale_oversized_and_unknown_events(client):
    watch(client)
    data = payload(); data['meta']['time'] = (now()-timedelta(days=2)).isoformat()
    assert post(client, data).status_code == 422
    assert client.post('/v1/webhooks/ring', content=b'x'*70000).status_code == 413
    assert post(client, payload(kind='device_online')).json()['ignored'] == 'non_observation_event'


def install_processing_mocks(client, monkeypatch, result=None):
    pipe = client.app.state.pipeline
    monkeypatch.setattr('demafur.pipeline.shutil.which', lambda _: '/fake/ffmpeg')
    def download(device, component, timestamp, path):
        path.write_bytes(b'example-mp4-for-mocked-integration-test')
        return {'start_ms': timestamp, 'duration_ms': 10000, 'partial': True, 'bytes': path.stat().st_size}
    monkeypatch.setattr(pipe.ring, 'download', download)
    monkeypatch.setattr('demafur.pipeline.vision.sample_frames', lambda *args: [])
    monkeypatch.setattr('demafur.pipeline.vision.analyze', lambda *args: result or {
        'summary': 'A parcel is visibly lifted in the sampled frames.',
        'limitations': ['Sparse frames cannot establish ownership or intent.'],
        'observations': [{'kind': 'package_removed', 'offset_seconds': 5,
            'duration_seconds': 0, 'confidence': .85, 'frame_indices': [0, 1],
            'explanation': 'A parcel is visibly lifted between two sampled frames.'}]})


def test_end_to_end_mocked_ring_to_confirmation_and_real_zip_member(client, monkeypatch):
    watch(client)
    queued = post(client, payload()).json()['queued'][0]
    install_processing_mocks(client, monkeypatch)
    result = client.post('/v1/analysis/process').json()
    assert result['state'] == 'completed'
    view = client.get('/v1/deliveries/parcel1').json()
    assert view['status'] == 'needs_confirmation'
    assert view['risk']['level'] == 'needs_confirmation'
    assert view['timeline'][1]['provenance'] == 'sampled_frame_analysis'
    assert view['timeline'][1]['frame_indices'] == [0, 1]
    assert client.post('/v1/analysis/process').json()['processed'] is False
    assert client.get('/v1/deliveries/parcel1/evidence.zip').status_code == 409
    assert client.get(f'/v1/analysis/jobs/{queued}/clip', headers={'Authorization': ''}).status_code == 401
    assert client.get(f'/v1/analysis/jobs/{queued}/clip').status_code == 200
    client.post('/v1/deliveries/parcel1/confirmation', json={'outcome': 'missing'})
    with zipfile.ZipFile(io.BytesIO(client.get('/v1/deliveries/parcel1/evidence.zip').content)) as z:
        name = f'clips/{queued}.mp4'
        assert z.read(name) == b'example-mp4-for-mocked-integration-test'
        manifest = json.loads(z.read('sha256-manifest.json'))
        assert manifest[name] == hashlib.sha256(z.read(name)).hexdigest()
        assert json.loads(z.read('evidence.json'))['included_recordings'][0]['media']['partial'] is True
    path = client.app.state.pipeline.clip({'id': queued})
    assert path.exists()
    client.delete('/v1/deliveries/parcel1')
    assert not path.exists()
    assert client.get('/v1/analysis/jobs').json()['items'] == []


def test_no_configuration_does_not_invent_analysis(client, monkeypatch):
    watch(client); post(client, payload())
    monkeypatch.setenv('DEMAFUR_VISION_ENABLED', 'false')
    result = client.post('/v1/analysis/process').json()
    assert result['state'] == 'failed'
    assert result['error'] == 'vision_not_enabled'
    timeline = client.get('/v1/deliveries/parcel1').json()['timeline']
    assert len(timeline) == 1 and timeline[0]['kind'] == 'motion'


def test_provider_missing_footage_retries(client, monkeypatch):
    watch(client); post(client, payload())
    install_processing_mocks(client, monkeypatch)
    def unavailable(*args):
        raise IntegrationError('ring_http_416', True)
    monkeypatch.setattr(client.app.state.pipeline.ring, 'download', unavailable)
    result = client.post('/v1/analysis/process').json()
    assert result['state'] == 'retry'
    assert result['error'] == 'ring_http_416'
    assert client.post('/v1/analysis/process').json()['processed'] is False


def test_unlink_cancels_work(client):
    watch(client); post(client, payload())
    result = post(client, payload(kind='app_integration_removed', event_id='unlink')).json()
    assert result['integration_disabled'] is True
    assert client.get('/v1/analysis/jobs').json()['items'][0]['state'] == 'cancelled'
    assert client.post('/v1/analysis/process').json()['reason'] == 'integration_disabled'
    assert post(client, payload(event_id='later')).json()['ignored'] == 'integration_disabled'


def test_claim_lost_during_analysis_discards_result(client, monkeypatch):
    watch(client); job_id = post(client, payload()).json()['queued'][0]
    install_processing_mocks(client, monkeypatch)
    def cancel(*args):
        client.delete('/v1/integrations/ring/watch/parcel1')
        return {'summary': 'Cancelled', 'observations': [], 'limitations': ['Cancelled']}
    monkeypatch.setattr('demafur.pipeline.vision.analyze', cancel)
    result = client.post('/v1/analysis/process').json()
    assert result['reason'] == 'cancelled_or_claim_lost'
    assert not client.app.state.pipeline.clip({'id':job_id}).exists()
    assert len(client.get('/v1/deliveries/parcel1').json()['timeline']) == 1


def test_review_served_with_security_headers(client):
    response = client.get('/review', headers={'Authorization': ''})
    assert response.status_code == 200
    assert 'frame-ancestors' in response.headers['content-security-policy']
    assert 'Household access key' in response.text
    assert OWNER not in response.text
    js = client.get('/review-assets/review.js').text
    assert 'innerHTML' not in js
    assert 'localStorage' not in js
    assert 'textContent' in js


def test_token_refresh_persistence_and_account_check(client, tmp_path):
    requests = []
    def ring(request):
        requests.append(request)
        if request.url.host == 'oauth.ring.com':
            return httpx.Response(200, json={'access_token': 'new-access', 'refresh_token': 'rotated-refresh', 'expires_in': 14400})
        assert request.headers['authorization'] == 'Bearer new-access'
        return httpx.Response(200, json={'data': {'id': ACCOUNT}})
    path = tmp_path/'private'/'tokens.json'
    adapter = RingClient(path, transport=httpx.MockTransport(ring))
    assert adapter.token() == 'new-access'
    assert adapter.token() == 'new-access'
    assert len(requests) == 2
    assert json.loads(path.read_text())['refresh_token'] == 'rotated-refresh'
    assert os.stat(path).st_mode & 0o777 == 0o600
    assert 'grant_type=refresh_token' in requests[0].content.decode()


def test_ring_download_contract_partial_and_no_redirect(client, tmp_path, monkeypatch):
    def ring(request):
        body = json.loads(request.content)
        assert body['timestamp'] == 1000
        assert body['duration'] == 60000
        assert body['audio_options']['audio_enabled'] is False
        assert body['components'] == [{'component_id': '2'}]
        assert request.url.host == 'api.amazonvision.com'
        return httpx.Response(206, content=b'test-recording-content', headers={
            'content-type': 'video/mp4', 'x-media-timestamp':'2000', 'x-media-length':'5000'})
    adapter = RingClient(tmp_path/'tokens.json', transport=httpx.MockTransport(ring))
    monkeypatch.setattr(adapter, 'token', lambda **_: 'token')
    metadata = adapter.download('device.123', '2', 1000, tmp_path/'clip.mp4')
    assert metadata['partial'] is True and metadata['start_ms'] == 2000
    adapter.transport = httpx.MockTransport(lambda request: httpx.Response(302, headers={'location':'http://localhost/private'}))
    with pytest.raises(IntegrationError, match='ring_http_302'):
        adapter.download('device.123', '', 1000, tmp_path/'clip2.mp4')


def test_vision_structure_and_frame_provenance(client, tmp_path):
    image = tmp_path/'image.jpg'; image.write_bytes(b'image-fixture')
    frames = [{'offset':0,'path':image}, {'offset':5,'path':image}]
    output = {'summary': 'A package is moved.', 'limitations':['Only two sampled frames.'],
              'observations':[{'kind':'package_removed','offset_seconds':5,'duration_seconds':0,
              'confidence':.8,'frame_indices':[0,1],'explanation':'Visible handling.'}]}
    def provider(request):
        body = json.loads(request.content)
        assert body['store'] is False
        assert body['text']['format']['strict'] is True
        assert len([p for p in body['input'][0]['content'] if p['type']=='input_image']) == 2
        return httpx.Response(200, json={'status':'completed','output':[{'content':[{'type':'output_text','text':json.dumps(output)}]}]})
    transport = httpx.MockTransport(provider)
    assert analyze(frames, transport)['observations'][0]['kind'] == 'package_removed'
    output['observations'][0]['frame_indices'] = [0, 8]
    with pytest.raises(IntegrationError, match='vision_invalid_frame_reference'):
        analyze(frames, transport)
    output['observations'][0]['frame_indices'] = [0, 1]
    output['observations'][0]['duration_seconds'] = 30
    with pytest.raises(IntegrationError, match='vision_unsupported_duration'):
        analyze(frames, transport)
    output['observations'][0]['duration_seconds'] = 0
    output['observations'][0]['face_id'] = 'someone'
    with pytest.raises(IntegrationError, match='vision_invalid_response'):
        analyze(frames, transport)


def test_vision_refusal_never_becomes_normal_observation(client, tmp_path):
    image = tmp_path/'image.jpg'; image.write_bytes(b'image-fixture')
    provider = httpx.MockTransport(lambda request: httpx.Response(200, json={
        'status':'completed','output':[{'content':[{'type':'refusal','refusal':'Cannot analyze.'}]}]}))
    with pytest.raises(IntegrationError, match='vision_invalid_response'):
        analyze([{'offset':0,'path':image},{'offset':5,'path':image}], provider)


def test_account_link_requires_owner_nonce_and_both_ring_steps(client, monkeypatch):
    import base64
    monkeypatch.delenv('RING_ACCOUNT_ID')
    monkeypatch.delenv('RING_REFRESH_TOKEN')
    seen = []
    def ring(request):
        seen.append((request.method, request.url.path))
        if request.url.host == 'oauth.ring.com':
            assert b'grant_type=authorization_code' in request.content
            return httpx.Response(200, json={'access_token':'pending-access','refresh_token':'pending-refresh','expires_in':14400})
        if request.url.path == '/v1/users/me':
            return httpx.Response(200, json={'data':{'id':ACCOUNT}})
        return httpx.Response(200, json={'data':{'type':'app-integrations'}})
    adapter = client.app.state.pipeline.ring
    adapter.transport = httpx.MockTransport(ring)
    response = client.post('/v1/integrations/ring/token', json={'code':'one-use-test-code'}, headers={'Authorization':''})
    assert response.status_code == 200
    assert not adapter.path.exists()
    assert adapter.account_id() is None
    stamp = int(time.time()*1000)
    nonce = base64.urlsafe_b64encode(hmac.new(SIGNING.encode(), f'{stamp}:{ACCOUNT}'.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
    body = {'nonce':nonce,'time':stamp}
    assert client.post('/v1/integrations/ring/link', json=body, headers={'Authorization':''}).status_code == 401
    assert client.post('/v1/integrations/ring/link', json={'nonce':'a'*43,'time':stamp}).status_code == 400
    assert client.post('/v1/integrations/ring/link', json=body).json()['linked'] is True
    assert adapter.path.exists()
    assert adapter.account_id() == ACCOUNT
    assert adapter.configured()
    assert seen[-2:] == [('POST','/v1/accounts/me/app-integrations'),('PATCH','/v1/accounts/me/app-integrations')]
    assert client.post('/v1/integrations/ring/link', json=body).status_code == 400
    assert 'pending-access' not in client.get('/v1/integrations/status').text


def test_expired_link_never_claims(client):
    result = client.post('/v1/integrations/ring/link', json={'nonce':'a'*43,'time':int((time.time()-700)*1000)})
    assert result.status_code == 400
    assert result.json()['detail'] == 'ring_link_expired'


def test_device_removal_prevents_new_jobs(client):
    watch(client); post(client,payload())
    assert post(client,payload(kind='device_removed',event_id='removed')).json()['device_removed']
    assert client.get('/v1/analysis/jobs').json()['items'][0]['state'] == 'cancelled'
    assert post(client,payload(event_id='later-motion')).json()['queued'] == []


def test_no_auto_evidence_on_visual_removal_expected_confirmation(client,monkeypatch):
    watch(client); post(client,payload())
    install_processing_mocks(client,monkeypatch)
    client.post('/v1/analysis/process')
    assert client.get('/v1/deliveries/parcel1/evidence').status_code == 409
    view=client.post('/v1/deliveries/parcel1/confirmation',json={'outcome':'expected'}).json()
    assert view['risk']['level'] == 'normal'
    assert view['status'] == 'collected'
    assert client.get('/v1/deliveries/parcel1/evidence').status_code == 409


def test_unlink_between_download_and_vision_prevents_image_send(client, monkeypatch):
    watch(client); post(client,payload())
    install_processing_mocks(client,monkeypatch)
    def frames(*args):
        post(client,payload(kind='app_integration_removed',event_id='unlink-during-download'))
        return []
    def forbidden(*args):
        raise AssertionError('Revoked watch must not send images')
    monkeypatch.setattr('demafur.pipeline.vision.sample_frames',frames)
    monkeypatch.setattr('demafur.pipeline.vision.analyze',forbidden)
    assert client.post('/v1/analysis/process').json()['reason'] == 'cancelled_or_claim_lost'
    assert client.get('/v1/analysis/jobs').json()['items'][0]['state'] == 'cancelled'


def test_non_observation_ring_event_without_timestamp_is_acknowledged(client):
    data=payload(kind='subscription_activated')
    del data['data']['attributes']['timestamp']
    assert post(client,data).json()['ignored'] == 'non_observation_event'


def test_unavailable_analysis_is_not_all_clear(client,monkeypatch):
    watch(client); post(client,payload())
    view=client.get('/v1/deliveries/parcel1').json()
    assert view['analysis_coverage'] == 'pending'
    monkeypatch.setenv('DEMAFUR_VISION_ENABLED','false')
    client.post('/v1/analysis/process')
    view=client.get('/v1/deliveries/parcel1').json()
    assert view['analysis_coverage'] == 'unavailable'
    assert 'not an all-clear' in ' '.join(view['risk']['reasons'])


def test_replayed_removal_does_not_disconnect_new_link(client):
    watch(client)
    removal=payload(kind='app_integration_removed',event_id='first-unlink')
    assert post(client,removal).json()['integration_disabled']
    with client.app.state.pipeline.db.connect() as conn:
        conn.execute("UPDATE integration_state SET value='false' WHERE key='ring_disabled'")
    assert post(client,removal).json()['duplicate']
    assert client.get('/v1/integrations/status').json()['ring_disabled'] is False
