# DemaFur friction log

Problems we hit while building DemaFur on the Ring Partner API and its supporting services during
the Amazon Developer Hackathon, with what we did about them.

| # | Area | Severity |
|---|---|---|
| 1 | Ring: Developer Playground does not deliver webhooks | High |
| 2 | Ring: no synthetic devices or recordings to test against | High |
| 3 | Ring: account linking needs a public HTTPS deployment first | Medium |
| 4 | Ring: webhook signing and v1.1 payload are hard to verify without a sample sender | Medium |
| 5 | Ring: no partner API to trigger lights, sirens or chimes | Medium |
| 6 | Firestore: free-tier read quota exhausted by a polling dashboard | Medium |
| 7 | Render free tier: cold starts make the first webhook time out | Low |

---

## 1. Ring Developer Playground does not deliver webhooks

- **Task:** Receive `motion_detected` and `button_press` events at our webhook to drive the parcel-risk pipeline end to end.
- **Steps:** Registered an app in the Ring developer console, set the webhook URL to our Render deployment, opened the Developer Playground and triggered events there.
- **Expected:** Playground events delivered to the registered webhook URL, signed with the app's HMAC key, so the full path can be tested without hardware.
- **Actual:** The Playground gives a short-lived token and an API explorer, but no webhook reached our endpoint. Our team has no physical Ring device.
- **Severity:** High. Webhooks are the core of any reactive Ring integration, and without them the main path cannot be demonstrated.
- **Workaround:** We built a sandbox mode: one synthetic doorbell, and Ring-format v1.1 events signed with our real HMAC key and sent through the same webhook handler (`backend/demafur/pipeline.py`), plus a CLI (`backend/ring_simulator.py`) that posts signed events to the public webhook URL.
- **Suggestion:** Let the Playground (or a "Send test event" button in the developer console) deliver signed sample webhooks of every event type to the app's registered URL.

## 2. No synthetic devices or recordings to test against

- **Task:** Exercise `GET /devices`, camera selection and the recording download used for clip analysis.
- **Steps:** Called the device and recording endpoints with a Playground token.
- **Expected:** A sandbox account with one or two virtual cameras and sample recordings.
- **Actual:** Without real hardware there are no devices or recordings to list or download, so the device picker and the clip pipeline cannot be tested.
- **Severity:** High.
- **Workaround:** The sandbox returns a synthetic device and skips the clip download; clip analysis is covered by unit tests with mocked responses only.
- **Suggestion:** A sandbox household with virtual cameras that emit scripted events and serve short sample clips.

## 3. Account linking needs a public HTTPS deployment first

- **Task:** Test the Ring-driven account-linking flow (token exchange URL, account link URL, nonce verification).
- **Steps:** Tried to run the flow against a local backend.
- **Expected:** A way to test linking against `localhost`, or a documented tunnel setup.
- **Actual:** Every callback URL must be public HTTPS, so each change to the linking code needed a deploy to Render before it could be tried.
- **Severity:** Medium. It slowed iteration.
- **Workaround:** Deployed early to Render and tested linking there.
- **Suggestion:** Allow `http://localhost` callback URLs for apps in development status, as many OAuth providers do.

## 4. Webhook signing and payload shape are hard to verify

- **Task:** Implement HMAC verification of the `X-Signature` header and parse the v1.1 envelope (`meta`, `data.attributes`).
- **Steps:** Wrote the verifier and parser from the documentation.
- **Expected:** A sample signed request (body, key, signature) in the docs to test against.
- **Actual:** With no events arriving (see 1), we could not confirm byte-for-byte that our signature check and timestamp handling match what Ring sends.
- **Severity:** Medium.
- **Workaround:** Followed the documented format closely and covered it with tests; the simulator signs exactly what the handler verifies.
- **Suggestion:** Publish a test vector (key, raw body, expected signature) and a JSON schema for each event type.

## 5. No partner API to act on the porch

- **Task:** Deter a thief while they are still at the door: turn on the porch light and play a warning.
- **Expected:** Partner endpoints to switch a Floodlight Cam's light, sound a siren or play a Chime message, with the owner's consent.
- **Actual:** We could not find partner-accessible control endpoints in the documentation, so the deterrents are simulated (spoken warning through a laptop speaker and a brightened video).
- **Severity:** Medium. Prevention, not just recording, is the most valuable part of the idea.
- **Workaround:** Simulated deterrents in the edge detector (`edge/porch.py`).
- **Suggestion:** Scoped, owner-approved control endpoints for lights, sirens and chime announcements.

## 6. Firestore read quota and a polling dashboard

- **Task:** Keep the dashboard current while a camera produces events.
- **Actual:** Polling every few seconds re-read every delivery and event; on Firestore's free tier this would use the 50k daily reads within minutes, and `/v1/deliveries` took about 12 s for six packages.
- **Severity:** Medium.
- **Workaround:** Server-side caching until data changes, bulk reads instead of per-delivery queries, parallel reads and batched writes on ingest, and no polling while the tab is hidden.

## 7. Render cold starts

- **Task:** Receive the first webhook after the service has been idle.
- **Actual:** The free instance can take about a minute to wake, longer than many senders wait.
- **Severity:** Low for a hackathon, high in production.
- **Workaround:** Long client timeouts and an uptime monitor pinging `/health`.
