Status: established by Agent 2. Supersedes the Next.js-API-routes
assumption in `docs/ARCHITECTURE.md` §1/§2/§6 — see the note added
there. Nothing described here is implemented yet; Agent 3 implements it.

## 1. Why a separate Python/FastAPI backend (not Next.js API routes)

Agent 1 documented Next.js route handlers as the backend, deferring
the decision to "whichever later agent implements the first real
endpoint." This phase makes that decision explicitly, in favor of a
**separate FastAPI service**, for concrete reasons:

- The domain has real invariants (project lifecycle state machine,
  payment verification, final-file authorization) that benefit from a
  typed, testable service layer with a mature async ORM (SQLAlchemy 2.x)
  and migration tool (Alembic) — the Node/Prisma equivalent works too,
  but FastAPI + SQLAlchemy is the stack this team is already strongest
  in, which matters more than either being objectively superior.
- Background work (email delivery, token cleanup, future malware
  scanning) is first-class in the Python ecosystem (Celery/RQ on Redis)
  without adding a second runtime just for jobs.
- Keeping the API as its own deployable unit means the frontend can be
  redeployed, scaled, or even replaced independently of the domain
  logic — relevant given the public site's heavy client-side (Three.js)
  surface area.

This is a one-way door for this project: Agent 3 must not re-litigate
Next.js-vs-FastAPI. It may add thin Next.js **Route Handlers** later
purely as a BFF (e.g. to attach an httpOnly cookie the browser sends
automatically), but those must remain thin proxies with zero business
logic — see §7.

## 2. Stack

- Python 3.12+
- FastAPI (ASGI, async route handlers)
- Pydantic v2 (request/response schemas + settings)
- SQLAlchemy 2.x, async engine (`asyncpg` driver)
- Alembic (migrations)
- PostgreSQL 16
- Redis 7 (cache, rate limiting, background job queue, refresh-token
  denylist — see `docs/SECURITY_ARCHITECTURE.md`)
- Background jobs: **RQ** (Redis Queue), not Celery — the job volume
  at launch (email delivery, token cleanup) doesn't justify Celery's
  operational complexity (broker + result backend + beat scheduler as
  separate concerns). Revisit if job variety grows substantially.
- pytest + pytest-asyncio + httpx.AsyncClient (API tests against the
  real ASGI app, no separate server process needed)

## 3. Layering (Clean/Hexagonal)

```
Presentation   FastAPI routers — parse request, call one use case,
               map result → response. No business rules here.
                    ↓
Application    Use cases — one class/function per user-facing
               operation ("RegisterUser", "SubmitProject",
               "VerifyPayment"). Orchestrates domain + repositories.
               This is where transaction boundaries live.
                    ↓
Domain         Entities, value objects, the state-machine rules
               (`ProjectStatus` transitions), pure Python — no
               SQLAlchemy, no FastAPI, no I/O. Fully unit-testable
               without a database.
                    ↓
Repository     Interfaces (ABCs/Protocols) defined IN the domain/
Interfaces     application layer, e.g. `ProjectRepository.get_by_id()`.
               Use cases depend on these, never on SQLAlchemy directly.
                    ↓
Infrastructure Concrete implementations: SQLAlchemy repositories,
               Redis rate limiter, SMTP email sender, StorageService
               adapters. This is the only layer allowed to import
               `sqlalchemy`, `redis`, `boto3`, an SMTP client, etc.
                    ↓
PostgreSQL / Redis / SMTP / File storage
```

The dependency rule: **inner layers never import outer layers.**
Domain imports nothing from this project. Application imports only
domain. Infrastructure implements application's interfaces.
Presentation depends on application (via dependency injection), never
directly on infrastructure.

This is what prevents the three failure modes named in the brief:
business logic trapped in route handlers, trapped in giant "service"
god-files, or duplicated because the frontend re-implements a rule.

## 4. Project structure

```
backend/
  app/
    main.py                 FastAPI app factory, router registration,
                             middleware, startup/shutdown (DB pool, Redis)
    core/
      config.py              Pydantic Settings — reads env vars once
      security.py             password hashing, JWT encode/decode helpers
      di.py                    FastAPI dependency-injection wiring
                                 (binds repository interfaces → SQLAlchemy impls)
      exceptions.py            domain/application exception types
    api/
      v1/
        router.py              aggregates all v1 routers
        auth.py                 /api/v1/auth/*
        projects.py             /api/v1/projects/*
        payments.py             /api/v1/payments/*
        files.py                /api/v1/files/*
        ...
        deps.py                 shared request-scoped deps (get_current_user, etc.)
        schemas/                Pydantic request/response models, per resource
    domain/
      entities.py               dataclasses mirroring src/types/domain.ts
      value_objects.py          e.g. Email, Money
      project_lifecycle.py      the state-machine transition rules
      exceptions.py             InvalidTransition, NotFound, Forbidden, etc.
    application/
      use_cases/
        auth/                   register_user.py, verify_email.py, login.py, ...
        projects/
        payments/
      ports/                    repository + service Protocols (interfaces)
    infrastructure/
      db/
        models.py                SQLAlchemy ORM models
        session.py                 async engine/session factory
        repositories/              concrete repo implementations
      cache/redis_client.py
      email/smtp_sender.py
      storage/local_adapter.py, s3_adapter.py
      security/token_repository.py   refresh-token persistence (Redis or Postgres)
    workers/
      jobs.py                    RQ job functions (send_email, cleanup_expired_tokens, ...)
      worker.py                  RQ worker entrypoint
  alembic/
    versions/
  tests/
    unit/            domain + application, no DB
    integration/      real Postgres (testcontainers or a test DB), real repos
    api/               httpx.AsyncClient against the FastAPI app
  pyproject.toml
  Dockerfile
```

