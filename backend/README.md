# DemaFur backend

For persistent demo deliveries and incident ZIP verification, see [DEMO_SCENARIOS.md](DEMO_SCENARIOS.md). These are normalized API events, not a Ring virtual camera.

**Version 0.3:** Supabase PostgreSQL migrations, AWS Bedrock text/vision analysis with automatic Groq fallback (default on when a Groq key is set) are implemented alongside the delivery workflow and Ring adapter. Start with [STACK_SETUP.md](STACK_SETUP.md), then [LIVE_SETUP.md](LIVE_SETUP.md). Live Supabase, AWS and Ring validation is still required. Alexa and physical actions remain simulated.

FastAPI backend for a single-household staging MVP. The planned Next.js/Vercel dashboard calls FastAPI on Railway; PostgreSQL lives on Supabase Cloud. The included `/review` page is a staging staconsole, not the Next.js dashboard.

The supplied diagram is treated as design reference. Its identity-tracking label is intentionally excluded in favour of the written privacy requirements. No facial recognition, person IDs, demographic inference, or continuous video monitoring is implemented.

## Run locally

Python 3.11+ is required (tested on 3.14).

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DEMAFUR_API_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
export DEMAFUR_WEBHOOK_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
export DEMAFUR_LOCAL_DB=memory  # local only: in-memory database, no Firebase needed (see below)
uvicorn demafur.app:create_app --factory --host 127.0.0.1 --port 8000
```

Use two different secrets, each at least 24 characters. `.env.example` lists configuration; the application does not automatically load `.env`. Export variables through your shell or deployment secret manager. Keep keys server-side; this shared household token is suitable for a local prototype. A public web app needs individual login/session management and a backend-for-frontend so the long-lived owner token is not shipped in browser assets.

### Local database options

| Setting | Database | Use it for |
|---|---|---|
| `DEMAFUR_LOCAL_DB=memory` | In-memory fake of Firestore. Data is lost when the server stops. | Trying things out, demos, the fake Ring. No credentials needed. |
| unset + `FIREBASE_CREDENTIALS` (file path) or `FIREBASE_CREDENTIALS_JSON` | The real team Firestore | Checking against shared data. Ask the backend owner for credentials and avoid creating junk test data. |

Never set `DEMAFUR_LOCAL_DB` on Render or any deployment: every restart would wipe all deliveries. Tests set it automatically in `tests/conftest.py`.

### Local AI with Groq

Bedrock is blocked on the team AWS account for now (see **Optional AI**), so use Groq locally. Create a free key at https://console.groq.com/keys, then:

```sh
export GROQ_API_KEY="<your own key>"
export GROQ_MODEL=qwen/qwen3.8-27b
export GROQ_VISION_MODEL=qwen/qwen3.8-27b
export AI_PROVIDER=groq            # optional: Groq only, skips trying Bedrock
```

Without `AI_PROVIDER=groq`, the backend tries Bedrock first and falls back to Groq. Responses then show `fallback_used: true`. Use your own key; never commit it or paste it into chat.

Interactive API documentation: http://127.0.0.1:8000/docs. Click **Authorize** and paste only your `DEMAFUR_API_KEY` value. Swagger adds the Bearer prefix. Other API clients should send `Authorization: Bearer <DEMAFUR_API_KEY>`. OpenAPI is at `/openapi.json`, with a checked-in copy at `openapi.json`.

In a second terminal with the **same exported secrets**, run:

```sh
python demo.py
```

The demo sends signed observations, demonstrates escalation, records an owner-reported missing package, and downloads a ZIP. It does not approve physical actions. Its media paths are illustrative, not real recordings.

## Dashboard integration and deployment test

See [FRONTEND_API.md](FRONTEND_API.md) for the authenticated dashboard endpoint, frontend type mapping and `python smoke_test.py` deployment check. The current Next.js screens still use mock data and need authentication before private household data is connected.

## API contract

| Method / path | Purpose |
|---|---|
| `GET /health` | Public liveness and integration mode |
| `POST /v1/events` | Owner-authenticated normalized event ingestion |
| `POST /v1/webhooks/events` | Signed bridge event ingestion |
| `GET /v1/deliveries?limit=50&offset=0` | Paginated delivery overview |
| `GET /v1/deliveries/{id}` | Timeline, current status, reasons, suggestions |
| `GET /v1/deliveries/{id}/summary` | Local summary or optional AI narration |
| `POST /v1/pickup-windows` | Authorize one delivery's pickup interval |
| `GET /v1/pickup-windows` | Recent pickup windows |
| `DELETE /v1/pickup-windows/{id}` | Revoke authorization |
| `POST /v1/deliveries/{id}/confirmation` | `expected`, `missing`, or `unsure` |
| `GET /v1/actions` | Notification outbox and physical action suggestions |
| `POST /v1/actions/{id}/decision` | `{"approved": true}` or false |
| `POST /v1/actions/dispatch` | Consume queued actions in explicit simulation mode |
| `POST /v1/assistant/query` | Authenticated intent endpoint for a future voice bridge |
| `GET /v1/deliveries/{id}/evidence` | Structured evidence draft |
| `GET /v1/deliveries/{id}/evidence.zip` | JSON, report, neighbour draft, SHA-256 manifest |
| `GET /v1/deliveries/{id}/audit` | Recorded workflow operations |
| `DELETE /v1/deliveries/{id}` | Cascade deletion of delivery-associated database rows |
| `POST /v1/maintenance` | Re-evaluate unattended packages and expire old records |

Example event (use a current timestamp):

```json
{
  "event_id": "camera-event-001",
  "delivery_id": "parcel-001",
  "camera_id": "front-door",
  "kind": "package_delivered",
  "occurred_at": "2026-09-25T10:00:00+00:00",
  "confidence": 0.95,
  "observations": {"duration_seconds": 0, "looking_around": false},
  "media_ref": "recordings/parcel-001/delivery.mp4"
}
```

Event kinds: `package_delivered`, `motion`, `person_approached`, `person_lingering`, `package_removed`, `entered_home`, `doorbell`. The original event endpoint accepts bridge-supplied observations. The Ring pipeline now derives candidate observations from sampled video frames when explicitly configured. Entering home is preserved as context but does not prove a pickup was authorized. No unstructured camera text is accepted. Unknown fields are rejected.

Assign one stable delivery ID per parcel lifecycle and one globally unique event ID per source event. The bridge must correlate observations with a parcel; automatic multi-package camera correlation is not implemented. Ring watches explicitly associate one camera view with one delivery. Repeated identical events return 200 without duplicate side effects; reuse with changed content returns 409. Events may arrive out of order and are displayed by occurrence time; naive timestamps and events over five minutes in the future are rejected. Up to 2,000 observations per delivery are supported.

### Signed bridge

The webhook is a **DemaFur bridge contract**, not an official Ring endpoint. Compute a hex HMAC-SHA256 using the webhook secret over:

```text
<unix_timestamp>.<exact raw HTTP request body bytes>
```

Send `X-Demafur-Timestamp` and `X-Demafur-Signature`. Timestamp tolerance is five minutes; stable event IDs prevent duplicate replay effects. Webhook payloads are capped at 64 KiB. See `demo.py` for an executable sender.

### Pickup and confirmation

```json
{"delivery_id":"parcel-001","starts_at":"2026-09-25T10:00:00Z","ends_at":"2026-09-25T11:00:00Z"}
```

Windows last at most 24 hours and apply only to the specified delivery. Authorization must have been created before the removal event occurred. It cannot be applied retroactively; use owner confirmation instead. A window is a scheduling assumption, not identity verification. The owner can always report a package missing even after a trusted-window pickup.

```json
{"outcome":"expected"}
```

Expected pickups cancel unexecuted suggestions and remove any prior evidence draft. Missing confirmation creates the evidence bundle automatically, without claiming a person committed theft. `unsure` returns to event-based reasoning and removes any previously generated incident draft. Audit operations retain the confirmation history until the delivery expires or is deleted.

### Risk policy

Scores are configurable in source (`demafur/risk.py`) and are **heuristics, not calibrated probabilities**:

- Normal: 0–24; needs confirmation: 25–49; suspicious: 50–74; high risk: 75–100.
- Unscheduled package removal: +35.
- Three or more approaches within ten minutes: +25.
- Lingering at least 90 seconds in that interval: +25.
- Reported looking around in that interval: +10; never sufficient by itself.
- Package outside for over two hours: minimum 25.
- Observations below 0.7 source confidence do not contribute to scoring.
- Expected owner confirmation or a trusted pickup: normal. Owner-reported missing: incident, score 90.

For removal incidents, behaviour is evaluated in the ten minutes preceding removal. For ongoing deliveries it is evaluated against the current UTC time. Owner resolutions take precedence. No automatic identity learning or statistical personalization is claimed.

Notifications enter a durable outbox at score 25. Lights and warning messages require explicit owner approval at score 50. Dispatch rechecks current relevance and labels outcomes `simulated`; it never claims hardware success. Decisions already rejected or simulated are not automatically replayed for the same parcel. Outdated queued actions are cancelled when the state changes.

Run `python worker.py` beside the server, with the same exported owner key, for a maintenance/analysis/dispatch loop (60 seconds by default, 15 seconds in Compose). Alternatively, run `POST /v1/maintenance` periodically (for example, once per minute from your deployment scheduler) to enqueue unattended-package reminders and enforce retention without new camera events. Run `POST /v1/actions/dispatch` to consume the simulated outbox. Neither endpoint sends notifications to real devices.

### Optional AI

Bedrock is the default provider. Configure region and model IDs as described in STACK_SETUP.md. Visual analysis requires explicit opt-in (`DEMAFUR_VISION_ENABLED=true`). Model output is validated and cannot approve physical actions. If no AI provider answers, text summaries return a labelled local policy summary.

**AI provider modes**

| Mode | Settings | Behaviour |
|---|---|---|
| Default | `AI_PROVIDER` unset or `bedrock` | Bedrock first. If Bedrock is temporarily failing or unavailable to the account (not configured, AccessDenied, ValidationException such as "Error 002", ResourceNotFound) and `GROQ_API_KEY` is set, Groq answers instead. |
| Fallback off | `GROQ_FALLBACK_ENABLED=false` | Bedrock only. |
| Groq only (testing) | `AI_PROVIDER=groq` | Groq for all AI calls; Bedrock is never called. Not AWS usage. |

Every AI result records `provider`, `fallback_used` and `primary_error` (the Bedrock error that caused a fallback), so it is always visible which service answered. Refusals and invalid model output are never routed to Groq. Groq vision accepts at most three images, so Groq analyses use the first, middle and last sampled frame and add a reduced-coverage limitation.

Groq settings: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`. Current free-tier choice: `qwen/qwen3.8-27b` for both (the only Groq vision model; a preview model that may be withdrawn). Groq answers do not count as AWS Bedrock usage for the AWS Builder challenge.

