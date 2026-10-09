# Persistent backend demo scenarios

`demo_scenarios.py` creates synthetic events through `/v1/events`. It is **not a Ring virtual camera**: no native Ring webhook, recording retrieval, AI call or action dispatch is performed. Unlike `smoke_test.py`, records remain visible until explicit cleanup.

| Scenario | Expected status | Demonstrates |
|---|---|---|
| normal | delivered | Package remains outside |
| trusted | collected | Window created before pickup suppresses an incident |
| uncertain | needs_confirmation | Removal alone requires owner confirmation |
| missing | incident | Owner-reported missing package enables evidence |

## Run against Render

From `backend/`, install `requirements.txt`. Obtain the current Render URL from your teammate; do not accidentally use the old Railway deployment. The key is requested at a hidden prompt, or read from `DEMAFUR_API_KEY`. Never put it in command-line arguments or Git.

```sh
python demo_scenarios.py seed --url https://YOUR-SERVICE.onrender.com --manifest data/demo-run.json
```

This creates actual records on the selected deployment. Coordinate with your team before seeding shared data. The backend may queue simulated notification/approval records; if real automatic dispatch is enabled later, isolate demo data first.

Each run has unique `demo-<UUID>` delivery/camera IDs. A private manifest records those IDs and the target URL before any writes. It contains no credentials. Seed refuses to overwrite an existing manifest. For a fresh run, choose a new manifest filename. After partial failure, use the existing manifest to clean up, then seed a new run.

Seeding also verifies saved lifecycle states, event counts, idempotent duplicate requests, and evidence rejection for non-incidents. The incident ZIP must contain evidence JSON, report/neighbor drafts and matching SHA-256 hashes, reference the correct delivery, and contain no invented recordings.

Verification artifacts go to `data/demo-results/`: an evidence ZIP and timestamped verification JSON. `real_camera_or_ai_verified: false` explicitly distinguishes this from hardware/model testing. Use `--output-dir PATH` to change the directory. Default data files are Git-ignored.

Repeat verification without changing records:

```sh
python demo_scenarios.py verify --manifest data/demo-run.json
```

Remove only this run:

```sh
python demo_scenarios.py cleanup --manifest data/demo-run.json
```

Cleanup validates exact generated IDs and checks every existing record's camera ID before any deletion. Missing records are tolerated and partial cleanup can be retried. Unrelated deliveries are never selected. Retain the manifest until cleanup succeeds. Manifests are not cryptographically signed; keep them under team control.

## Frontend demonstration

Use the printed delivery IDs in GET `/v1/deliveries/{id}`. The dashboard's active list excludes collected and incident deliveries; use delivery detail or the general delivery list to show those. The missing delivery's `/evidence` and `/evidence.zip` endpoints provide the report.

You can interactively confirm the uncertain delivery as `expected` or `missing`. That changes the baseline, so subsequent baseline verification should fail; cleanup still works. Seed a new run for the original four states. After two hours, normal deliveries may gain an unattended-package risk reason while remaining delivered.

## Local testing and limits

For local API development, set `DEMAFUR_LOCAL_DB=memory`, configure distinct owner/webhook keys and start Uvicorn. Use `--url http://127.0.0.1:8000`. HTTP is allowed only for loopback hosts. Memory data disappears when the server restarts; Firestore data persists until cleanup or retention.

`python -m pytest -q` runs these scenarios against the in-memory Firestore substitute, including partial failure, cleanup isolation and evidence retraction tests. This does not validate real Firestore indexes, transactions, Render disk persistence, Ring, or Bedrock. Run the script against the deployed API to verify that environment. For HTTP 500, inspect server logs for configuration/index requirements.

No live URL or credentials were supplied during development, so the live database has not been seeded. Existing frontend authentication, Firestore concurrency and Ring-worker issues are outside this contribution.
