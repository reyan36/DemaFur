<div align="center">

# DemaFur

### AI-Supervised Delivery Safety & Doorstep Theft Defense
An intelligent Ring camera companion that analyzes behavioral risk, defends packages against porch pirates, and generates cryptographically sealed incident evidence bundles.

<br/>

[![Live Dashboard](https://img.shields.io/badge/LIVE_DASHBOARD-VERCEL-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://demafur.vercel.app)
[![API Backend](https://img.shields.io/badge/API_BACKEND-RENDER-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://demafur.onrender.com)
[![Status Page](https://img.shields.io/badge/SYSTEM_STATUS-100%25_UP-10B981?style=for-the-badge&logo=uptimerobot&logoColor=white)](https://stats.uptimerobot.com/5q6oQH46Zd)
[![Amazon Hackathon](https://img.shields.io/badge/AMAZON_DEV-HACKATHON_2026-FF9900?style=for-the-badge&logo=amazon&logoColor=white)](https://aws.amazon.com/)

<br/>

[![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg?style=flat-square)](https://github.com/reyan36/DemaFur)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000.svg?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28.svg?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

<br/>

[Overview](#project-overview) • [System Architecture](#system-architecture) • [Features](#features) • [Technologies](#technologies) • [Live Status & Uptime](#live-status--uptime) • [Local Setup](#local-development) • [Developer](#developer)

</div>

---

## Project Overview

Over **260 million delivered packages** are stolen from doorsteps across North America every year. Most security systems simply dump raw, continuous footage onto homeowners, leaving them to manually scrub through hours of false alarms or discovery after the package is already gone.

**DemaFur** changes this paradigm:
* **Zero-Identity Behavioral Analysis**: Instead of intrusive, bias-prone facial harvesting or identity profiling, DemaFur operates on pure **behavioral physics** — observing linger durations, approach trajectory, displacement velocity, and departures.
* **Trusted Pickup Windows**: Authorize household members, couriers, or trusted neighbors with temporary time windows that automatically suppress alarms.
* **Forensic Evidence Bundle**: If theft occurs, DemaFur automatically compiles a sealed SHA-256 manifest containing police-ready report drafts, neighborhood notices, and footage clips.
* **Privacy-First**: *"Behavior over identity. Owner confirmation over assumptions."*

---

## System Architecture

The animated telemetry pipeline below illustrates how video and motion events stream from the doorstep camera into the behavioral engine, multimodal AI, realtime database, and dashboard:

<div align="center">
  <img src="docs/architecture-loop.svg" alt="DemaFur Animated Pipeline Telemetry" width="100%" />
</div>

```mermaid
sequenceDiagram
    autonumber
    participant Ring as Ring Doorbell / Simulator
    participant FastAPI as DemaFur Backend (FastAPI)
    participant AI as Multimodal AI (Bedrock / Groq)
    participant DB as Google Firestore
    participant UI as Next.js Dashboard
    
    Ring->>FastAPI: POST /v1/events (package_delivered)
    FastAPI->>DB: Ingest event & initialize delivery timeline
    Ring->>FastAPI: Motion event / lingering detected
    FastAPI->>AI: Evaluate optical scene & behavioral risk
    AI-->>FastAPI: Risk heuristics (score, reasons, displacement)
    FastAPI->>DB: Update delivery state (normal / suspicious / incident)
    DB-->>UI: Realtime push to owner dashboard
    UI->>FastAPI: Owner resolution (Expected / Missing)
    FastAPI->>DB: Seal SHA-256 evidence ZIP if incident confirmed
```

---

## Features

| Feature | Description |
| :--- | :--- |
| **Simulate a Camera** | Trigger 4 realistic doorstep scenarios: *Porch Pirate Theft*, *Suspicious Lingering*, *Safe Courier Drop-Off*, and *Authorized Pickup*. |
| **Optical Risk Heuristics** | Real-time classification into `normal`, `needs_confirmation`, `suspicious`, and `high_risk` based on dwell time and box displacement. |
| **Trusted Pickup Windows** | Create pre-authorized 30-minute retrieval windows that automatically verify parcel collection and suppress alerts. |
| **Forensic Evidence Packager** | One-click download of `demafur-evidence.zip` containing an immutable `sha256-manifest.json`, police report draft, and MP4 video clips. |
| **Dual AI Engine** | Primary reasoning on **AWS Bedrock** (Claude 3.5) with automatic failover to **Groq AI** (Qwen 2.5 Vision) for uninterrupted uptime. |
| **Google Authentication** | Secure household login backed by **Google Firebase Auth** protecting the surveillance portal from unauthorized access. |
| **One-Click False Alarm Dismissal** | Individual delete buttons on each delivery to dismiss false positives or clear test records instantly. |

---

## Technologies

The application is built using a modern, scalable, and high-performance stack:

* **Frontend**: [![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/) [![React 19](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/) [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
* **Backend**: [![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/) [![Python](https://img.shields.io/badge/Python_3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/) [![Pydantic](https://img.shields.io/badge/Pydantic_v2-E92063?style=flat-square&logo=pydantic&logoColor=white)](https://docs.pydantic.dev/)
* **Database & Auth**: [![Firebase Firestore](https://img.shields.io/badge/Firebase_Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/) [![Google Auth](https://img.shields.io/badge/Google_Auth-4285F4?style=flat-square&logo=google&logoColor=white)](https://firebase.google.com/docs/auth)
* **AI Engine**: [![AWS Bedrock](https://img.shields.io/badge/AWS_Bedrock-FF9900?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/bedrock/) [![Groq](https://img.shields.io/badge/Groq_AI-F05A28?style=flat-square&logo=groq&logoColor=white)](https://groq.com/)
* **IoT Hardware**: [![Amazon Ring](https://img.shields.io/badge/Amazon_Ring-0070F3?style=flat-square&logo=ring&logoColor=white)](https://developer.ring.com/)
* **DevOps & Monitoring**: [![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/) [![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=black)](https://render.com/) [![UptimeRobot](https://img.shields.io/badge/UptimeRobot-10B981?style=flat-square&logo=uptimerobot&logoColor=white)](https://stats.uptimerobot.com/5q6oQH46Zd)

---

## Live Status & Uptime

The production backend and database health are monitored 24/7 with automated 5-minute heartbeat telemetry to ensure zero cold-boot delays:

* **Live Status Dashboard**: [stats.uptimerobot.com/5q6oQH46Zd](https://stats.uptimerobot.com/5q6oQH46Zd)
* **Health API Endpoint**: `GET https://demafur.onrender.com/health`
* **Readiness Endpoint**: `GET https://demafur.onrender.com/ready`

---

## Local Development

### 1. Prerequisites
* **Node.js** v20+ & `npm`
* **Python** 3.11+ (optional, Render backend is accessible remotely)

### 2. Frontend Setup
```bash
# Clone the repository
git clone https://github.com/reyan36/DemaFur.git
cd DemaFur/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to open the dashboard.

### 3. Backend Setup (Optional)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run FastAPI backend
uvicorn demafur.app:create_app --factory --host 127.0.0.1 --port 8000
```

---

## Developer

* **Chaitanya Changala** — [@CChangala](https://github.com/CChangala)
* **Qinyi Lam** — [@griffburntwood](https://github.com/griffburntwood)
* **Reyan Arshad** — [@reyan36](https://github.com/reyan36)

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

<div align="center">
  <br/>
  <b>Built with ❤️ for the Amazon Developer Hackathon 2026</b>
</div>
