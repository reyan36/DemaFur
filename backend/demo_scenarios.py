"""Persistent, clearly labelled demo data via the normal authenticated API.

Not a Ring simulator. No AI, recording retrieval, or action dispatch is invoked.
"""
import argparse
from datetime import datetime, timedelta, timezone
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import re
import uuid
import zipfile

import httpx

SCENARIOS = {'normal': 'delivered', 'trusted': 'collected',
             'uncertain': 'needs_confirmation', 'missing': 'incident'}


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def check(response, allowed=(200,)):
    if response.status_code not in allowed:
        raise RuntimeError(f'API returned HTTP {response.status_code}; expected {allowed}. Check backend logs (do not share credentials).')
    return response


def save_manifest(path, data, exclusive=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')


def validate_manifest(data):
    run = data.get('run_id', '')
    if not re.fullmatch(r'demo-[0-9a-f]{32}', run):
        raise ValueError('Invalid demo manifest run ID')
    expected = {name: f'{run}-{name}' for name in SCENARIOS}
    if data.get('deliveries') != expected or data.get('camera_id') != run+'-camera':
        raise ValueError('Manifest does not contain the exact demo delivery IDs')
    return data


def seed(client, manifest_path, base_url):
    check(client.get('/ready'))
    run = 'demo-' + uuid.uuid4().hex
    data = {'version': 1, 'run_id': run, 'base_url': base_url,
            'created_at': timestamp(), 'camera_id': run+'-camera',
            'deliveries': {name: f'{run}-{name}' for name in SCENARIOS},
            'expected_statuses': SCENARIOS, 'state': 'in_progress',
            'source': 'synthetic_normalized_events_not_ring'}
    # Persist IDs before any writes so partial runs can be cleaned up.
    save_manifest(manifest_path, data, exclusive=True)

    def event(name, kind, suffix):
        payload = {'event_id': data['deliveries'][name]+'-'+suffix,
                   'delivery_id': data['deliveries'][name],
                   'camera_id': data['camera_id'], 'kind': kind,
                   'occurred_at': timestamp(), 'confidence': 0.99}
        check(client.post('/v1/events', json=payload), (201,))
        # Demonstrate idempotent delivery of the exact same payload.
        check(client.post('/v1/events', json=payload))

    for name in SCENARIOS:
        event(name, 'package_delivered', 'delivered')
        if name == 'normal':
            continue
        if name == 'trusted':
            clock = datetime.now(timezone.utc)
            check(client.post('/v1/pickup-windows', json={
                'delivery_id': data['deliveries'][name],
                'starts_at': (clock-timedelta(minutes=1)).isoformat(),
                'ends_at': (clock+timedelta(minutes=30)).isoformat()}), (201,))
        event(name, 'package_removed', 'removed')
        if name == 'missing':
            check(client.post('/v1/deliveries/'+data['deliveries'][name]+'/confirmation',
                              json={'outcome': 'missing'}))
    data['state'] = 'seeded'
    save_manifest(manifest_path, data)
    return data


def verify(client, data, output_dir):
    validate_manifest(data)
    details = {}
    for name, delivery_id in data['deliveries'].items():
        view = check(client.get('/v1/deliveries/'+delivery_id)).json()
        if view['camera_id'] != data['camera_id'] or view['status'] != SCENARIOS[name]:
            raise RuntimeError(f'{name}: unexpected camera or status; scenario may have been edited')
        expected_events = 1 if name == 'normal' else 2
        if len(view['timeline']) != expected_events:
            raise RuntimeError(f'{name}: duplicate or missing timeline events')
        details[name] = {'id': delivery_id, 'status': view['status'], 'risk': view['risk']['level']}
        if name != 'missing':
            check(client.get('/v1/deliveries/'+delivery_id+'/evidence'), (409,))
    delivery_id = data['deliveries']['missing']
    bundle = check(client.get('/v1/deliveries/'+delivery_id+'/evidence')).json()
    if bundle['classification'] != 'owner_reported_missing' or bundle['submitted']:
        raise RuntimeError('Unexpected evidence classification/submission state')
    raw = check(client.get('/v1/deliveries/'+delivery_id+'/evidence.zip')).content
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        required = {'evidence.json', 'report-draft.txt', 'neighbours-draft.txt', 'sha256-manifest.json'}
        if not required.issubset(archive.namelist()):
            raise RuntimeError('Evidence ZIP is incomplete')
        checksums = json.loads(archive.read('sha256-manifest.json'))
        for name in required - {'sha256-manifest.json'}:
            if checksums.get(name) != hashlib.sha256(archive.read(name)).hexdigest():
                raise RuntimeError('Evidence integrity check failed')
        zipped = json.loads(archive.read('evidence.json'))
        if zipped['delivery_id'] != delivery_id or len(zipped['timeline']) != 2:
            raise RuntimeError('ZIP does not match the incident')
        if zipped.get('included_recordings') or any(name.startswith('clips/') for name in archive.namelist()):
            raise RuntimeError('Synthetic scenario unexpectedly contains recordings')
    check(client.get('/v1/dashboard'))
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir/(data['run_id']+'-evidence.zip')).write_bytes(raw)
    result = {'run_id': data['run_id'], 'verified_at': timestamp(),
              'scenarios': details, 'evidence_checksums_verified': True,
              'source': data['source'], 'real_camera_or_ai_verified': False}
    (output_dir/(data['run_id']+'-verification.json')).write_text(json.dumps(result, indent=2)+'\n')
    return result


