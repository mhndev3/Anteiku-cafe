# Authentication Flow

Status: established by Agent 2. Implementation-ready for Agent 3.
Read alongside `docs/SECURITY_ARCHITECTURE.md` for the attack-specific
mitigations referenced below.

## 1. Chosen architecture: JWT access token + rotating opaque refresh token

**Decision:** short-lived JWT access tokens, returned in the response
body and held only in frontend memory (never `localStorage`), plus a
long-lived, rotating, opaque refresh token stored server-side and sent
to the client only as an `httpOnly`, `Secure`, `SameSite=Strict` cookie
scoped to `/api/v1/auth/refresh`.

**Why not plain server-side sessions:** would work, but the FastAPI
backend is a separate origin/service from Next.js — a JWT access token
lets the frontend (client or server component) authenticate a request
without a network round-trip to validate a session on every call. It
also fits a future scenario (mobile app, or splitting services)
without redesigning auth.

**Why not JWT-only (no refresh table):** a pure-JWT approach has no
server-side revocation — a stolen or leaked JWT stays valid until
expiry no matter what. Pairing a short-lived JWT with a server-tracked
refresh token gives revocation (logout, password change, reuse
detection) real teeth while keeping access-token checks stateless.

**Why the refresh token is a cookie, not returned to JS:** the refresh
token is the long-lived, high-value credential. Keeping it out of JS
reach removes it as an XSS exfiltration target (§ see
`docs/SECURITY_ARCHITECTURE.md` §3). The access token is short-lived
enough that its exposure to JS (unavoidable if the frontend is going to
attach it to API calls) is an acceptable, bounded risk.

This is final for this project. Agent 3 implements it as specified,
not as an area for redesign.

## 2. Token properties

| Token | Lifetime | Storage | Format |
|---|---|---|---|
| Access token | 15 minutes | Frontend memory only | JWT (RS256), claims: `sub`, `role`, `iat`, `exp`, `jti` |
| Refresh token | 30 days, sliding (§4 rotation resets it) | `httpOnly` `Secure` `SameSite=Strict` cookie, path-scoped to `/api/v1/auth/refresh` | Opaque random 256-bit token; server stores only its SHA-256 hash |
| Email verification token | 24 hours, single-use | Emailed link only | Opaque random 256-bit token; server stores only its hash |
| Password reset token | 30 minutes, single-use | Emailed link only | Opaque random 256-bit token; server stores only its hash |

RS256 (asymmetric) over HS256: any future service that only needs to
*verify* tokens (not issue them) can hold the public key only — no
shared signing secret to distribute or rotate across services.

Refresh, verification and reset tokens are never stored in plaintext
in the database — only their hash, so a database read (backup leak,
insider access) does not itself expose usable tokens.

## 3. Entities

New entities, backend-internal (not added to `src/types/domain.ts` —
that file is the frontend-facing API contract; these never reach the
client as data):

```python
User (extends the existing conceptual User in domain.ts)
  password_hash: str            # Argon2id, see SECURITY_ARCHITECTURE §1
  email_verified_at: datetime | None

RefreshToken
  id, user_id, token_hash, family_id
  issued_at, expires_at, used_at, revoked_at
  replaced_by_id            # set when rotated, enables reuse detection
  user_agent, ip_address    # for the user's "active sessions" view

EmailVerificationToken
  id, user_id, token_hash, expires_at, used_at, created_at

PasswordResetToken
  id, user_id, token_hash, expires_at, used_at, created_at, requested_ip
```

No separate `Session` table: a `family_id` shared across a refresh
token's full rotation chain *is* the session — "log out this device"
revokes every `RefreshToken` row sharing that `family_id`. This avoids
two tables (`Session` + `RefreshToken`) tracking overlapping state.

Auth security events (`login_failed`, `token_reuse_detected`, etc.)
reuse the existing `AuditLog` entity from `src/types/domain.ts`
(`action`, `entityType: "auth"`, `metadata`) — a dedicated
`SecurityEvent` table would duplicate it.

`email_verified_at` is added to the frontend-facing `User` type in
`src/types/domain.ts` (done this phase, §7) since the frontend needs
to know verification status; `password_hash` never is.

## 4. Flow: registration → verified account

```
POST /api/v1/auth/register {email, password, full_name}
  → validate password strength (min 12 chars; reject top-10k breached
    list via a local k-anonymity check — never call a third-party API
    with the raw password)
  → hash password (Argon2id)
  → create User (email_verified_at = null), Profile
  → create EmailVerificationToken, enqueue send-verification-email job
  → respond 201 with a GENERIC message ("check your email to verify"),
    regardless of whether the email was already registered
    (anti-enumeration, see SECURITY_ARCHITECTURE §7)

User clicks emailed link → GET /api/v1/auth/verify-email?token=...
  → hash incoming token, look up EmailVerificationToken by hash
  → reject if not found, expired, or already used → generic error,
    same message whether token is invalid or expired (don't leak which)
  → mark token used_at, set User.email_verified_at = now()
  → audit log "auth.email_verified"
```

