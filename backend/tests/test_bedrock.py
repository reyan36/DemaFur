import json
import pytest
import httpx
from demafur import providers
from demafur.vision import analyze_bedrock
from demafur.ring import IntegrationError


@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER','bedrock')
    monkeypatch.setenv('AWS_REGION','us-east-1')
    monkeypatch.setenv('BEDROCK_MODEL_ID','configured-text-model')
    monkeypatch.setenv('BEDROCK_VISION_MODEL_ID','configured-image-model')
    monkeypatch.setenv('GROQ_FALLBACK_ENABLED','false')


class FakeBedrock:
    def __init__(self, result=None, error=None):
        self.request = None
        self.result, self.error = result, error

    def converse(self, **request):
        self.request = request
        if self.error:
            raise self.error
        return self.result


def response(content, stop='end_turn'):
    return {'stopReason':stop, 'output':{'message':{'content':content}},
            'ResponseMetadata':{'RequestId':'aws-test-request'}, 'usage':{'inputTokens':20,'outputTokens':10,'totalTokens':30}}


def test_bedrock_text_attribution():
    client=FakeBedrock(response([{'text':'Package awaits collection.'}]))
    result=providers.generate('Summarize facts','A package was delivered.',client=client)
    assert result.provider == 'bedrock'
    assert result.request_id == 'aws-test-request'
    assert result.fallback_used is False
    assert client.request['modelId'] == 'configured-text-model'
    assert client.request['inferenceConfig']['maxTokens'] == 400


def observations(indices=(0,1), offset=5):
    return {'summary':'A parcel was lifted.', 'limitations':['Sparse frames; intent unknown.'],
            'observations':[{'kind':'package_removed','offset_seconds':offset,'duration_seconds':0,
              'confidence':.85,'frame_indices':list(indices),'explanation':'Visible handling across the cited frames.'}]}


def test_bedrock_vision_schema_and_byte_images(tmp_path):
    image=tmp_path/'frame.jpg';image.write_bytes(b'fixture-image')
    frames=[{'offset':0,'path':image},{'offset':5,'path':image}]
    client=FakeBedrock(response([{'toolUse':{'name':'record_delivery_observations','input':observations()}}], 'tool_use'))
    result=analyze_bedrock(frames,client=client)
    assert result['inference']['provider'] == 'bedrock'
    assert result['inference']['frame_indices_sent'] == [0,1]
    images=[b['image'] for b in client.request['messages'][0]['content'] if 'image' in b]
    assert images[0]['source']['bytes'] == b'fixture-image'
    assert client.request['toolConfig']['toolChoice']['tool']['name'] == 'record_delivery_observations'


class AwsError(Exception):
    def __init__(self, code):
        self.response={'Error':{'Code':code}}
        super().__init__('sensitive provider error must not appear in output')


def test_optional_groq_fallback_attributed(monkeypatch):
    monkeypatch.setenv('GROQ_FALLBACK_ENABLED','true')
    monkeypatch.setenv('GROQ_API_KEY','test-key')
    monkeypatch.setenv('GROQ_MODEL','test-text-model')
    def groq(request):
        assert request.url.host == 'api.groq.com'
        return httpx.Response(200,json={'id':'groq-test','choices':[{'finish_reason':'stop','message':{'content':'Summary.'}}]})
    result=providers.generate('Summarize','Facts',client=FakeBedrock(error=AwsError('ThrottlingException')),transport=httpx.MockTransport(groq))
    assert result.provider == 'groq' and result.fallback_used
    assert result.primary_error == 'bedrock_ThrottlingException'
    assert result.request_id == 'groq-test'


@pytest.mark.parametrize('code',['AccessDeniedException','ValidationException','ResourceNotFoundException'])
def test_configuration_errors_do_not_silently_use_groq(monkeypatch,code):
    monkeypatch.setenv('GROQ_FALLBACK_ENABLED','true')
    with pytest.raises(IntegrationError,match='bedrock_'+code):
        providers.generate('Summary','Facts',client=FakeBedrock(error=AwsError(code)))


def test_disabled_fallback_preserves_primary_failure():
    with pytest.raises(IntegrationError,match='bedrock_ServiceUnavailableException'):
        providers.generate('Summary','Facts',client=FakeBedrock(error=AwsError('ServiceUnavailableException')))


def test_refusal_not_routed_around(monkeypatch):
    monkeypatch.setenv('GROQ_FALLBACK_ENABLED','true')
    with pytest.raises(IntegrationError,match='bedrock_refused'):
        providers.generate('Summary','Facts',client=FakeBedrock(response([], 'guardrail_intervened')))


def test_groq_vision_uses_three_frames_and_rejects_unseen_citations(monkeypatch,tmp_path):
    monkeypatch.setenv('GROQ_FALLBACK_ENABLED','true')
    monkeypatch.setenv('GROQ_API_KEY','test-key')
    monkeypatch.setenv('GROQ_VISION_MODEL','configured-vision-model')
    image=tmp_path/'frame.jpg';image.write_bytes(b'fixture')
    frames=[{'offset':i*5,'path':image} for i in range(12)]
    output=observations([0,6],30)
    def groq(request):
        body=json.loads(request.content)
        blocks=body['messages'][1]['content']
        assert len([b for b in blocks if b['type']=='image_url']) == 3
        assert body['response_format']['type'] == 'json_object'
        return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(output)}}]})
    client=FakeBedrock(error=AwsError('ServiceUnavailableException'))
    result=analyze_bedrock(frames,client=client,transport=httpx.MockTransport(groq))
    assert result['inference']['frame_indices_sent'] == [0,6,11]
    assert 'coverage is reduced' in result['limitations'][-1]
    output['observations'][0]['frame_indices']=[0,1]
    with pytest.raises(IntegrationError,match='vision_invalid_frame_reference'):
        analyze_bedrock(frames,client=client,transport=httpx.MockTransport(groq))


def test_invalid_bedrock_observation_is_not_accepted(tmp_path):
    image=tmp_path/'f.jpg';image.write_bytes(b'fixture')
    data=observations();data['observations'][0]['identity']='person'
    client=FakeBedrock(response([{'toolUse':{'name':'record_delivery_observations','input':data}}],'tool_use'))
    with pytest.raises(IntegrationError,match='vision_invalid_response'):
        analyze_bedrock([{'offset':0,'path':image},{'offset':5,'path':image}],client=client)
