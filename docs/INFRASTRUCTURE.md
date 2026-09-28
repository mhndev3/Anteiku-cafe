# Infrastructure Architecture

Status: established by Agent 2. Architecture/documentation only — no
Dockerfiles or compose files are created this phase (see §9 for why).

## 1. Topology

```
Client (browser)
    ↓ HTTPS
Nginx (TLS termination, reverse proxy, static asset caching)
    ↓ (internal network, HTTP)
    ├── Next.js (frontend, SSR + static)
    └── FastAPI (backend API, /api/v1/*)
              ↓
        PostgreSQL   Redis   SMTP relay   File storage (local disk → S3/R2 later)
              ↑
        RQ worker(s) (background jobs; same codebase/image as the API,
                       different entrypoint/command)
```

Nginx is the single public entry point. Both Next.js and FastAPI are
internal-network-only in production — neither is directly reachable
from the internet, which is also what makes the CORS/cookie story in
`docs/SECURITY_ARCHITECTURE.md` simpler (Nginx can front both under one
apparent origin using path-based routing: `/api/*` → FastAPI, else →
Next.js — removing the need for CORS between frontend and backend
entirely in production, though the backend's CORS policy still applies
for local dev where they run on different ports).

## 2. Environments

**Development:** all services run locally (Docker Compose once
containerized — see §9). Hot-reload for both Next.js and FastAPI (`uvicorn
--reload`). A local Postgres and Redis container each, disposable
volumes acceptable. SMTP uses a local catch-all (e.g. Mailpit/MailHog)
— no real emails sent in dev.

**Production:** each service (Next.js, FastAPI, worker, Nginx) is its
own container/process, PostgreSQL and Redis are managed services where
possible (rather than self-hosted containers) for backup/failover
without custom ops work — self-hosted is acceptable if that's not
available, but backups (§8) become the team's own responsibility then.

## 3. Docker services (planned shape — not created this phase)

```yaml
services:
  nginx:      # reverse proxy, TLS termination (prod); simple proxy in dev
  frontend:   # Next.js
  backend:    # FastAPI (uvicorn/gunicorn+uvicorn workers)
  worker:     # same image as backend, command: rq worker
  postgres:   # official postgres:16 image, named volume for data
  redis:      # official redis:7 image, append-only persistence enabled
```

`backend` and `worker` share one Docker image (one `Dockerfile`,
different `command:`) so there's no risk of the two drifting apart in
dependencies. Each service gets its own health check
(`/healthz` for backend, `pg_isready` for postgres, `redis-cli ping`
for redis) so Compose/orchestrator restarts unhealthy containers
rather than routing traffic to a half-started one.

## 4. Nginx configuration shape

- TLS termination (prod: real cert via Let's Encrypt/ACME; dev: plain
  HTTP is acceptable locally)
- `client_max_body_size` set per the file-upload limits in
  `docs/SECURITY_ARCHITECTURE.md` §8
- Path routing: `location /api/ { proxy_pass http://backend:8000; }`,
  everything else `proxy_pass http://frontend:3000;`
