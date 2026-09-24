# What works and what must be connected

This backend is the delivery workflow service, not yet a connected Ring/Alexa application.

| Component | Implemented now | Required for real operation |
|---|---|---|
| Delivery events | Validated normalized events, signed DemaFur webhook, deduplication, timelines | Ring application registration, account linking, authorized API access, native event verification and translation |
| Behaviour observations | Accepts structured approach/lingering/removal observations | Event-triggered video or image analysis to produce those observations; parcel correlation |
| Risk | Explainable deterministic policy with uncertainty and owner confirmation | Evaluate thresholds against representative real recordings |
| AI | Optional OpenAI narration of existing facts, local fallback | API key and model configuration; this is not visual analysis |
| Alexa | Authenticated intent endpoint | Actual skill, intent mapping, request authentication, account linking and supported announcement mechanism |
| Lights and warnings | Owner approval and durable simulated dispatch | Device-specific authorized adapters, execution receipts and retries |
| Notifications | Durable simulated outbox | Push/email/SMS provider and user/device subscriptions |
| Evidence | Timeline, JSON, recording references, report drafts, ZIP hashes | Authorized recording retrieval, clip extraction, protected media storage and retention |
| Personalization | None; no identity tracking | Opt-in aggregate behaviour learning and evaluation |

## Intended data flow

Ring event → verified Ring adapter → authorized event footage → behaviour analysis → normalized DemaFur event → timeline/risk policy → owner confirmation or approval → notification/device adapter.

If the owner reports a missing package, the evidence workflow also needs a media worker to retrieve and trim authorized footage. Current ZIPs contain references, not the actual recordings.

## Ring

Official Ring developer documentation describes OAuth account linking, server-to-server API calls and event webhooks. Our `/v1/webhooks/events` signature format is internal to DemaFur and must not be confused with Ring's native contract. A Ring adapter must verify and translate real Ring events before forwarding observations. A camera motion event alone does not establish lingering, repeated approaches, package removal, or theft.

- Developer portal: https://developer.ring.com/
- Development guide: https://developer.amazon.com/docs/ring/develop.html

The team must register/configure its application and determine the available camera and recording permissions. Secrets should be supplied through deployment configuration, never committed to GitHub.

## Alexa and physical actions

The existing `/v1/assistant/query` can provide answers to an authenticated adapter. It is not itself an Alexa skill endpoint. A native skill must map requests to these intents and perform the appropriate request verification and account linking. Proactive events require the relevant Alexa permissions and authorization; arbitrary spoken announcements are not assumed to be available through a generic REST call.

- Alexa event authorization: https://www.developer.amazon.com/docs/alexaplus/smarthome/send-events-to-the-alexa-event-gateway.html

The current dispatcher explicitly returns `simulated` and `physical_actions_performed: false`. It never turns on a light, plays a warning, or sends a real notification.

## Why the current demo runs without integrations

`demo.py` supplies synthetic, structured observations. This lets the team verify the backend workflow independently of camera hardware and developer-account setup. It proves the service's event/decision/evidence flow, not the accuracy of visual behaviour recognition or end-to-end hardware integration.
