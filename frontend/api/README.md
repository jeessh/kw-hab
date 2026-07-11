# `api/` — FastAPI on Vercel (same-origin backend)

`api/index.py` is a Vercel Python serverless function that mounts the FastAPI
backend under `/api`, so the frontend and backend share one origin and the
`SameSite=Lax` auth cookie keeps working.

## ⚠️ `api/app/` is a COPY of `../backend/app`

Vercel only bundles files under this project's root directory, so the backend
package is copied here rather than symlinked. **`backend/app` is the source of
truth.** After changing backend code, re-sync:

```bash
cd frontend
rm -rf api/app
rsync -a --exclude '__pycache__' --exclude '*.pyc' --exclude '.venv' \
  ../backend/app/ api/app/
```

## Required Vercel env vars (Production)
- `DATABASE_URL` — Supabase **transaction pooler** string (port 6543),
  prefixed `postgresql+psycopg://`
- `JWT_SECRET` — same value as `backend/.env`
- `COOKIE_SECURE` — `true` (Vercel is HTTPS)
- `NEXT_PUBLIC_API_URL` — `/api`
- `FRONTEND_ORIGIN` — the deployed URL (used for CORS)
