"""Send Ring Partner API v1.1 webhooks, signed the way Ring signs them, to a DemaFur backend.

For demos without a physical Ring camera: the Ring Developer Playground does not deliver
webhooks. The backend must run with RING_SANDBOX=true and the same RING_HMAC_SIGNING_KEY and
RING_ACCOUNT_ID as below.

    export RING_HMAC_SIGNING_KEY=...  RING_ACCOUNT_ID=...  DEMAFUR_API_KEY=...
    python ring_simulator.py --backend https://demafur.onrender.com --delivery parcel-001 --kind button_press

--delivery first asks the backend to watch that parcel with the sandbox doorbell (owner key
needed), exactly like choosing a camera in the Ring portal. Then the event is posted to the
public /v1/webhooks/ring endpoint with an X-Signature header, as Ring would.
"""
import argparse
import os
import sys

import httpx

from demafur.pipeline import SANDBOX_DEVICE, sign_ring_event


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--backend', default=os.getenv('DEMAFUR_URL', 'http://127.0.0.1:8000'))
    parser.add_argument('--kind', default='button_press', choices=['button_press', 'motion_detected'])
    parser.add_argument('--delivery', help='watch this delivery with the sandbox doorbell first')
    args = parser.parse_args()
    secret, account = os.getenv('RING_HMAC_SIGNING_KEY'), os.getenv('RING_ACCOUNT_ID')
    if not secret or not account:
        sys.exit('Set RING_HMAC_SIGNING_KEY and RING_ACCOUNT_ID (the same values as the backend).')
    backend = args.backend.rstrip('/')

    with httpx.Client(timeout=90) as client:   # Render can take ~60 s to wake up
        if args.delivery:
            key = os.getenv('DEMAFUR_API_KEY')
            if not key:
                sys.exit('--delivery needs DEMAFUR_API_KEY to start the watch.')
            watch = client.post(f'{backend}/v1/integrations/ring/watch',
                                headers={'Authorization': f'Bearer {key}'},
                                json={'device_id': SANDBOX_DEVICE, 'delivery_id': args.delivery})
            print(f'watch {args.delivery}: {watch.status_code} {watch.text[:200]}')
            if watch.status_code not in (200, 201, 409):
                sys.exit(1)
        body, signature = sign_ring_event(args.kind, SANDBOX_DEVICE, account, secret)
        response = client.post(f'{backend}/v1/webhooks/ring', content=body,
                               headers={'Content-Type': 'application/json', 'X-Signature': signature})
        print(f'{args.kind}: {response.status_code} {response.text[:300]}')
        sys.exit(0 if response.is_success else 1)


if __name__ == '__main__':
    main()
