# Verification

- Python 3.14.5; FastAPI 0.141.1; SQLite persistence.
- `python -m pytest -q`: **27 passed**, 0 failures.
- One upstream test-client deprecation warning: Starlette recommends httpx2; the pinned httpx test client works in this tested environment.
- Started Uvicorn on localhost and verified `/health` over HTTP.
- Ran `demo.py` against the live server: signed events escalated normal → needs confirmation → suspicious → high risk.
- Confirmed the package missing and downloaded the evidence ZIP successfully.
- Stopped the temporary verification server after completion.
- AI response parsing and provider failure handling tested with mocked responses; no real AI API request made.
- Real Ring/Alexa/light/notification integrations, video extraction, and Docker build not tested or connected.
