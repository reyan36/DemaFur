# DemaFur edge detector

The camera-side "brain" of DemaFur. It watches a front door camera feed, tracks people and the
package on every frame, turns what it sees into doorstep events, and sends them to the DemaFur
backend. When the backend decides the package is at risk, the edge detector runs the deterrents
(porch lights and a spoken warning) straight away, while the person is still at the door.

```
camera / video ──► detector.py (YOLOE + ByteTrack) ──► scene.py (events) ──► bridge.py ──► backend
                                     │                                                       │
                                     └── stream.py: live annotated view       porch.py ◄─────┘ auto_deterrents
```

It runs on its own machine-side environment (PyTorch is ~1 GB), separate from the backend, the
same way a real doorbell or camera hub detects on the device and sends only events to the cloud.

## What it detects

| Event | Rule |
|---|---|
| `package_delivered` | A package is seen twice, one second apart, in the same place. Its spot is then locked and watched. |
| `person_approached` | A tracked person comes within 120 px of the package. |
| `person_lingering` | A person stays near the package for `--linger` seconds (default 90). |
| `package_touched` | A person's box overlaps the package. Includes `came_from_door`. |
| `package_removed` | The package spot looks different from the locked snapshot for 0.6 s while nobody is covering it. |
| `person_left` / `entered_home` | A person is unseen for 2 s. `entered_home` if their last position was in the `--door` area. Includes `carried_package` and `came_from_door`. |

People are tracked by a per-camera number that resets when they leave view. There is no face
recognition, identity, or demographic inference. "Stranger" means someone handling the package
when no pickup is expected, not a recognised person.

## Setup

Python 3.11+ (tested on 3.13/3.14). From the repository root:

```sh
cd edge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The first run downloads the YOLOE model (~30 MB) and its text encoder automatically. Model files,
videos and `.venv` are git-ignored.

Put a door video at `edge/videos/porch.webm` (or pass `--source`). Record your own: a phone held
high, like a doorbell camera, 15–30 s, with a parcel visible on the ground.

## Run

Detection only (no backend), events printed to the terminal:

```sh
python run.py
```

With the backend (start it first as described in `backend/README.md`, with the same webhook
secret):

```sh
export DEMAFUR_WEBHOOK_SECRET="<same value as the backend>"
python run.py --loop
```

On Windows (PowerShell) activate with `.venv\Scripts\Activate.ps1` and set the secret with
`$env:DEMAFUR_WEBHOOK_SECRET = "<same value as the backend>"`.

Then open the live annotated view at http://127.0.0.1:8090/. The dashboard shows the same stream
when `frontend/.env.local` contains `NEXT_PUBLIC_EDGE_STREAM_URL=http://127.0.0.1:8090`.

| Option | Meaning |
|---|---|
| `--source PATH\|0` | Video file (played at real speed, dropping frames when detection is busy) or webcam index. |
| `--loop` | Replay the file when it ends. |
| `--backend URL` | Backend URL (default `DEMAFUR_URL` or `http://127.0.0.1:8000`). |
| `--delivery ID` | Delivery ID for this run (default `edge-<random>`). |
| `--camera ID` | Camera ID (default `front-door`). |
| `--door x1,y1,x2,y2` | House entrance area in pixels; enables resident detection (`entered_home`, `came_from_door`). |
| `--linger SECONDS` | Lingering threshold (default 90). |
| `--port N` | Live view port (default 8090). |
| `--record FILE.mp4` | Also save the annotated video. |
| `--no-window` | Do not open the OpenCV window (live view and recording still work). |

Press `q` in the video window to stop.

## Against the deployed backend (Firestore)

`DEMAFUR_LOCAL_DB=memory` keeps everything in the backend process. To store the deliveries in
Firestore and see them on the deployed dashboard, point the edge detector at Render instead:

1. Render: `DEMAFUR_WEBHOOK_SECRET` must be set (24+ characters, different from `DEMAFUR_API_KEY`).
   Leave `DEMAFUR_LOCAL_DB` unset. `DEMAFUR_AUTO_DETER` defaults to on.
2. Edge laptop: set the same `DEMAFUR_WEBHOOK_SECRET`, then
   `python run.py --loop --backend https://demafur.onrender.com`. The first event can take up to a
   minute while Render wakes up; the edge keeps the video running meanwhile.
3. Vercel: add `NEXT_PUBLIC_EDGE_STREAM_URL=http://127.0.0.1:8090` and redeploy (it is baked in at
   build time). Browsers allow an `https` page to load `http://127.0.0.1`, so the live view works
   on the laptop running the edge detector; other viewers see "Camera offline" unless you expose
   port 8090 over HTTPS (for example `cloudflared tunnel --url http://127.0.0.1:8090`) and use
   that URL instead.

Every `--loop` lap is a new delivery saved in Firestore, and each lap that ends in a removal adds
an active incident. Clear demo data with `POST /v1/deliveries/purge` (owner key) between runs.

## How it talks to the backend

Each event is posted to `POST /v1/webhooks/events`, signed with HMAC-SHA256 over
`<unix timestamp>.<raw body>` using `DEMAFUR_WEBHOOK_SECRET` (headers `X-Demafur-Timestamp`,
`X-Demafur-Signature`). Sending runs on a background thread so a sleeping backend never freezes
the video. The backend replies with the delivery's risk and, when auto-deter is on
(`DEMAFUR_AUTO_DETER`, default on), the deterrents to run now.

Risk, in short (`backend/demafur/risk.py`):

- Outsider touches the package and no pickup window is scheduled → **suspicious** → lights + warning immediately.
- Package removed → needs confirmation; the person then leaves with it, not from the door → **high risk**, counted as an active incident.
- Someone who came out of the door carries it inside → **collected** (normal).

## Simulated hardware

There is no Ring speaker or floodlight in this project. The warning is spoken through the
computer's speaker (macOS `say`, Windows speech, or Linux `spd-say`/`espeak`) and the porch lights are shown by brightening the video with a
badge. `porch.py` is where a real Ring Floodlight or Chime call would go.

## Footage

Make clear in any demo which footage comes from Ring (Ring Developer Playground streams) and which
is your own recording. Do not publish stock footage without a licence.
