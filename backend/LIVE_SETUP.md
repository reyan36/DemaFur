# Connect your first real delivery

First complete [STACK_SETUP.md](STACK_SETUP.md) for Supabase and AWS. Ring ingestion and AI calls have been tested with mocked responses; live hardware and provider validation is still required.

## 1. Prepare local configuration

From `backend/`:

```sh
python3 setup_env.py
```

This creates a local `.env` with randomly generated household/API credentials and restrictive file permissions. It refuses to overwrite an existing file. `.env` is ignored by Git; `.env.example` and `.gitignore` are intentionally committed.

Keep the generated household key: the prototype review page uses it for sign-in. This is a single-household staging interface, not production user-account management.

## 2. Register the Ring application

Create a developer application at https://developer.amazon.com/ring/console/apps and follow Ring's current onboarding requirements. Obtain the application **Client ID**, **Client Secret**, and **HMAC signing key**, then fill these local variables:

```text
RING_CLIENT_ID=...
RING_CLIENT_SECRET=...
RING_HMAC_SIGNING_KEY=...
```

Use the Ring-driven linking flow. Partner-initiated OAuth is a different, invitation-only flow and is not implemented here. Request the device/event/recording access needed for your test camera. Whether the account/device is eligible and can provide recordings must be verified in your Ring staging environment.

You need a publicly reachable HTTPS deployment to receive Ring callbacks. Configure these staging URLs, replacing `YOUR_HOST`:

| Ring configuration | URL |
|---|---|
| Token Exchange URL | `https://YOUR_HOST/v1/integrations/ring/token` |
| Account Link URL | `https://YOUR_HOST/review` |
| Webhook URL | `https://YOUR_HOST/v1/webhooks/ring` |
| App Homepage URL | `https://YOUR_HOST/review` |

The token callback accepts an authorization code in a JSON or form `code` field and exchanges it with Ring. Confirm this callback envelope with your staging configuration; actual callback delivery has not been tested. Tokens remain unclaimed until the signed-in homeowner explicitly completes nonce verification. The callback does not accept an arbitrary API URL or trust an account ID supplied by the browser.

Ring redirects the homeowner to `/review?nonce=...&time=...`. Sign in with your household key and select **Complete Ring connection**. The backend verifies the ten-minute nonce, calls Ring's POST verification and PATCH completion endpoints, and retains the linked account identity. It supports one household per deployment.

For an account that is already linked through your existing integration, you may instead supply `RING_ACCOUNT_ID` and `RING_REFRESH_TOKEN`. The adapter refreshes and rotates tokens and verifies the token's account through `/v1/users/me`. Leave both blank for the native flow above.

Token files are kept under DEMAFUR_DATA_DIR in `ring-private/`, with directory permissions 0700 and file permissions 0600. They are **not application-encrypted**; use an encrypted persistent volume or replace the store with your deployment's secret manager before public production use. Run a single API process: file-token refresh coordination currently uses an in-process lock.

## 3. Configure visual analysis

Configure `AI_PROVIDER=bedrock`, `AWS_REGION`, `BEDROCK_MODEL_ID` and `BEDROCK_VISION_MODEL_ID`, with AWS credentials available to the backend. Choose a vision model supporting Converse image inputs and forced tool output. Set `DEMAFUR_VISION_ENABLED=true` only when ready to send sampled event images to the provider. Optional Groq fallback sends a maximum of three selected frames and reports reduced temporal coverage.

No audio or facial identification is used. Images may still contain personal information; they are not anonymized. Provider retention terms apply.

## 4. Start the server and worker

Docker option (Docker build has not been verified in this development session):

```sh
docker compose build
docker compose run --rm api python -m demafur.migrate
docker compose up
```

The image installs FFmpeg. The API listens locally at http://127.0.0.1:8000 and the worker calls maintenance, analysis, and simulated-action dispatch every 15 seconds. Configure your HTTPS gateway separately for Ring callbacks. Apply TLS and gateway request/rate limits, especially to the token callback. Do not expose an unprotected development server publicly.

Without Docker: install Python dependencies and FFmpeg, export your environment values, start Uvicorn from the README, then run `python worker.py` with the same household key. Set `FFMPEG_PATH` only if FFmpeg is not on PATH. The application does not load `.env` automatically outside Compose.

## 5. Run the first real event

1. Open `/review`, sign in, and complete Ring linking if needed.
2. Select **Load shared Ring cameras**. Check that your actual camera is returned.
3. Select the camera and enter one delivery reference, such as `parcel-001`. For a multi-camera device, enter the module ID shown in its capabilities. Start watching.
4. Create a motion or doorbell event in your authorized test area while the camera records.
5. Refresh the page. The native observation should appear immediately and analysis should be queued. Clip processing waits at least 65 seconds after the event so the requested minute of footage has time to become available.
6. Once processed, review the explanation, timestamps, limitations and downloaded event clip. Confirm that the description matches the real recording. Sparse frames can miss actions; an unavailable analysis is not an all-clear result.
7. Test an expected pickup. It should resolve normally without an incident bundle. Separately test a staged missing-package scenario and explicitly select **Report package missing** to generate a reviewable ZIP containing downloaded footage.
8. Stop the camera watch before using it for a different parcel. Automatic multi-parcel tracking is not implemented.

Each recording request covers up to one minute, sampled every five seconds. This can miss fast hand movements and cannot establish the existing 90-second lingering rule from a single clip. Cross-clip duration tracking remains future work; do not interpret missing observations as absence of activity.

Record the real observations, model output and false positives before relying on the risk policy. The automated tests verify software behaviour; they do not measure visual accuracy.

## Troubleshooting

- **Ring not configured:** app credentials or a linked account/token are missing.
- **ring_http_401 / 403:** credentials, consent, or recording access may be invalid. Re-link as needed.
- **ring_http_416:** no recording exists at the requested timestamp yet. Automatic bounded retries are scheduled; download requests do not start recording.
- **ffmpeg_not_installed:** install FFmpeg or use the provided container build.
- **vision_not_enabled / configured:** enable vision explicitly and configure its API key/model.
- **vision_invalid_response / frame reference / duration:** the model response failed validation. It is not converted to a normal event; review and retry.
- **partial clip:** the actual start and available duration are retained; the service does not pretend the missing footage exists.
- **disconnected integration:** queued work and watches are cancelled. Complete linking again, or update authorized credentials and use `POST /v1/integrations/ring/resume`, then recreate the watch.

Alexa, real push notifications and physical light/warning actions remain outside this first integration flow. No reports or neighbour posts are submitted automatically.

Sources: [Ring Partner API](https://developer.amazon.com/docs/ring/api-documentation.html), [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision).
