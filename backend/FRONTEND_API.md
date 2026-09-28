# Frontend integration contract

The current Next.js `src/lib/api.ts` returns mock data. This backend update adds `GET /v1/dashboard` for real data but does not wire private data into the unauthenticated frontend. The login/signup pages currently do not establish sessions. Add verified user authentication and owner authorization before a server route forwards the household API key. Never use a NEXT_PUBLIC variable for that key or put an unprotected proxy in front of it.

## Dashboard

Send `Authorization: Bearer <DEMAFUR_API_KEY>` from a trusted server or the local staging client. In Swagger `/docs`, click Authorize and enter only the key. The public `/health` endpoint is liveness only; authenticated `/ready` verifies database connectivity.

`GET /v1/dashboard?activity_limit=20&delivery_limit=20` returns:

- `activePackages`: retained deliveries not collected or owner-reported missing, including awaiting delivery and pending confirmation.
- `historicalPackages`: retained collected deliveries plus owner-reported missing incidents. This is not a lifetime total; retention applies.
- `activeIncidents`: owner-reported missing deliveries. High risk alone never means confirmed theft. There is no separate incident-close workflow yet.
- `pendingConfirmations`: deliveries with an unconfirmed removal.
- `recentActivity`: newest events first, each with event_id, delivery_id, camera_id, kind, occurred_at, confidence and observations.
- `activeDeliveries`: up to delivery_limit active delivery summaries, newest created first, without full timelines. `activeDeliveriesTruncated` signals more records exist. Counts cover all retained records regardless of these limits.
- `monitoringStatus`: offline when Ring is not configured or disconnected; warning when configured but liveness is not established. Never treat configuration as evidence of healthy monitoring.
- `monitoringReason`, `integrations`, `generatedAt`: coverage context, provider configuration and generation timestamp. Credentials are never returned. Provider configuration does not verify permissions or a successful live invocation.

Limits accept integers 1..100. Endpoint requires owner auth, returns Cache-Control: no-store and performs no AI/hardware calls. Aggregate policy computation scans the retained single-household data using bulk reads. Large/multi-household deployments require scoped persisted projections.

## Correct the frontend types when connecting

Use the backend's actual statuses: awaiting_delivery, delivered, needs_confirmation, collected, incident.
Use four risk levels: normal, needs_confirmation, suspicious, high_risk. The current mock frontend's low/medium/high and active/missing/retrieved types are not the API contract. Do not silently collapse the confirmation state. Full delivery timelines are available from GET /v1/deliveries/{id}.

## Verify a deployment before wiring the frontend

With Python dependencies installed, run from backend:

```sh
python smoke_test.py
```

Enter the HTTPS API URL and household key at the prompts. The key is hidden. The script creates a uniquely named synthetic delivery, tests duplicate event handling, retrieval, dashboard and expected pickup confirmation, then deletes only that synthetic delivery in a finally block. It does not invoke AI, send notifications, or approve hardware actions. Synthetic events may be briefly visible to an already connected client. On network failure, cleanup may require retrying/deleting the printed synthetic ID.

No production credentials were available during development; the script is tested against the in-process API, not claimed as a completed production smoke test.
