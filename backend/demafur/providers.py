"""Bedrock-first inference with an explicit, attributed Groq fallback.

Images/text go only to the configured provider. Fallback is opt-in and never
bypasses refusals, invalid model output, or broken AWS credentials/configuration.
"""
import base64
import json
import os
from dataclasses import dataclass
import httpx
from .ring import IntegrationError


@dataclass
class Inference:
    text: str
    provider: str
    model: str
    request_id: str | None
    usage: dict
    frame_indices: list[int]
    fallback_used: bool = False
    primary_error: str | None = None

    def metadata(self):
        return {'provider': self.provider, 'model': self.model, 'request_id': self.request_id,
                'usage': self.usage, 'frame_indices_sent': self.frame_indices,
                'fallback_used': self.fallback_used, 'primary_error': self.primary_error}


def configuration(vision=False):
    provider = os.getenv('AI_PROVIDER') or 'bedrock'
    if provider == 'bedrock':
        ready = bool(os.getenv('AWS_REGION') and os.getenv('BEDROCK_VISION_MODEL_ID' if vision else 'BEDROCK_MODEL_ID'))
    elif provider == 'openai':
        ready = bool(os.getenv('OPENAI_API_KEY') and os.getenv('OPENAI_VISION_MODEL' if vision else 'OPENAI_MODEL'))
    else:
        ready = False
    return {'provider': provider, 'configured': ready, 'credentials_verified': False,
            'groq_fallback_enabled': os.getenv('GROQ_FALLBACK_ENABLED') == 'true'}


def bedrock_client():
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        raise IntegrationError('bedrock_sdk_missing') from None
    try:
        # Standard AWS credential chain: IAM/temporary credentials, or an explicitly
        # configured Bedrock bearer token with an SDK version supporting API keys.
        return boto3.client('bedrock-runtime', region_name=os.environ['AWS_REGION'],
                            config=Config(connect_timeout=10, read_timeout=90,
                                          retries={'total_max_attempts': 1}))
    except Exception:
        raise IntegrationError('bedrock_credentials_unavailable') from None


def bedrock(instructions, prompt, frames, schema, client=None):
    model = os.getenv('BEDROCK_VISION_MODEL_ID' if frames else 'BEDROCK_MODEL_ID')
    if not os.getenv('AWS_REGION') or not model:
        raise IntegrationError('bedrock_not_configured')
    content = [{'text': prompt}]
    for index, frame in enumerate(frames):
        content += [{'text': f"Frame {index}; offset {frame['offset']} seconds."},
                    {'image': {'format': 'jpeg', 'source': {'bytes': frame['path'].read_bytes()}}}]
    request = {'modelId': model, 'system': [{'text': instructions}],
               'messages': [{'role': 'user', 'content': content}],
               'inferenceConfig': {'maxTokens': 2500 if schema else 400}}
    if schema:
        request['toolConfig'] = {'tools': [{'toolSpec': {'name': 'record_delivery_observations',
            'description': 'Record visible actions and limitations only.', 'inputSchema': {'json': schema}}}],
            'toolChoice': {'tool': {'name': 'record_delivery_observations'}}}
    try:
        response = (client or bedrock_client()).converse(**request)
    except IntegrationError:
        raise
    except Exception as error:
        code = getattr(error, 'response', {}).get('Error', {}).get('Code', '')
        transient = code in ('ThrottlingException', 'ServiceUnavailableException',
                             'InternalServerException', 'ModelTimeoutException', 'ModelNotReadyException')
        if type(error).__name__ in ('EndpointConnectionError', 'ConnectTimeoutError', 'ReadTimeoutError'):
            code, transient = 'NetworkError', True
        # Never serialize arbitrary SDK exception messages: they can contain requests.
        known = code if code in ('AccessDeniedException', 'ValidationException', 'ResourceNotFoundException',
            'ThrottlingException', 'ServiceUnavailableException', 'InternalServerException',
            'ModelTimeoutException', 'ModelNotReadyException', 'NetworkError') else 'request_failed'
        raise IntegrationError('bedrock_' + known, transient) from None
    try:
        stop = response['stopReason']
        if stop in ('guardrail_intervened', 'content_filtered'):
            raise IntegrationError('bedrock_refused')
        blocks = response['output']['message']['content']
        if schema:
            tools = [b['toolUse'] for b in blocks if 'toolUse' in b]
            if stop != 'tool_use' or len(tools) != 1 or tools[0]['name'] != 'record_delivery_observations':
                raise IntegrationError('bedrock_invalid_response')
            text = json.dumps(tools[0]['input'])
        else:
            if stop != 'end_turn':
                raise IntegrationError('bedrock_incomplete')
            text = ' '.join(b['text'] for b in blocks if 'text' in b)
        if not text.strip():
            raise IntegrationError('bedrock_empty_response')
        return Inference(text, 'bedrock', model, response.get('ResponseMetadata', {}).get('RequestId'),
            {k: v for k, v in response.get('usage', {}).items() if k in ('inputTokens', 'outputTokens', 'totalTokens')}, list(range(len(frames))))
    except (KeyError, TypeError, ValueError):
        raise IntegrationError('bedrock_invalid_response') from None