Login is allowed before verification (so the user isn't fully locked
out if the email never arrives), but unverified accounts are
restricted from creating/submitting a project (enforced server-side in
the project use cases, not just hidden in the UI) until verified.

## 5. Flow: login

```
POST /api/v1/auth/login {email, password}
  → rate limit by IP AND by email (both — see SECURITY_ARCHITECTURE §6)
  → look up user by email; if not found, still run a dummy Argon2id
    hash to keep response timing similar (mitigates timing-based
    enumeration), then return the SAME generic "invalid credentials"
    error as a wrong password would
  → verify password
  → on failure: increment failed-attempt counter (Redis, keyed by
    email+IP), audit log "auth.login_failed", return generic error
  → on success: reset failed-attempt counter
  → issue new RefreshToken (new family_id), issue access token (JWT)
  → set refresh token as httpOnly cookie; return access token +
    user profile in the response body
  → audit log "auth.login_succeeded" (user_id, ip, user_agent)
```

Generic error message for both "no such user" and "wrong password":
`"Invalid email or password."` — never "no account with that email"
(§ enumeration, SECURITY_ARCHITECTURE §7).

## 6. Flow: refresh (rotation + reuse detection)

```
POST /api/v1/auth/refresh   (refresh cookie sent automatically)
  → hash the incoming token, look up RefreshToken by hash
  → NOT FOUND → reject (401), no further action possible (token is
    unrecognized — could be forged/garbage, not necessarily reuse)
  → FOUND but revoked_at is set → this exact token was already
    rotated-away-from-and-reused, OR was explicitly revoked. If
    `revoked_at` was set BY A ROTATION (not an explicit logout):
      → REUSE DETECTED. Revoke the entire token family (every
        RefreshToken with this family_id). Audit log
        "auth.refresh_reuse_detected" with user_id + family_id.
        Force full re-login. This is the signal that a refresh token
        was stolen and the legitimate rotation already moved past it.
  → FOUND, not revoked, not expired → this is the valid, current token:
      → mark it used_at + revoked_at = now(), replaced_by_id = <new id>
      → issue a NEW RefreshToken in the SAME family_id
      → issue a new access token (JWT)
      → set the new refresh token as the httpOnly cookie
  → FOUND but expired → reject (401), require full login
```

Reuse detection is the core defense here: rotation means a refresh
token is single-use. If an attacker steals a refresh token and uses it
after the legitimate client already rotated past it (or vice versa),
the second use of an already-rotated token is unambiguous evidence of
compromise, so the whole family is killed rather than just that token.

## 7. Flow: logout / password-change / reset invalidation

- **Logout:** revoke the current token's entire `family_id`; clear the
  refresh cookie (`Set-Cookie` with `Max-Age=0`). Access token is
  short-lived enough that it's left to expire naturally — see §8 for
  the denylist fallback for the rare case immediate revocation matters.
- **Password change (while logged in) or reset (via email):** hash the
  new password, then revoke **every** `RefreshToken` for that user
  across **all** families — every other device is logged out. This is
  intentional: a password change is exactly the moment to assume prior
  sessions may be compromised.
- **Forgot password:**
  ```
  POST /api/v1/auth/forgot-password {email}
    → ALWAYS respond 202 with the same generic message, whether or
      not the email exists (anti-enumeration)
    → if the user exists: create PasswordResetToken, enqueue email job
  POST /api/v1/auth/reset-password {token, new_password}
    → hash incoming token, look up by hash; reject (generic error) if
      not found / expired / used
    → validate new password strength
    → update password_hash, mark token used_at
    → revoke all RefreshTokens for the user (all families)
    → audit log "auth.password_reset"
  ```

## 8. Access-token revocation fallback (denylist)

Pure JWT access tokens can't be revoked before `exp`. For the narrow
cases where that matters (admin force-logout, detected compromise), a
Redis denylist keyed by the token's `jti` claim, TTL'd to the token's
remaining lifetime (≤15 min, so the denylist never grows unbounded).
`get_current_user` checks the denylist on every request — this is a
single Redis `EXISTS` call, cheap enough to be unconditional.

## 9. Session fixation

Login always issues a **brand-new** `family_id` and refresh token —
never reuses or "upgrades" a pre-existing (e.g. anonymous/guest)
token. There is no server-side session identifier set before
authentication that could be fixated. The JWT's `jti` is generated
fresh per issuance, never client-suppliable.

## 10. What Agent 3 must implement, exactly as specified

- The token shapes, lifetimes and storage in §1–2.
- The `RefreshToken`/`EmailVerificationToken`/`PasswordResetToken`
  entities in §3 (backend-only; only `email_verified_at` touches
  `src/types/domain.ts`).
- All five flows in §4–7, including the exact reuse-detection behavior
  in §6 and the "revoke all sessions on password change" rule in §7.
- The denylist fallback in §8.

## 11. What Agent 3 must NOT redesign

- JWT + rotating refresh token vs. server-side sessions (§1) — decided.
- Where the refresh token lives (httpOnly cookie, not returned to JS).
- The generic-error-on-both-failure-modes rule for login and
  forgot-password (anti-enumeration is a product-level guarantee, not
  a suggestion).
