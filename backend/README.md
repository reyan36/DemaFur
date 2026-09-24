# DemaFur backend

Runnable FastAPI + SQLite MVP for a single household. Connect your web frontend to the REST API. It groups camera observations into delivery timelines, explains heuristic risks, supports trusted pickups, asks for owner confirmation, records action approvals, and exports evidence drafts.

The supplied diagram is treated as design reference. Its identity-tracking label is intentionally excluded in favour of the written privacy requirements. No facial recognition, person IDs, demographic inference, or continuous video monitoring is implemented.

## Run locally

Python 3.11+ is required (tested on 3.14).

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DEMAFUR_API_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
export DEMAFUR_WEBHOOK_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
uvicorn demafur.app:create_app --factory --host 127.0.0.1 --port 8000
```

Use two different secrets, each at least 24 characters. `.env.example` lists configuration; the application does not automatically load `.env`. Export variables through your shell or deployment secret manager. Keep keys server-side; this shared household token is suitable for a local prototype. A public web app needs individual login/session management and a backend-for-frontend so the long-lived owner token is not shipped in browser assets.

Interactive API documentation: http://127.0.0.1:8000/docs. Supply `Authorization: Bearer <DEMAFUR_API_KEY>` in the header field for owner endpoints. OpenAPI is at `/openapi.json`, with a checked-in copy at `openapi.json`.

In a second terminal with the **same exported secrets**, run:

```sh
python demo.py
```

The demo sends signed observations, demonstrates escalation, records an owner-reported missing package, and downloads a ZIP. It does not approve physical actions. Its media paths are illustrative, not real recordings.

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

Event kinds: `package_delivered`, `motion`, `person_approached`, `person_lingering`, `package_removed`, `entered_home`, `doorbell`. The bridge supplies observations; this API does not extract behaviour from pixels. Entering home is preserved as context but does not prove a pickup was authorized. No unstructured camera text is accepted. Unknown fields are rejected.

Assign one stable delivery ID per parcel lifecycle and one globally unique event ID per source event. The bridge must correlate observations with a parcel; automatic multi-package camera correlation is not implemented. Repeated identical events return 200 without duplicate side effects; reuse with changed content returns 409. Events may arrive out of order and are displayed by occurrence time; naive timestamps and events over five minutes in the future are rejected. Up to 2,000 observations per delivery are supported.

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

Run `python worker.py` beside the server, with the same exported owner key, for a 60-second maintenance/dispatch loop. Alternatively, run `POST /v1/maintenance` periodically (for example, once per minute from your deployment scheduler) to enqueue unattended-package reminders and enforce retention without new camera events. Run `POST /v1/actions/dispatch` to consume the simulated outbox. Neither endpoint sends notifications to real devices.

### Optional AI

Set both `OPENAI_API_KEY` and `OPENAI_MODEL` to enable text-only narration through the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text). Without them, everything runs locally with deterministic summaries. Provider failures fall back to a local summary. AI has no tools and cannot approve actions or change risk scores. Only bounded event facts and policy conclusions are sent; no images or camera IDs. `store` is false; this is not a claim of zero provider retention. Narration is explicitly marked for review.

The assistant accepts `package_status`, `today_summary`, and `safety_status`, optionally scoped by `delivery_id`. Day boundaries use UTC. These are frontend/voice-bridge intents; native Alexa request verification and account linking remain to be connected.

## Evidence and privacy

Evidence ZIPs include ordered observations, uncertainty, media references, report and neighbour-post drafts, and file checksums. Checksums verify exported file consistency, not authenticity of source footage. The backend does not fetch arbitrary URLs, cut video clips, identify people, post to neighbours, or submit police reports. Connect an authorized recording store and clip worker for actual media export.

Default retention is 30 days, applied by maintenance to deliveries whose creation and latest observation are older than the cutoff, including incidents. Set `DEMAFUR_RETENTION_DAYS` to override. Export needed evidence before expiry. Cascade deletion removes events, windows, actions, evidence, and audit rows from the live database; SQLite pages, backups, and external recordings require separate storage lifecycle controls. Protect the database volume, backups, and credentials.

## Verification

```sh
pip install -r requirements-dev.txt
python -m pytest -q
```

Tests cover authentication, signed webhooks, concurrent retries, timestamp validation, event ordering, risk rules, pickup scope and timing, owner overrides, approval gates, ZIP hashes, retraction, persistence, retention, and deletion. Tests do not call real AI or hardware services.

## Deployment boundary

Dockerfile included; build with `docker build -t demafur .`, provide credentials through your platform, and mount a writable volume at `/data` for UID 10001. The container build has not been verified here.

This is a working single-household MVP, not a public multi-tenant deployment. Before external launch, add user accounts and household scoping, TLS and rate/body limits at the gateway, monitored jobs, secret rotation, migration tooling and backups, and real provider adapters with delivery receipts and retry handling. SQLite serializes writes; use PostgreSQL and a worker queue for larger deployments. Ring credentials/recording access, native Alexa, lights, actual push delivery, video extraction, and long-term personalized learning are integration work still outstanding.