def cleanup(client, data):
    validate_manifest(data)
    # Preflight every record before deleting anything; never delete unrelated IDs.
    present = []
    for delivery_id in data['deliveries'].values():
        response = check(client.get('/v1/deliveries/'+delivery_id), (200, 404))
        if response.status_code == 404:
            continue
        if response.json().get('camera_id') != data['camera_id']:
            raise RuntimeError('Cleanup stopped: delivery camera does not match manifest')
        present.append(delivery_id)
    for delivery_id in present:
        check(client.delete('/v1/deliveries/'+delivery_id), (200, 204, 404))
        check(client.get('/v1/deliveries/'+delivery_id), (404,))
    return len(present)


def validate_url(url):
    parsed = httpx.URL(url)
    local = parsed.host in ('localhost', '127.0.0.1', '::1')
    if (parsed.scheme != 'https' and not (parsed.scheme == 'http' and local)) or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use HTTPS (HTTP allowed only on localhost), without credentials/query/fragment')
    if not parsed.host:
        raise ValueError('Backend hostname is required')
    return str(parsed).rstrip('/')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('seed', 'verify', 'cleanup'))
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--url', help='Required for seed; defaults to manifest URL otherwise')
    parser.add_argument('--output-dir', type=Path, default=Path('data/demo-results'))
    args = parser.parse_args()
    data = None if args.command == 'seed' else validate_manifest(json.loads(args.manifest.read_text()))
    url = validate_url(args.url or (data and data['base_url']) or os.getenv('DEMAFUR_URL', ''))
    if data and url != validate_url(data['base_url']):
        raise ValueError('URL differs from manifest; use the original deployment')
    key = os.getenv('DEMAFUR_API_KEY') or getpass.getpass('DemaFur API key (hidden): ')
    with httpx.Client(base_url=url, headers={'Authorization':'Bearer '+key}, timeout=60, follow_redirects=False) as client:
        if args.command == 'seed':
            print('Creating four synthetic deliveries. They remain until cleanup. No Ring/AI/hardware calls.')
            data = seed(client, args.manifest, url)
            result = verify(client, data, args.output_dir)
            print(json.dumps(result, indent=2))
        elif args.command == 'verify':
            print(json.dumps(verify(client, data, args.output_dir), indent=2))
        else:
            print(f'Deleted {cleanup(client, data)} demo deliveries; unrelated records untouched.')


if __name__ == '__main__':
    try:
        main()
    except (httpx.HTTPError, RuntimeError, ValueError, OSError, zipfile.BadZipFile) as error:
        # Never print remote response bodies, credential-bearing URLs, or keys.
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        raise SystemExit(f'Demo command failed ({message}). Keep the manifest; use cleanup to remove any remaining demo records.') from None