> **Status (Oct 2026):** Bedrock is blocked on the team AWS account (Error 002; AWS support case open). Until it is resolved, AI answers come from the Groq fallback. When Bedrock access is restored, it is used automatically — no setting change needed. Review this section once Bedrock is confirmed working.

Legacy OpenAI support requires `AI_PROVIDER=openai`.

## Evidence and privacy

Evidence ZIPs include ordered observations, uncertainty, media references, report and neighbour-post drafts, and file checksums. Checksums verify exported file consistency, not authenticity of source footage. The backend does not fetch arbitrary URLs, identify people, post to neighbours, or submit police reports. It can now download authorized Ring event windows; it does not identify an optimal sub-clip automatically. The Ring pipeline includes downloaded event windows in ZIP exports (up to 64 MiB total); additional clips are individually downloadable from the review page. Missing recordings are never fabricated.

Default retention is 30 days, applied by maintenance to deliveries whose creation and latest observation are older than the cutoff, including incidents. Set `DEMAFUR_RETENTION_DAYS` to override. Export needed evidence before expiry. Cascade deletion removes events, windows, actions, evidence, and audit rows from the live database; database backups, and external recordings require separate storage lifecycle controls. Protect the database volume, backups, and credentials.

## Verification

```sh
pip install -r requirements-dev.txt
python -m pytest -q
```

Tests cover authentication, signed webhooks, concurrent retries, timestamp validation, event ordering, risk rules, pickup scope and timing, owner overrides, approval gates, ZIP hashes, retraction, persistence, retention, and deletion. Tests do not call real AI or hardware services.

## Deployment boundary

Dockerfile included; build with `docker build -t demafur .`, provide credentials through your platform, and mount a writable volume at `/data` for UID 10001. The container build has not been verified here.

This is a working single-household staging MVP, not a public multi-tenant deployment. Before external launch, add user accounts and household scoping, TLS and rate/body limits at the gateway, monitored jobs, secret rotation, backup/restore operations, and real provider adapters with delivery receipts and retry handling. PostgreSQL currently serializes workflow writes with a transaction lock; larger deployments need household-level locks and a scalable worker queue. Ring registration, recording permissions, provider credentials, and real camera validation are required to activate the new pipeline. Native Alexa, lights, actual push delivery and long-term personalized learning remain outstanding.
