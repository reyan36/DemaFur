# Verification — version 0.2

- Python 3.14.5, FastAPI 0.141.1, SQLite persistence.
- `python -m pytest -q`: **49 passed**, zero failures.
- One upstream Starlette test-client deprecation warning concerning httpx.
- `node --check demafur/static/review.js`: passed.
- `git diff --check`: passed.

The new tests exercise native Ring signatures, household scope, duplicate deliveries, immediate timeline ingestion, camera routing, queued work, owner-only account linking, nonce expiry/replay, POST/PATCH linking steps, token rotation, recording request format, partial recording metadata, model schema/frame validation, refusals, retry states, disconnection during processing, confirmation, authenticated clip access, ZIP clip inclusion and hashes, and recording deletion.

Ring and OpenAI HTTP responses are mocked. The end-to-end integration test uses mock recording bytes and replaces frame extraction; it does **not** establish real MP4 decoding or visual model accuracy. UI assets and security headers are verified through the HTTP test client, but a rendered-browser interaction pass has not been performed.

No Ring developer app, camera credentials, or OpenAI API account was supplied. Real provider calls, actual camera footage, FFmpeg execution, public HTTPS callbacks, and Docker/Compose builds remain unverified. The original version 0.1 synthetic demo was previously exercised on a localhost server; that is not a live-provider validation of this update.
