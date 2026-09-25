# Verification — version 0.3

Local Python 3.14: **62 passed, 2 skipped**. The skipped tests require a real, dedicated PostgreSQL database. Existing SQLite workflow regression tests and mocked Ring/provider tests pass. One upstream Starlette/httpx deprecation warning remains.

New tests cover PostgreSQL parameter binding and explicit configuration, Bedrock Converse text/image/tool requests, provider attribution, schema/frame validation, transient-only Groq fallback, credential failures, refusals and reduced-image fallback. GitHub Actions includes a PostgreSQL 16 service to run real migration/workflow/concurrency tests once uploaded. That workflow has not been executed here.

No Supabase, AWS, Groq or Ring live credentials were supplied. PostgreSQL migrations, SDK execution against AWS, real camera footage/FFmpeg decoding, model accuracy, Docker builds and Railway/Vercel deployments remain unverified. Provider tests use mocked responses. The psycopg and boto3 dependencies could not be installed in this network-restricted environment. No existing SQLite records have been migrated to Supabase.

The backend is a single-household staging implementation. Alexa, lights and notifications remain simulated. Next.js dashboard implementation and production multi-household authorization are outstanding.
