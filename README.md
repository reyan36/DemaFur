# DemaFur
A Ring App that detects Package theft and alerts the owner

## Overview
DemaFur is an AI-powered delivery safety agent for the Amazon Developer Hackathon. Instead of relying on continuous facial recognition or identity tracking, DemaFur assesses **behavioral risks** (e.g., normal delivery vs. suspicious lingering) to protect packages, alert owners, and generate evidence bundles.

## Tech Stack Hierarchy
*   **Frontend (Web Dashboard)**: `Next.js` (React) - Hosted on Vercel
*   **Backend (Core Logic & API)**: `Python FastAPI` - Hosted on Railway
*   **Database (State & Events)**: `Supabase` (PostgreSQL) - Drop-in replacement for local SQLite
*   **AI (Risk Summaries)**: `AWS Bedrock` (Anthropic Claude / Amazon Titan) - Required for AWS Mini-Challenge. *(Fallback: Groq)*
*   **IoT/Hardware**: `Ring Webhooks` & `Alexa Skills`

## Current Progress
*   **Backend MVP (`backend/`)**: A functional FastAPI backend is implemented. It provides endpoints for event ingestion, delivery timelines, risk heuristics, trusted pickup windows, and evidence zip generation.
*   **Simulation (`backend/demo.py`)**: A script is available to mock camera events and test the risk policies locally.

## Parallel Development Phases

To move fast, we have split the remaining work into parallel tracks so everyone can work simultaneously:

### Phase 1: Foundations & Setup (Current)
- **Frontend**: Initialize the `Next.js` web dashboard in the `frontend/` folder. Implement the active packages view, incident alerts, and package timelines mocking data or connecting to the local backend.
- **AI/Cloud**: Migrate `db.py` to use **Supabase**, deploy the FastAPI app to **Railway** for a public webhook URL, and migrate `ai.py` to use **AWS Bedrock** to qualify for the AWS Builder Mini Challenge.
- **Hardware/Ring**: Set up the Ring Developer Portal. Connect a Ring Simulator (or real device) to send webhook events to the backend's `/v1/webhooks/events` with proper HMAC-SHA256 signatures.

### Phase 2: Integration
- Hook up the Next.js Frontend directly to the live Railway Backend APIs.
- Enhance the AI text summaries using AWS Bedrock context.
- (Optional) Connect Alexa skills for voice announcements using the backend outbox.

### Phase 3: Polish
- Finalize the UI/UX.
- Record the 3-minute hackathon demo video.
- Submit the project!

## Required Resources
1. **AWS Account**: Make sure to use the $150 AWS Credits form. Access to **AWS Bedrock** models must be explicitly requested in the AWS console.
2. **Ring Developer Account**: Register at [developer.ring.com](https://developer.ring.com/).
3. **Supabase & Railway**: Set up free tier accounts to host the database and backend.

## Running the Backend Locally
Check the [Backend README](./backend/README.md) for full instructions.

```sh
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
export DEMAFUR_API_KEY="your-secret-key"
export DEMAFUR_WEBHOOK_SECRET="your-webhook-secret"
uvicorn demafur.app:create_app --factory --host 127.0.0.1 --port 8000
```