Why this shape: `domain/` and `application/` contain everything Agent
3+ will spend most of their time reasoning about, and neither imports
a single third-party I/O library — they can be fully unit tested
without Postgres, Redis, or Docker running.

## 5. API conventions

- **Versioning:** every route under `/api/v1/...`. A breaking change
  ships as `/api/v2/...` alongside `v1` until clients migrate; it is
  never an in-place breaking edit to `v1`.
- **Response envelope:** success responses return the resource/collection
  directly (no wrapper object) with correct HTTP status codes
  (200/201/204). Collections use `{"items": [...], "total": N, "page": N}`
  for pagination — never an unbounded list.
- **Error convention** (applies to every error, including validation):
  ```json
  {
    "error": {
      "code": "PROJECT_NOT_FOUND",
      "message": "Human-readable, safe to show the user",
      "details": null
    },
    "request_id": "a1b2c3..."
  }
  ```
  `code` is a stable machine-readable string the frontend can switch
  on; `message` is never a raw exception string or stack trace.
  FastAPI's default validation error shape is wrapped into this
  envelope by a global exception handler, not left as-is.
- **Validation strategy:** Pydantic v2 schemas validate every request
  body/query/path param at the presentation boundary. Use cases
  receive already-validated, typed data — they never re-parse raw
  dicts. Domain invariants that aren't expressible in Pydantic (e.g.
  "deposit percentage must be valid for this project's current state")
  are checked in the domain/application layer and raise a domain
  exception, which a single exception handler maps to an HTTP error.
- **Transaction boundaries:** one use case = one transaction. The
  SQLAlchemy async session is opened per-request (FastAPI dependency),
  and the use case commits once at the end of a successful run or lets
  the exception propagate to trigger a rollback. Repositories never
  call `commit()` themselves — only the use case (or a thin
  Unit-of-Work wrapper around the session) does, so multi-repository
  operations (e.g. "verify payment" touching `Payment` and `Project`)
  stay atomic.
- **Repository / Unit of Work:** each aggregate (Project, Payment,
  User, ...) gets one repository interface with the operations its use
  cases actually need (`get_by_id`, `list_for_owner`, `add`, `update` —
  not a generic CRUD base class that invites misuse). A lightweight
  `UnitOfWork` context manager wraps the session for use cases that
  touch more than one repository.

## 6. Database migrations

Alembic, autogenerate-assisted but every migration is reviewed by hand
before merging (autogenerate misses type/constraint nuances). One
migration per meaningful schema change, never one giant migration per
agent phase. Migrations run as an explicit step in deploy (§ see
`docs/INFRASTRUCTURE.md`), never automatically on app boot in
production — auto-migrate-on-boot is acceptable in local dev only.

## 7. Frontend integration (Next.js ↔ FastAPI)

Next.js calls the FastAPI backend over HTTP using a small typed
client (`src/lib/api-client.ts`, created when Agent 3+ needs it — not
built in this phase). Two supported patterns, chosen per-case:

- **Server-side fetch from a Server Component / Route Handler** when
  the request needs the httpOnly refresh-token cookie forwarded, or
  needs to run before first paint.
- **Client-side fetch with the in-memory access token** for
  interactive, authenticated actions (see `docs/AUTHENTICATION_FLOW.md`).

If a Next.js Route Handler is used as a thin proxy (e.g. to set the
refresh-token cookie with `Domain`/`SameSite` attributes the FastAPI
service's own domain couldn't set for the frontend's origin), it must:
contain no branching business logic, forward the request/response
largely as-is, and exist only where the browser's cookie/CORS model
requires a same-origin hop. `docs/ARCHITECTURE.md` §1–2 is updated to
reflect this split — Next.js API routes are not a general-purpose
backend in this project.

## 8. What Agent 3 must NOT redesign

- The layering in §3 and the project structure in §4.
- FastAPI + SQLAlchemy async + PostgreSQL + Redis + RQ as the stack.
- The API versioning and error envelope in §5.
- The Next.js-is-not-the-backend decision in §1/§7.

Agent 3 may adjust module boundaries *within* a layer (e.g. how use
cases are grouped into files) but not the layer boundaries themselves.
