# Agent Handoff

## Current Agent
Agent 2 (production architecture phase — this session)

## Current Phase
Backend/security/infrastructure architecture complete → handoff to Agent 3 (backend implementation)

## Repository State
- Branch `main`, no commits yet as of this handoff (first commit is
  made at the end of this Agent 2 phase — see "Git" below).
- Remote: `origin` → `https://github.com/mhndev3/Anteiku-cafe.git`
- No `.env` files, no `prisma/` directory, no secrets found in the tree.

## Completed by Agent 1
- `docs/PROJECT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`,
  `docs/DEVELOPMENT_WORKFLOW.md`
- `src/app/{layout,page,globals.css}`, `src/styles/tokens.css`
- `src/components/ui/{Button,Card,Badge}.tsx`, `src/lib/cn.ts`
- `src/types/domain.ts` (conceptual domain contract)
- Left `package.json` with 8 unrelated/unused dependencies it did not
  intentionally add (see "Dependency anomaly" below) — Agent 1's own
  report flagged this without resolving it.

## Completed by Agent 2 (this session, across two passes)

**Pass 1 (frontend foundation cleanup):**
- Fixed ambiguous `text-[var(--token)]` / `shadow-[var(--token)]`
  Tailwind arbitrary-value syntax in `Button.tsx`, `Badge.tsx`,
  `Card.tsx` (now `text-[length:...]` / `shadow-[shadow:...]`).
