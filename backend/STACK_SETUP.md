# DemaFur: Supabase, Railway and Bedrock

## Architecture and current scope

Next.js on Vercel → authenticated FastAPI on Railway → Supabase PostgreSQL.
Ring webhooks → event timeline → queued clip/frame processing → Bedrock → validated observations → risk policy and owner review.
Groq is an optional transient-error fallback. Alexa, lights and push delivery still require real adapters; current action dispatch is simulated. Ring calls are implemented but not live-verified. The existing review console is not the team's Next.js dashboard.

## 1. Supabase

Create a Supabase project. In **Connect**, copy its PostgreSQL session-pooler connection string (IPv4-compatible); replace the password locally, URL-encoding special characters. Put it in Railway's `DATABASE_URL`. Keep `DATABASE_SSLMODE=require`; use `verify-full` with an appropriate trusted certificate for stronger server identity verification. Never put this URL in frontend variables.

Install backend requirements and export environment variables, then run:

```sh
python -m demafur.migrate
```

The migrator uses `MIGRATION_DATABASE_URL` if set, otherwise `DATABASE_URL`. It applies checksummed, versioned migrations transactionally. Existing SQLite records are NOT transferred automatically; this initializes a fresh PostgreSQL database. Retain/export any needed prototype records before switching.

Tables live in the private `demafur` schema, with PUBLIC privileges revoked. Do not expose this schema through Supabase's Data API. Next.js calls FastAPI, not these tables directly. No Supabase service-role API key is needed for the PostgreSQL connection. For production, use a separate least-privilege runtime database role with schema USAGE, table SELECT/INSERT/UPDATE/DELETE and sequence USAGE/SELECT, while retaining DDL permissions only for migrations.

Free projects may pause after seven days of low activity. Restore them in the Supabase dashboard when necessary. Repeated requests are not a contractual guarantee against pausing; paid plans are the documented option when uninterrupted availability matters. `/health` checks process liveness only; authenticated `/ready` actually checks the database. No keep-alive automation has been created.

## 2. AWS and Bedrock

Yes: create an AWS account to run Bedrock. Ring/Amazon developer onboarding is separate. Set up billing alerts and use a scoped IAM identity or supported Bedrock credentials. Alerts are not a hard spending cap. Check hackathon resources for the AWS credit request before assuming usage is free.

Select a region and available model. Set `AI_PROVIDER=bedrock`, `AWS_REGION`, `BEDROCK_MODEL_ID` and `BEDROCK_VISION_MODEL_ID`. For vision, select a model that supports image inputs, Converse and forced tool use (for example an eligible Claude model); a Titan text/embedding model is not interchangeable with a vision model. Complete any required Anthropic first-time-use form and model/Marketplace access setup. Inference profiles can require additional resource permissions.

The backend uses boto3's credential chain. On Railway, configure scoped credentials in secret variables, including `AWS_SESSION_TOKEN` for temporary credentials, or a supported `AWS_BEARER_TOKEN_BEDROCK` credential. Do not set several credential methods at once. Keep credentials out of Git and Vercel browser variables. Grant only the model invocation permissions needed for the chosen model/profile. Rotate credentials and prefer temporary credentials where feasible.

Set `DEMAFUR_VISION_ENABLED=true` when ready for image processing. Bedrock receives sampled JPEG frames, contextual instructions and a strict observation tool schema. Application validation rejects unsupported fields, invalid frame references and insufficient visual evidence. Risk policy and owner approval remain deterministic. Text summaries fall back to local templates on failure.

Optional Groq: set `GROQ_FALLBACK_ENABLED=true`, `GROQ_API_KEY`, `GROQ_MODEL` and a currently supported image-capable `GROQ_VISION_MODEL`. Fallback only handles transient Bedrock failures, not access/configuration errors or safety refusals. Vision fallback sends up to three frames, records original frame indices and warns about reduced temporal coverage. Results identify the actual provider; a Groq result is not evidence of AWS runtime usage. Free quotas/availability are not guaranteed.

## 3. Railway

Create an API service from this repository with root directory `backend` and the included Dockerfile. Set the pre-deploy command to `python -m demafur.migrate`. Configure secrets from `.env.example` in Railway, not in Git. The container respects Railway's `PORT` variable.

Attach a persistent volume at `/data`, writable by container UID 10001, and set `DEMAFUR_DATA_DIR=/data` and `DEMAFUR_MEDIA_DIR=/data/media`. Supabase stores structured records; Ring tokens and clips still use this volume. Tokens have restrictive file permissions but are not application-encrypted. Use an encrypted volume or managed secret store. Run one API process/replica because token refresh coordination is in-process. Do not deploy clips/tokens onto ephemeral storage.

Run a second service using the same backend image with start command `python worker.py`. Set `DEMAFUR_URL` to the API's reachable internal URL (including its listening port), `DEMAFUR_API_KEY` to the same household secret, and the worker interval. The worker calls the API; it does not need direct DB credentials or a shared volume. Add HTTPS, request-size/rate limits and operational monitoring before exposure.

Check `/health`, then `/ready` with the owner bearer token. `/ready` must report `postgresql`. Perform a delivery, trusted pickup, unexpected pickup, owner confirmation and evidence export. Verify restart persistence. Run a Ring simulator before connecting a physical camera; follow LIVE_SETUP.md for callback URLs and linking.

## 4. Next.js / Vercel

Keep the long-lived FastAPI key in server-only Vercel variables, never `NEXT_PUBLIC_*`. Authenticate users in Next.js and authorize their requests before forwarding through a server-side route. Do not create an unauthenticated proxy that blindly adds the owner key. This backend currently serves one household; user accounts and household-scoped authorization are required before offering it to multiple households. Set `DEMAFUR_CORS_ORIGINS` to exact allowed development/deployed frontend origins when direct browser access is used.

## 5. Hackathon evidence

AWS Builder: demonstrate an actual successful Bedrock request and include the integration code, selected model/region, architecture, and a redacted request ID/token usage receipt. Completed analysis jobs include provider/model/request ID/usage metadata; configuration or mocked tests alone do not prove live use. Describe the integration in the required product feedback/submission fields. No live AWS receipt has been produced yet.

Open Source: the repository already has an MIT license. The mini-challenge calls for an additional open-source project or contribution during the hackathon window. A reusable Ring adapter contribution with tests/docs could be a concrete additional contribution; do not assume simply making the primary app public qualifies. Supply the real contribution URL, repository URL, GitHub username and what/how/why description. A branch/fork/unmerged PR can qualify under the published rules. Verify all eligibility and submission requirements; qualification and prizes are not guaranteed.

## Shared repository hygiene

Commit `.gitignore`, `.env.example`, migrations, source, tests and documentation. Never commit `.env`, actual credentials, recordings, token files, database dumps or local environments. `.gitignore` is meant to be shared. If a secret was previously committed, ignoring it later does not remove it from history: rotate it and remove it appropriately.

## Sources checked during implementation

- [Hackathon resources and AWS credits](https://amazonappdev2026.devpost.com/resources)
- [Hackathon rules and mini-challenges](https://amazonappdev2026.devpost.com/rules)
- [Supabase production guidance](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Bedrock getting started](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html)
- [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [Groq vision limits](https://console.groq.com/docs/vision)
- [Railway FastAPI](https://docs.railway.com/guides/fastapi)
