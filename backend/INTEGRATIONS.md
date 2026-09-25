# Integration status — 0.2

| Component | Implemented | Live validation |
|---|---|---|
| Ring account linking | Code exchange, unclaimed-token store, authenticated nonce claim, POST + PATCH completion | Needs registered Ring app and actual callback validation |
| Ring events | Native raw-body HMAC verification, household scope, event deduplication, immediate observation and persistent queue | Needs live webhook delivery |
| Recordings | Authorized bounded MP4 download, actual/partial timing, refresh-token rotation | Needs camera recording permission and FFmpeg |
| Visual analysis | Bedrock Converse image/tool requests (optional Groq fallback) using sampled frames, structured observations, frame/time validation, no identity recognition | Needs AWS account/model access; accuracy against real recordings unmeasured |
| Web review | `/review`: connections, watches, timelines, explanations, confirmations, trusted pickup, clip/evidence downloads | HTTP/assets covered by tests; visual browser pass still needed |
| Evidence | Includes downloaded event clips, metadata, hashes and drafts; archive inclusion capped at 64 MiB | Needs real recording test |
| Alexa, lights, real notifications | Existing intent/outbox interfaces only; action dispatch remains explicitly simulated | Not connected |
| Personalized learning | Not implemented | Future work |

Follow [LIVE_SETUP.md](LIVE_SETUP.md) to connect the first household. Configure secrets locally; do not put them in GitHub or chat.

The worker processes one job per call with a 15-minute lease and five bounded attempts for retryable failures. Failed analysis is visible and manually retryable. It uses one camera view per explicitly selected parcel watch; this avoids pretending that camera motion establishes parcel identity.

The previous local `demo.py` is still a synthetic workflow demo. Its recording references do not become real videos. The new mocked-provider tests verify integration contracts without claiming actual provider access.
