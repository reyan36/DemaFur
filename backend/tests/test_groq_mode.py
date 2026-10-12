"""The three AI modes: Bedrock (default), automatic Groq fallback, and Groq-only testing."""
import json
import httpx
import pytest
from demafur import providers
from demafur.ai import summarize
from demafur.vision import analyze


@pytest.fixture(autouse=True)
def groq_configured(monkeypatch):
    for name in ('AI_PROVIDER', 'AWS_REGION', 'BEDROCK_MODEL_ID', 'BEDROCK_VISION_MODEL_ID', 'GROQ_FALLBACK_ENABLED'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    monkeypatch.setenv('GROQ_MODEL', 'test-text-model')
    monkeypatch.setenv('GROQ_VISION_MODEL', 'test-vision-model')


def reply(content):
    return httpx.Response(200, json={'id': 'groq-req', 'choices': [
        {'finish_reason': 'stop', 'message': {'content': content}}]})


class BrokenBedrock:
    """Stands in for an AWS account where Bedrock is blocked (Error 002)."""
    def converse(self, **request):
        error = Exception('blocked')
        error.response = {'Error': {'Code': 'ValidationException'}}
        raise error


def groq_server(content='Hello.'):
    def handle(request):
        assert request.url.host == 'api.groq.com'
        return reply(content)
    return httpx.MockTransport(handle)


# Mode 1: default. Bedrock is the provider; Groq covers for it.

def test_default_provider_is_bedrock():
    assert providers.configuration()['provider'] == 'bedrock'


def test_default_falls_back_to_groq_when_bedrock_is_blocked(monkeypatch):
    monkeypatch.setenv('AWS_REGION', 'us-east-1')
    monkeypatch.setenv('BEDROCK_MODEL_ID', 'some-model')
    result = providers.generate('Be brief.', 'Say hello.', client=BrokenBedrock(), transport=groq_server())
    assert (result.provider, result.fallback_used) == ('groq', True)
    assert result.primary_error == 'bedrock_ValidationException'


def test_default_falls_back_when_aws_is_not_set_up():
    result = providers.generate('Be brief.', 'Say hello.', transport=groq_server())
    assert result.fallback_used and result.primary_error == 'bedrock_not_configured'
    assert providers.configuration(vision=True)['configured'] is True  # the video worker may run


def test_fallback_can_be_switched_off(monkeypatch):
    monkeypatch.setenv('GROQ_FALLBACK_ENABLED', 'false')
    with pytest.raises(Exception, match='bedrock_not_configured'):
        providers.generate('Be brief.', 'Say hello.', transport=groq_server())
    assert providers.configuration()['configured'] is False


# Mode 2: AI_PROVIDER=groq. Groq only, for testing.

def test_groq_mode_never_calls_bedrock(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'groq')
    result = providers.generate('Be brief.', 'Say hello.', client=BrokenBedrock(), transport=groq_server())
    assert (result.provider, result.fallback_used) == ('groq', False)


def test_groq_mode_needs_a_key(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'groq')
    monkeypatch.delenv('GROQ_API_KEY')
    assert providers.configuration()['configured'] is False


def test_summary_attributed_to_groq(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'groq')
    real = providers.groq
    monkeypatch.setattr(providers, 'groq', lambda *a: real(*a[:4], groq_server('Three sentences.')))
    snapshot = {'id': 'd1', 'status': 'delivered', 'risk': {'reasons': ['None.']}, 'timeline': []}
    assert summarize(snapshot)['source'] == 'groq'


def test_vision_in_groq_mode_marks_reduced_coverage(monkeypatch, tmp_path):
    monkeypatch.setenv('AI_PROVIDER', 'groq')
    monkeypatch.setenv('DEMAFUR_VISION_ENABLED', 'true')
    image = tmp_path / 'f.jpg'
    image.write_bytes(b'fixture')
    frames = [{'offset': i * 5, 'path': image} for i in range(12)]
    answer = {'summary': 'A person approaches.', 'limitations': ['Sparse frames.'], 'observations': [
        {'kind': 'person_approached', 'offset_seconds': 10, 'duration_seconds': 5, 'confidence': .8,
         'frame_indices': [0, 6], 'explanation': 'Visible in two frames.'}]}
    result = analyze(frames, transport=groq_server(json.dumps(answer)))
    assert result['inference']['provider'] == 'groq'
    assert result['inference']['frame_indices_sent'] == [0, 6, 11]
    assert 'reduced' in result['limitations'][-1]