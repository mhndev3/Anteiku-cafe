# Architecture

Status: living document, established by Agent 1, **revised by Agent 2**.
Describes the intended structure — most of it is not implemented yet
(see `agent.md` for exactly what exists today).

> **Agent 2 supersedes §1, §2 and §6 below.** Agent 1 left the backend
> choice open ("whichever later agent implements the first real
> endpoint"). That decision is now made: business logic lives in a
> **separate FastAPI service**, not in Next.js API routes. See
> `docs/BACKEND_ARCHITECTURE.md` for the full reasoning and shape. The
> sections below are kept for the parts still accurate (route groups,
> storage/notification abstractions, component architecture) with the
> backend-location assumption corrected in place.

## 1. Layering

```
Frontend (React / App Router pages)
        ↓  HTTP (fetch, typed client — see docs/BACKEND_ARCHITECTURE.md §7)
FastAPI backend (separate service — full layering in docs/BACKEND_ARCHITECTURE.md §3)
  API/Presentation → Application/Use Cases → Domain → Repository Interfaces
        ↓
Infrastructure (SQLAlchemy repositories, Redis, SMTP, StorageService adapters)
        ↓
PostgreSQL / Redis
```

Rules:

- **UI components never contain business logic.** A component calls a
  typed client function that hits the FastAPI backend; it never
  computes price, permissions, or project status transitions itself.
- **Next.js API routes, if any exist, stay thin proxies only.** Business
  logic never lives in `src/app/api/**` — that layer no longer exists
  as a backend at all. A Next.js Route Handler is only ever a
  same-origin cookie/CORS shim in front of the FastAPI service (see
  `docs/BACKEND_ARCHITECTURE.md` §7); if a route file is doing
  branching business logic, that logic is in the wrong codebase.
- **The FastAPI application/use-case layer owns business rules**,
  including the state-machine transitions in `docs/PROJECT_SPEC.md` §4,
  pricing rules, and payment/file authorization checks. Full detail in
  `docs/BACKEND_ARCHITECTURE.md`.
- **Repositories own persistence.** Use cases never write raw queries
  inline; they call a repository method. This is what keeps a future
  ORM/database swap from touching business logic.

None of `backend/app/**` exists yet — it is created by whichever later
agent implements the first real endpoint (likely auth or project
creation), following `docs/BACKEND_ARCHITECTURE.md` exactly. This
document's earlier `src/server/**` shape is retired; do not create it.

## 2. Route Architecture (Next.js App Router)

Proposed structure — **not yet created**, documented so route groups
stay consistent as agents add them:

```
src/app/
  (public)/                  route group, unauthenticated
    page.tsx                 landing/hero
    services/
    portfolio/
    about/
    faq/
  (auth)/
    login/
    register/
  (customer)/                 route group, requires CUSTOMER
    dashboard/
    projects/
      new/                    request wizard
      [projectId]/
        page.tsx              overview
        timeline/
        requirements/
        milestones/
        files/
        payments/
        messages/
    account/
  (admin)/                    route group, requires DEVELOPER | ADMIN
    requests/                 incoming queue
    projects/
      [projectId]/            same tab structure, admin-facing data + internal notes
    customers/
  api/
    (thin BFF proxies only, if/when actually needed — see §1;
     the real API surface is the FastAPI service's /api/v1/**,
     documented in docs/BACKEND_ARCHITECTURE.md, not here)
```

Route groups (`(public)`, `(auth)`, `(customer)`, `(admin)`) let
layout/middleware auth checks apply per-area without polluting URLs.
Do not implement every route now — add them as each agent's scope
requires, following this shape rather than an ad hoc one.

## 3. Storage Abstraction

```
Business logic → StorageService (interface) → LocalStorageAdapter | S3Adapter | R2Adapter
```

`StorageService` should expose roughly:

```ts
interface StorageService {
  put(key: string, data: Buffer | ReadableStream, meta: { mimeType: string }): Promise<void>;
  getSignedUrl(key: string, opts: { expiresInSeconds: number }): Promise<string>;
  delete(key: string): Promise<void>;
}
```

No business code should import an S3/R2 SDK directly — only the
adapter implementing `StorageService` does. This is what lets local
disk storage today become S3 later without touching `FileAsset`
authorization logic (`docs/PROJECT_SPEC.md` §8).

## 4. Notification Abstraction

Same pattern:

```
Business logic → NotificationService.notify(userId, payload) → adapter per channel
```

Launch adapter: in-app only (writes a `Notification` row) for general
product notifications. **Exception:** authentication emails (verify,
reset, security alerts) are launch-scope via SMTP regardless — they
aren't part of the general `Notification` product feature, they're a
required part of the auth lifecycle itself. See
`docs/INFRASTRUCTURE.md` §10 and `docs/AUTHENTICATION_FLOW.md`. Other
Telegram/SMS adapters, and routing general `Notification`s through
email, are still added later behind the same call site.

## 5. Component Architecture

```
src/components/ui/        generic, reusable primitives (Button, Card, Badge, …)
                           no business/domain knowledge, token-driven only
src/components/<domain>/  domain-specific composites (e.g. ProjectStatusBadge,
                           MilestoneCard) — created by later agents, built out
                           of src/components/ui primitives
```

`src/components/ui` primitives must stay generic — a `ProjectStatusBadge`
that maps `ProjectStatus` → `BadgeTone` belongs in
`src/components/project/`, not inside `Badge.tsx` itself. This keeps
`ui/` reusable for payments, files, or anything else with statuses.

## 6. Why No Backend Code Exists Yet

Agent 1's scope was foundation, not implementation. Agent 2 made the
backend-location decision (FastAPI, separate service —
`docs/BACKEND_ARCHITECTURE.md`) and the auth/security decisions
(`docs/AUTHENTICATION_FLOW.md`, `docs/SECURITY_ARCHITECTURE.md`) but
still did not implement them: writing `backend/app/**` before those
decisions existed would have meant guessing, and writing it in the
same phase as deciding it risks committing an unreviewed first draft
of both at once. See `agent.md` "Next Agent Instructions" — Agent 3
implements directly against the four documents above, without
inventing further major architectural decisions.