- Sets `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Request-Id` (generates
  one if the client didn't send it) on every proxied request — FastAPI
  reads `X-Request-Id` to populate the `request_id` in its error
  envelope (`docs/BACKEND_ARCHITECTURE.md` §5)
- Security headers (`docs/SECURITY_ARCHITECTURE.md` §4) can be set here
  centrally rather than duplicated in FastAPI middleware, with FastAPI
  as the fallback for any response path that bypasses Nginx in dev

## 5. Environment variables (by service, names only — no values)

```
# backend
DATABASE_URL, REDIS_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY,
SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_ADDRESS,
STORAGE_BACKEND, STORAGE_ROOT (local) | S3_BUCKET/S3_REGION (future),
CORS_ALLOWED_ORIGINS, ENVIRONMENT (development|staging|production)

# frontend
NEXT_PUBLIC_API_BASE_URL   (public: the browser calls this directly
                             for client-side requests)
INTERNAL_API_BASE_URL      (server-only: used by Server Components /
                             any BFF route handler; not exposed to
                             the client bundle)
```

`.env.example` at the repo root and inside `backend/` documents every
one of these with a placeholder — real values only ever exist in
git-ignored `.env` files locally or injected secrets in deploy.

## 6. Networking

All inter-service traffic (Nginx→frontend, Nginx→backend, backend→
postgres/redis, worker→postgres/redis) stays on an internal Docker
network, not published to the host/internet. Only Nginx's 80/443
ports are published. Postgres/Redis are never given a public-facing
port in production, even for admin convenience — access for migrations
or one-off queries goes through a bastion/SSH tunnel or the deploy
platform's own tooling, not an open port.

## 7. Logging & observability

- **Structured logging** (JSON lines) from FastAPI, including a
  `request_id` (from Nginx's `X-Request-Id`, §4) on every log line for
  a request, so a single request's logs can be grepped/correlated
  across the API and worker.
- **Health checks:** `GET /healthz` (liveness: process is up) and
  `GET /readyz` (readiness: DB + Redis reachable) on the backend,
  used by the container orchestrator and by Nginx (route away from a
  not-ready instance if running >1 replica later).
- **Error tracking:** an exception-tracking service (e.g. Sentry) is
  the intended integration point (not wired up this phase) — the
  global exception handler (`docs/BACKEND_ARCHITECTURE.md` §5) is the
  single place that would report to it, so adding it later touches one
  file.
- **Metrics readiness:** the FastAPI app structure leaves room for a
  `/metrics` endpoint (Prometheus-style) later; not implemented now.
- What never appears in logs: passwords, raw tokens (only `jti`/id),
  full request bodies for auth endpoints, file contents.

## 8. Backups & persistence

- PostgreSQL: automated daily backups (managed-service default if
  using one; otherwise `pg_dump` on a cron in a sidecar/worker
  container, shipped off-host — a backup living on the same volume as
  the database it backs up protects against nothing).
- Redis: AOF persistence enabled for durability of rate-limit/session
  state across restarts, but Redis is not the system of record for
  anything that can't be regenerated (worst case: rate-limit counters
  reset, active RQ jobs are re-enqueued) — no backup strategy needed
  beyond AOF.
- File storage: local disk storage in early deployment must itself be
  backed up (it holds `FINAL_SOURCE` deliverables, unrecoverable
  otherwise) until migrated to S3/R2, which has its own durability.

## 9. Why no Dockerfiles/compose file are created this phase

This phase documents the target shape so Agent 3 implements the
backend directly against it. Writing Docker configuration before any
backend code exists would mean guessing at exact runtime commands,
dependency lists, and health-check paths that Agent 3's actual
implementation will determine — better decided alongside the code than
speculatively ahead of it. Agent 3 (or whichever agent first stands up
`backend/`) creates `backend/Dockerfile`, the root `docker-compose.yml`
(and `docker-compose.prod.yml` override), and `nginx/nginx.conf`
following exactly the shape in §1–6.

## 10. SMTP / email delivery

Required flows: registration verification, password reset, and a
security-alert class (login-brute-force lockout notice, password
changed confirmation) — see `docs/AUTHENTICATION_FLOW.md` for the
tokens these emails carry.

- **Delivery is always asynchronous:** the API enqueues an RQ job
  (`send_email`) and returns immediately; the request/response cycle
  never blocks on an SMTP round-trip. This keeps auth endpoints
  responsive and means a slow/down mail provider can't degrade login.
- **Config:** `SMTP_HOST/PORT/USERNAME/PASSWORD/FROM_ADDRESS` (§5), TLS
  required (STARTTLS at minimum, implicit TLS on 465 if the provider
  supports it) — plaintext SMTP is never used, even in dev (Mailpit
  supports STARTTLS for parity).
- **Retry strategy:** RQ's built-in retry (e.g. 3 attempts, exponential
  backoff) for transient SMTP failures; a job that exhausts retries
  moves to a dead-letter queue and raises an alert (not silently
  dropped) — a failed password-reset email is a support incident.
- **Rate limiting:** the same per-user limits in
  `docs/SECURITY_ARCHITECTURE.md` §6 already bound how often
  verification/reset emails can be triggered; the email job layer adds
  no separate limit on top.
- **Templates:** plain, server-rendered templates (Jinja2) per email
  type, not built client-side — keeps token URLs and copy consistent
  and testable without a browser.
- **Logging:** the job logs "verification email queued for user X" —
  never the token or the full URL containing it (§ `docs/SECURITY_ARCHITECTURE.md`
  §11). If a delivery fails, the log/alert includes the failure reason
  from the SMTP provider, not the email body.

## 11. Testing strategy (backend)

- **Unit tests:** domain + application layers, no DB/Redis — fast,
  the majority of tests. Includes every state-machine transition rule
  and every auth decision (password policy, token expiry math).
- **Integration tests:** repositories against a real (test) Postgres
  instance — verifies the SQL/ORM mapping actually works, not just
  that the interface is called correctly.
- **API tests:** `httpx.AsyncClient` against the FastAPI app,
  end-to-end through a route.

Security-specific cases that must exist before Agent 3's phase is
considered done (not exhaustive, but non-negotiable minimum):

- Unauthorized project access returns 404, not the resource (IDOR).
- Cross-user project/payment/file access is rejected for every
  resource type, not just Project.
- Expired access token is rejected; expired/used/invalid
  verification and reset tokens are rejected with a generic error.
- Refresh-token reuse triggers full-family revocation (§ `docs/AUTHENTICATION_FLOW.md` §6).
- `FINAL_SOURCE` download is rejected until `Payment.status == VERIFIED`,
  and is rejected again if that payment is later refunded.
- Rate limits actually return 429 once exceeded, for login and
  forgot-password specifically.
- A `CUSTOMER`-scoped request schema cannot set `status`/`amount`/
  `verified` fields even if included in the raw request body (mass
  assignment).