- Fixed a stale cross-reference in `src/types/domain.ts` (pointed at a
  spec section that doesn't exist).
- Replaced the `create-next-app` boilerplate `README.md` with a
  project-specific one.
- Investigated the dependency anomaly (below) — did not yet remove the
  packages (needs `npm uninstall`, not done — no shell was available
  in that pass).

**Pass 2 (production backend/security/infrastructure architecture):**
- Made the explicit decision: backend is a **separate FastAPI service**
  (Python 3.12+, SQLAlchemy 2.x async, PostgreSQL, Redis, RQ), not
  Next.js API routes as Agent 1 had left open. Documented in
  `docs/BACKEND_ARCHITECTURE.md` §1, and reconciled into
  `docs/ARCHITECTURE.md` §1/§2/§6 (edited in place, not left
  contradictory) and `docs/PROJECT_SPEC.md` §6/§10.
- Created `docs/BACKEND_ARCHITECTURE.md`: Clean/Hexagonal layering,
  full `backend/` project structure, API versioning/error-envelope/
  validation/transaction conventions, repository/unit-of-work pattern.
- Created `docs/AUTHENTICATION_FLOW.md`: chosen architecture is **JWT
  access token (15 min, memory-only) + rotating opaque refresh token
  (30 days, httpOnly/Secure/SameSite=Strict cookie) with reuse
  detection that revokes the whole token family**. All required flows
  specified end-to-end (register → verify → login → refresh → logout,
  forgot/reset password, password-change session invalidation).
  Entities: `RefreshToken` (with `family_id`, doubling as session
  tracking — no separate `Session` table), `EmailVerificationToken`,
  `PasswordResetToken`, all backend-only; auth events reuse the
  existing `AuditLog` entity rather than a new `SecurityEvent` table.
- Created `docs/SECURITY_ARCHITECTURE.md`: Argon2id parameters, RBAC +
  object-level authorization pattern (404-not-403 for IDOR), concrete
  injection/XSS/mass-assignment/path-traversal mitigations, security
  headers + CORS policy, `SameSite=Strict`-cookie-based CSRF defense
  plus a custom-header belt-and-suspenders check, a full rate-limit
  table, enumeration-resistant response shapes (including timing),
  file-upload validation (size/MIME/extension/storage/malware-scan
  readiness), the payment/status trust-boundary restatement with a
  row-lock requirement for concurrent payment verification, secrets/
  env-var strategy, and the audit-logging event list.
- Created `docs/INFRASTRUCTURE.md`: Nginx → {Next.js, FastAPI} →
  {Postgres, Redis, SMTP, storage} topology; dev vs. prod environments;
  planned Docker services (not created — see "Known limitations");
  Nginx config shape; env var names by service; internal-only
  networking for Postgres/Redis; structured logging + health checks +
  error-tracking readiness; backup strategy; SMTP delivery design
  (async via RQ, retry/dead-letter, Jinja2 templates, no token
  leakage in logs); backend testing strategy including the specific
  security test cases Agent 3 must cover.
- Added `emailVerifiedAt?: string` to `User` in `src/types/domain.ts`
  (the one auth-related field the frontend actually needs to see);
  `password_hash` deliberately stays backend-only, documented as such.
- Updated `README.md`'s documentation table to list the four new docs.

## Dependency anomaly (package.json) — RESOLVED this phase

`package.json`/`package-lock.json` agreed with each other and all 8
packages were installed in `node_modules`, but **none were imported
anywhere in `src/`** (verified via `Select-String -Pattern '^import'`
across every `.ts`/`.tsx` file): `@auth/prisma-adapter`,
`@prisma/client`, `bcryptjs`, `clsx`, `next-auth`, `prisma`,
`tailwind-merge`, `zod`. `cn.ts` mentioned `clsx`/`tailwind-merge` only
in a comment about future use; it never imported them.

**Resolved:** ran `npm uninstall @auth/prisma-adapter @prisma/client
bcryptjs clsx next-auth prisma tailwind-merge zod`. Result: **394
packages removed**, and `npm audit` went from **13 vulnerabilities (5
moderate, 8 high)** — almost entirely pulled in transitively by
`prisma@8.0.0-rc.17`'s `@prisma/composer`/`alchemy`/`@effect/*` tree —
to **0 vulnerabilities**. `package.json` now declares only
`next`/`react`/`react-dom` plus the actually-used dev tooling. This
confirms the removal decision was correct, not just architecturally
consistent but a real supply-chain risk reduction.

**Separately discovered and fixed:** `node_modules` was missing
`eslint` entirely (`npm run lint` failed with "'eslint' is not
recognized") even though it's declared in `devDependencies`. Root
cause: the shell's `NODE_ENV` environment variable is set to
`production` system-wide, which makes npm's `omit` config resolve to
`dev` — every prior `npm install` in this environment silently skipped
all `devDependencies`. Fixed with `npm install --include=dev`
(337 packages added, 0 vulnerabilities), which overrides that omission
without touching `NODE_ENV` itself or the project's `package.json`.
**Agent 3: `npm install` alone will keep omitting dev deps in this
shell — always use `npm install --include=dev`, or fix the `NODE_ENV`
env var at the OS/terminal level, until that's addressed.**

## Architecture decisions (this phase)

1. FastAPI (Python) backend, separate service — not Next.js API routes.
2. JWT access token + rotating refresh token — not server-side sessions.
3. Refresh token in an httpOnly cookie; access token in frontend memory
   only (never `localStorage`).
4. Argon2id for password hashing.
5. `RefreshToken.family_id` doubles as session identity — no separate
   `Session` table. Auth security events reuse `AuditLog` — no
   separate `SecurityEvent` table.
6. RQ (not Celery) for background jobs at this scale.
7. SQLAlchemy 2.x async + Alembic — not Prisma.
8. Nginx does path-based routing (`/api/*` → FastAPI, else → Next.js)
   as the single public entry point in production.

## Files created
- `docs/BACKEND_ARCHITECTURE.md`
- `docs/SECURITY_ARCHITECTURE.md`
- `docs/AUTHENTICATION_FLOW.md`
- `docs/INFRASTRUCTURE.md`
- `agent.md` (this file)

## Files modified
- `docs/ARCHITECTURE.md` (§1, §2, §4, §6 reconciled with the FastAPI decision)
- `docs/PROJECT_SPEC.md` (§6, §10 updated to point at the new docs and the FastAPI/Argon2id/JWT decisions)
- `src/types/domain.ts` (`User.emailVerifiedAt` added; earlier pass also fixed a stale doc reference)
- `src/components/ui/Button.tsx`, `Badge.tsx`, `Card.tsx` (Tailwind arbitrary-value syntax fix, earlier pass)
- `README.md` (project-specific content + doc table, both passes)

## Dependencies
`next`, `react`, `react-dom` (dependencies); `@tailwindcss/postcss`,
`@types/node`, `@types/react`, `@types/react-dom`, `eslint`,
`eslint-config-next`, `tailwindcss`, `typescript` (devDependencies).
Nothing else — the 8 anomalous packages are fully removed (see above).

## Validation actually performed
- `git status`, `git branch --show-current`, `git remote -v`, `git log`
  — confirmed via an actual shell (PowerShell) run against the repo.
- Directory listings of `src/`, `docs/` — confirmed via actual
  filesystem reads, not assumed.
- Searched `src/**/*.ts(x)` for `^import` lines — confirmed zero
  matches for any of the 8 anomalous packages.
- Checked for `.env*` files and a `prisma/` directory — none found.
- Read every doc and source file modified above, in full, before editing.
- `npm uninstall <8 packages>` — 394 packages removed, 0 vulnerabilities
  (down from 13: 5 moderate, 8 high).
- `npm install --include=dev` — 337 packages added (fixes the
  `NODE_ENV=production`-causes-devDeps-to-be-omitted issue above), 0
  vulnerabilities.
- **`npm run lint`** — exit code 0, no warnings or errors.
- **`npm run build`** — exit code 0. `next build` (Turbopack) compiled
  successfully, TypeScript check passed, both routes (`/`,
  `/_not-found`) prerendered as static content.
- `git diff --cached --check` — clean, no trailing-whitespace/conflict-
  marker errors (only routine LF→CRLF line-ending notices on Windows).
- `git grep -nE 'PRIVATE KEY|AKIA[0-9A-Z]{16}|sk_live_'` across every
  staged file except `package-lock.json` — zero matches.
- Checked staged filenames for `.env*`/`.pem`/`.key`/credential/secret
  patterns — none present.
- Noticed and removed a stray, untracked `report.md` (~2050 lines) that
  appeared in the repo root mid-session — it was a raw dump of this
  agent session's own tool-call transcript, not project content. It
  was unstaged via `git rm --cached` and the file no longer exists on
  disk (confirmed via `Test-Path` → `False`) — nothing to add to
  `.gitignore`, but if it recurs in a future session, exclude it the
  same way before committing.

## Known limitations / risks
- No Docker/Nginx config files exist yet — `docs/INFRASTRUCTURE.md` §9
  explains this is deliberate (written alongside real backend code,
  not speculatively ahead of it), but it means Agent 3 cannot `docker
  compose up` on day one; the backend needs its own Dockerfile first.
- `NODE_ENV=production` is set system-wide in this dev environment,
  which makes plain `npm install` silently omit `devDependencies`.
  Always use `npm install --include=dev` here until that's fixed at
  the OS/terminal level (not a project-file fix).
- `docs/DESIGN_SYSTEM.md` was read but not modified this phase — not
  re-verified against the architecture changes, though nothing in it
  should conflict (it's presentation-only).

## Do Not Change (carried forward + added this phase)
- The three-role model (`CUSTOMER`/`DEVELOPER`/`ADMIN`) — Agent 1.
- The project lifecycle state machine in `docs/PROJECT_SPEC.md` §4 — Agent 1.
- FastAPI as the backend, separate from Next.js — Agent 2, §1 above.
- JWT + rotating refresh token (not server-side sessions) — Agent 2.
- Argon2id for password hashing — Agent 2.
- The `RefreshToken.family_id`-as-session / `AuditLog`-as-security-event
  decisions (no new `Session`/`SecurityEvent` tables) — Agent 2.

## Next Agent Instructions (Agent 3)

1. The dependency anomaly is already resolved (see above) — do not
   re-add `prisma`/`next-auth`/`bcryptjs`/`zod`/etc. Remember that
   `npm install` needs `--include=dev` in this environment (see
   "Known limitations").
2. **Implement the backend** exactly per `docs/BACKEND_ARCHITECTURE.md`
   (project structure, layering, API conventions) — do not
   re-architect it.
3. **Implement authentication** exactly per
   `docs/AUTHENTICATION_FLOW.md` (all 11 sections) and
   `docs/SECURITY_ARCHITECTURE.md` (Argon2id params, rate limits,
   CSRF/CORS, enumeration resistance) — these are implementation-ready
   specs, not options to choose between.
4. Add `argon2-cffi`, `pyjwt` (or `python-jose`), `fastapi`,
   `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `redis`, `rq`,
   `pydantic-settings`, `pytest`, `pytest-asyncio`, `httpx` to a new
   `backend/pyproject.toml` — do not add any Node-side auth/ORM
   packages (that's the anomaly being cleaned up in step 1).
5. Write the security test cases listed in
   `docs/INFRASTRUCTURE.md` §11 as part of this phase, not deferred.
6. Only then create `backend/Dockerfile`,
   root `docker-compose.yml`/`docker-compose.prod.yml`, and
   `nginx/nginx.conf`, following `docs/INFRASTRUCTURE.md` §1–6 exactly.
7. Do not implement the full project-lifecycle use cases, payment
   gateway, or admin/customer dashboards in this phase — auth and
   its supporting infrastructure is the scope, per the brief that
   started this phase.
8. Update `agent.md` again at the end of your phase with real
   validation results (lint/build/test), following the format above.