def groq(instructions, prompt, frames, schema, transport=None):
    key, model = os.getenv('GROQ_API_KEY'), os.getenv('GROQ_VISION_MODEL' if frames else 'GROQ_MODEL')
    if not key or not model:
        raise IntegrationError('groq_not_configured')
    # The currently documented Groq vision limit is three images. Keep original
    # frame indices, and validate that the model cites only the images actually sent.
    indices = sorted({0, len(frames)//2, len(frames)-1}) if frames else []
    content = [{'type': 'text', 'text': prompt}]
    for index in indices:
        frame = frames[index]
        content += [{'type': 'text', 'text': f"Frame {index}; offset {frame['offset']} seconds."},
                    {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(frame['path'].read_bytes()).decode()}}]
    if schema:
        content.append({'type': 'text', 'text': 'Return one JSON object matching this schema. Cite only the frame indices supplied above. ' + json.dumps(schema)})
    request = {'model': model, 'messages': [{'role':'system', 'content':instructions},
               {'role':'user','content':content}], 'max_completion_tokens': 2500 if schema else 400}
    if schema:
        request['response_format'] = {'type':'json_object'}
    try:
        with httpx.Client(timeout=90, transport=transport) as client:
            response = client.post('https://api.groq.com/openai/v1/chat/completions',
                headers={'Authorization': 'Bearer ' + key}, json=request)
        if response.status_code != 200:
            raise IntegrationError(f'groq_http_{response.status_code}', response.status_code in (429,500,502,503,504))
        data = response.json()
        choice = data['choices'][0]
        if choice['finish_reason'] != 'stop' or choice['message'].get('refusal'):
            raise IntegrationError('groq_incomplete_or_refused')
        text = choice['message']['content']
        if not isinstance(text, str) or not text.strip():
            raise IntegrationError('groq_empty_response')
        return Inference(text, 'groq', model, data.get('id'),
            {k:v for k,v in data.get('usage',{}).items() if k in ('prompt_tokens','completion_tokens','total_tokens')}, indices)
    except httpx.HTTPError:
        raise IntegrationError('groq_network_error', True) from None
    except (ValueError, KeyError, TypeError, IndexError):
        raise IntegrationError('groq_invalid_response') from None


def generate(instructions, prompt, frames=(), schema=None, client=None, transport=None):
    if (os.getenv('AI_PROVIDER') or 'bedrock') != 'bedrock':
        raise IntegrationError('unsupported_provider')
    try:
        return bedrock(instructions, prompt, frames, schema, client)
    except IntegrationError as error:
        if not error.retryable or os.getenv('GROQ_FALLBACK_ENABLED') != 'true':
            raise
        result = groq(instructions, prompt, frames, schema, transport)
        result.fallback_used, result.primary_error = True, error.code
        return result
