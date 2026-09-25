"""Periodic housekeeping and simulated action dispatch. Run beside the API."""
import logging
import os
import time
import httpx

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


def main():
    interval = max(10, int(os.getenv('DEMAFUR_WORKER_INTERVAL_SECONDS', '60')))
    with httpx.Client(base_url=os.getenv('DEMAFUR_URL', 'http://127.0.0.1:8000'),
                      headers={'Authorization': 'Bearer ' + os.environ['DEMAFUR_API_KEY']}, timeout=600) as client:
        while True:
            try:
                for path in ['/v1/maintenance', '/v1/analysis/process', '/v1/actions/dispatch']:
                    response = client.post(path)
                    response.raise_for_status()
                    logging.info('%s: %s', path, response.json())
            except httpx.HTTPError as error:
                # Do not log credential-bearing request headers.
                logging.error('Worker cycle failed (%s); retrying next cycle', type(error).__name__)
            time.sleep(interval)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
