# Security Architecture

Status: established by Agent 2. Concrete, implementation-ready
mitigations — not general advice. Read alongside
`docs/AUTHENTICATION_FLOW.md` for the auth-specific flows this
references.

## 1. Password storage

Argon2id via `argon2-cffi`, parameters: memory=19 MiB, iterations=2,
parallelism=1 (OWASP's current minimum baseline for Argon2id;
Agent 3 should re-check OWASP's cheat sheet at implementation time and
tune upward if the deploy target's CPU/memory budget allows). Never
bcrypt/scrypt as the primary scheme, never a reversible cipher, never
plaintext. Re-hash-on-login if stored parameters are weaker than
current config (migration path for future parameter increases).

## 2. Authorization: RBAC + object-level

Two checks, always both, never just the first:

1. **Role check** (`CUSTOMER` / `DEVELOPER` / `ADMIN`) — a FastAPI
   dependency (`require_role(...)`) on the route.
2. **Object-level check** — the use case loads the resource and
   explicitly verifies the actor is entitled to it (`project.owner_id
   == current_user.id` for a customer, or an assigned-developer check
   for `DEVELOPER`). This lives in the use case, not the route, so it
   can't be skipped by a route that forgets to call it — the
   repository method used by the use case (e.g.
   `get_project_for_owner(project_id, owner_id)`) should make the
   unauthorized path structurally return "not found" rather than
   requiring every caller to remember a separate check.

This directly prevents IDOR: an authenticated `CUSTOMER` requesting
`/api/v1/projects/{other_customers_project_id}` gets 404 (not 403 —
403 confirms the resource exists, leaking information), because the
repository query itself is scoped to the caller.

## 3. Input handling / injection

- **SQL injection:** SQLAlchemy's query builder / ORM with bound
  parameters exclusively — no raw string-interpolated SQL anywhere.
  If a raw query is ever unavoidable, it must use `text()` with bound
  params, never an f-string.
- **XSS:** React escapes by default; the rule is simply **never use
  `dangerouslySetInnerHTML`** on any string that isn't sanitized
  through an allow-list HTML sanitizer (e.g. for rendering a rich-text
  proposal/message body, if that's ever added). API responses set
  `Content-Type: application/json` strictly, so a browser never
  sniffs/executes JSON as HTML.
- **Mass assignment:** Pydantic request schemas are explicit allow-lists
  per endpoint (e.g. `ProjectCreateRequest` has exactly the fields a
  customer may set) — never `**request_body` merged into an ORM model.
  Server-controlled fields (`status`, `id`, `owner_id`, `verified_at`,
  any `Payment` field) never appear in a request schema a client can
  populate.
- **Path traversal:** file storage keys are server-generated opaque
  identifiers (UUID-based), never derived from the client-supplied
  filename. The original filename is stored as metadata only, never
  used to build a filesystem path.

## 4. Security headers & CORS

- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (prod only)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or `frame-ancestors 'none'` via CSP)
- `Content-Security-Policy`: default-src 'self'; scripts restricted to
  the app's own origin plus any explicitly needed CDN — no `unsafe-inline`
  for scripts (Next.js supports nonce-based CSP for its own inline
  bootstrap script)
- `Referrer-Policy: strict-origin-when-cross-origin`
- **CORS:** explicit allow-list of exactly the frontend origin(s)
  (e.g. `https://anteiku.example.com`, plus the local dev origin in
  non-prod config). `Access-Control-Allow-Credentials: true` (required
  for the refresh cookie) paired with an explicit origin — **never**
  `Access-Control-Allow-Origin: *` once credentials are allowed
  (browsers reject that combination anyway, but the config must be
  explicit, not accidentally permissive across environments).

## 5. CSRF

Because the refresh token cookie is `SameSite=Strict` (not just `Lax`)
and scoped to the single `/api/v1/auth/refresh` path, the browser will
not attach it to a cross-site request in the first place — this is the
primary CSRF defense for the auth flow. As defense in depth (and
because `SameSite=Strict` has known edge cases with top-level
navigation from external links), the refresh endpoint additionally
requires a custom header (e.g. `X-Requested-With: fetch`) that a
cross-site `<form>` submission cannot set — a same-site-only,
non-form-submittable request shape. All other authenticated endpoints
use the JWT access token in an `Authorization: Bearer` header, which a
cross-site form/img/script tag cannot forge (no ambient credential is
attached to those), so they need no separate CSRF token.

## 6. Rate limiting & brute force

Redis-backed sliding-window counters, enforced as a FastAPI dependency
before the route body runs:

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5 / 15 min per IP, AND 5 / 15 min per email (whichever is hit first blocks; prevents both a distributed attack on one account and one IP spraying many accounts) |
| `POST /auth/register` | 3 / hour per IP |
| `POST /auth/forgot-password` | 3 / hour per IP AND per email |
| `POST /auth/verify-email` (resend) | 3 / hour per email |
| `POST /auth/refresh` | 20 / 15 min per refresh-token family (a legitimate client rotates far less often than this) |
| File upload endpoints | 20 / hour per user |
| Project submission | 10 / day per user |

Exceeding a limit returns `429` with a generic message and a
`Retry-After` header — never reveals which specific check (IP vs
email) triggered it. Sustained brute force against a single account
(limit hit repeatedly across many IPs) additionally triggers a
temporary account-level lockout notification email to the account
owner (informational, not a silent block bypass).

## 7. Enumeration resistance

Every account-existence-revealing surface returns identical responses
regardless of whether the account exists: registration ("check your
email" whether or not that email is already registered — a duplicate
registration attempt emails the existing owner a "someone tried to
register with your email" notice instead of erroring visibly), login
(§ `AUTHENTICATION_FLOW.md` §5), and forgot-password (§ same doc §7).
Response **timing** is also considered: login runs a dummy password
hash on a not-found user so response latency doesn't itself leak
existence.

## 8. File upload security

- **Size limits** enforced at two layers: Nginx `client_max_body_size`
  (hard ceiling, rejects oversized requests before they reach FastAPI)
  and a per-category application limit (e.g. 10 MB for a payment
  receipt image, 200 MB for a milestone/final-source archive).
- **MIME validation:** never trust the client-supplied `Content-Type`
  header or file extension. Validate by inspecting file signature
  bytes (magic numbers) server-side against an allow-list per category
  (receipts: image/pdf only; final source: archive formats only — no
  executables, no scripts).
- **Extension validation:** the allow-list above is enforced on the
  sniffed type, and the stored filename is server-generated (§3) —
  the original extension is never used to decide how the file is later
  served (prevents an uploaded `.html`/`.svg` from being served in a
  way a browser would execute it).
- **Storage:** private by default (`docs/PROJECT_SPEC.md` §8) — files
  are served only via a short-lived signed URL or an authenticated
  streaming endpoint, never a public static path.
- **Authorization before download:** every download request re-checks
  object-level authorization at request time (not just at upload time)
  — critically, `FINAL_SOURCE` re-checks `Payment.status == VERIFIED`
  on every single download, not once at unlock time, so a later
  refund/chargeback can immediately cut off access.
- **Malware-scanning readiness:** the `StorageService.put()` interface
  (`docs/ARCHITECTURE.md` §3) reserves a hook to run an uploaded file
  through a scanner (e.g. ClamAV) before it's marked available; not
  implemented at launch, but the interface doesn't need to change when
  it is added — see `docs/BACKEND_ARCHITECTURE.md` §3/§4 infrastructure
  layer.

## 9. Payment & status trust boundary

Restated because it's the highest-value target on this platform: the
frontend can only ever *request* a state change ("I uploaded a
receipt", "I approved this proposal") — it never sends `amount`,
`status`, `verified`, or any project-status field as data the server
accepts at face value. Every one of these is computed, validated, or
explicitly set by an authorized actor (developer/admin) server-side.
Pydantic request schemas for these endpoints structurally omit these
fields — the vulnerability class (mass assignment onto a trusted field)
is prevented by the schema shape itself, not by a runtime check that
could be forgotten. A race condition specifically to guard: two
concurrent "verify payment" calls on the same `Payment` row — the
use case's transaction should use a row-level lock (`SELECT ... FOR
UPDATE`) or an optimistic version check so a payment can't be
double-verified or double-counted toward project state.

## 10. Secrets & environment variables

- Every secret (DB URL, Redis URL, JWT signing keypair, SMTP
  credentials) is read from environment variables via a single
  Pydantic `Settings` class (`app/core/config.py`) — never hardcoded,
  never read ad hoc via `os.environ` scattered across files.
- Local dev: `.env` (git-ignored — already covered by the existing
  `.gitignore`). Production: injected by the deploy environment
  (Docker secrets / platform env config), never baked into an image.
- JWT signing uses an RS256 keypair; the private key exists only in
  the backend's environment, never in the frontend or in Git. If the
  key is ever compromised, rotating it invalidates every outstanding
  access token immediately (acceptable — they're ≤15 min lived) without
  needing to touch the refresh-token store.
- `.env.example` (committed) documents every required variable name
  with a placeholder value, never a real one.

## 11. Audit logging

Every entry uses the existing `AuditLog` entity
(`src/types/domain.ts`). Minimum events logged, each with `actorId`
(null for system-initiated), `action`, `entityType`, `entityId`,
`metadata`:

- `auth.registered`, `auth.email_verified`, `auth.login_succeeded`,
  `auth.login_failed`, `auth.refresh_reuse_detected`,
  `auth.password_reset`, `auth.logout`
- `project.status_changed` (from → to), `payment.submitted`,
  `payment.verified`, `payment.rejected`
- `file.final_source_downloaded` (who, when — this is the single most
  sensitive download event on the platform)

`metadata` never contains a password, a raw token, or a full refresh
token — only non-sensitive context (IP, user agent, previous/new
status). Structured JSON logs (§ `docs/INFRASTRUCTURE.md` §7)
similarly never emit secrets or tokens, only their `jti`/id where a
token needs to be referenced for debugging.

## 12. What Agent 3 must implement, exactly as specified

Argon2id parameters (§1), the RBAC + object-level pattern (§2), the
security headers and CORS policy (§4), the CSRF approach (§5), the
rate-limit table (§6), the enumeration-resistant response shapes (§7),
file upload validation (§8), and the payment/status trust boundary
(§9) including the row-lock/optimistic-check requirement.
