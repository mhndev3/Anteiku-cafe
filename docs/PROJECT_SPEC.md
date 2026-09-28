# Project Specification

Status: living document. Established by Agent 1 (foundation/architecture).
Update this file whenever a later agent makes a decision that changes
product scope, data model or lifecycle — do not let it drift from reality.

## 1. Product Vision

A professional platform for accepting and managing custom software
development projects: websites, web applications, mobile/desktop apps,
bots, automation systems, APIs/backends, and other custom development
work.

This is **not** a marketing landing page with a contact form. It is a
full project-request and project-management system covering the entire
customer journey from initial request through final delivery.

Core product principle: **submitting a project request is not a
contract.** A request becomes a paid, active project only after the
developer reviews it, requirements are clarified, and the customer
explicitly approves a proposal (price + timeline) and pays a deposit.
Nothing about price, scope or payment is ever decided or trusted on
the frontend alone (see [Security Requirements](#10-security-requirements)).

## 2. User Roles

Three roles at this stage. Do not add more without a concrete need —
see `agent.md` "Do Not Change" for why this is intentionally minimal.

| Role | Can access |
|---|---|
| `CUSTOMER` | Only their own projects, requirements, proposals, milestones, payments, files and messages. Never another customer's data. |
| `DEVELOPER` | Assigned/incoming projects, customer-facing project data, proposals, milestones, payments (verify), files (upload/deliver), messages. **Not** automatically admin — no user management, no global settings. |
| `ADMIN` | Everything a developer can do, plus user management, service/question catalog management, and system configuration. Admin capabilities must be explicit grants, not implied by "developer". |

Authorization must be enforced server-side and be **object-level**:
"is this user a `CUSTOMER`" is necessary but not sufficient — the
server must also check "does this user own *this* project" before
returning or mutating it.

## 3. Application Areas

The codebase separates three conceptual areas. They may share the
Next.js App Router and UI primitives, but their concerns must not
bleed into each other (see `docs/ARCHITECTURE.md` for route layout).

**A. Public website** — unauthenticated. Hero, Services, How It Works,
Portfolio, About, FAQ, CTA, Login/Register entry points. Premium,
cinematic, fast. No project data rendered here.

**B. Customer workspace** — authenticated as `CUSTOMER`. Dashboard,
project creation flow, project workspace (overview/timeline/
requirements/milestones/files/payments/messages), notifications,
profile/account.

**C. Admin/developer workspace** — authenticated as `DEVELOPER` or
`ADMIN`. Incoming requests queue, project management, customer info,
internal notes (never visible to customers), proposal authoring,
milestone/payment verification, file delivery, audit/activity history.

## 4. Project Lifecycle (State Machine)

`Project.status` is a single source of truth, mutated only by the
server after validating the actor and preconditions. The frontend
never sets status directly — it calls an action (e.g. "approve
proposal") and the server decides the resulting state.

| Status | Meaning | Enter via | Customer sees | Developer sees |
|---|---|---|---|---|
| `DRAFT` | Customer is mid-way through the request wizard | Project created | Editable draft | Not listed |
| `SUBMITTED` | Customer submitted the request | Customer submits | "Submitted, awaiting review" | New in queue |
| `UNDER_REVIEW` | Developer is reviewing | Developer opens request | "Under review" | Reviewing |
| `CONTACTING_CUSTOMER` | Developer is clarifying requirements | Developer initiates contact | "We're reaching out" | Clarifying |
| `REQUIREMENTS_DEFINED` | Scope is understood well enough to quote | Developer confirms | "Requirements confirmed" | Ready to propose |
| `PROPOSAL_SENT` | A `Proposal` exists and was sent | Developer creates proposal | Price/timeline visible | Awaiting customer |
| `AWAITING_APPROVAL` | Customer is reviewing the proposal | System, on send | "Review proposal" | Awaiting customer |
| `AWAITING_DEPOSIT` | Customer approved; deposit unpaid | Customer approves proposal | "Pay deposit" | Awaiting payment |
| `ACTIVE` | Deposit verified; development underway | Deposit `Payment.status = VERIFIED` | Progress/milestones | Working |
| `MILESTONE_REVIEW` | A milestone was delivered, awaiting customer review | Developer submits milestone | "Review milestone" | Awaiting customer |
| `FINAL_REVIEW` | Final delivery submitted, pre-payment | Developer marks final delivery | "Final review" | Awaiting customer |
| `AWAITING_FINAL_PAYMENT` | Customer approved final delivery | Customer approves final review | "Pay final balance" | Awaiting payment |
| `DELIVERED` | Final payment verified; files unlocked | Final `Payment.status = VERIFIED` | Files downloadable | Delivered |
| `COMPLETED` | Project formally closed | Developer/admin closes | "Completed" | Completed |
| `CANCELLED` | Terminated before completion | Either party, with reason | "Cancelled" | Cancelled |
| `REJECTED` | Developer declines the request | Developer, from `UNDER_REVIEW` | "Not a fit" + reason | Rejected |

Rules that apply across all transitions:

- Every transition is written to `AuditLog` and a human-readable
  `ProjectActivity` entry.
- Every transition that changes what the customer should do next
  triggers a `Notification`.
- `CANCELLED` and `REJECTED` are terminal. Nothing else transitions
  automatically except payment verification (`AWAITING_DEPOSIT` →
  `ACTIVE`, `AWAITING_FINAL_PAYMENT` → `DELIVERED`), which is
  triggered by a developer/admin verifying a payment, never by the
  customer or by an unverified upload.
- The exact allowed-transition matrix (who may call which action from
  which state) is implemented in the service layer, not scattered
  across API routes — see `docs/ARCHITECTURE.md` section 3.

## 5. Project Request Workflow (Dynamic Forms)

Guided, multi-step flow rather than one long form:

1. **Service** — customer picks a `Service` (website, bot, app, API, …).
2. **Project details** — free-text title/summary.
3. **Questions** — `ServiceQuestion`s for the selected service are
   rendered dynamically and answered as `ProjectAnswer`s.
4. **Design direction** — pick a preset (`DesignPreference.presetSlug`)
   or describe a custom look (`customDescription`, `referenceUrls`).
5. **Additional details** — free-form `ProjectRequirement`s.
6. **Review & submit** — summary, then `Project.status: DRAFT → SUBMITTED`.

New service categories and their questions must be addable via data
(rows in `Service`/`ServiceQuestion`), never by shipping new frontend
code per service. See `src/types/domain.ts` for the shapes.

## 6. Data Model

The conceptual entities and their fields/relationships are defined as
TypeScript types in `src/types/domain.ts` — treat that file as the
authoritative, versioned contract, not this document. Summary of
entities: `User`, `Profile`, `Service`, `ServiceQuestion`, `Project`,
`ProjectAnswer`, `ProjectRequirement`, `DesignPreference`, `Proposal`,
`Milestone`, `MilestoneReview`, `Payment`, `FileAsset`, `Message`,
`Notification`, `AuditLog`, `ProjectActivity`.

No ORM schema exists yet. **Agent 2 decision:** the backend is a
separate FastAPI service using SQLAlchemy 2.x (async) + Alembic, not
Prisma — see `docs/BACKEND_ARCHITECTURE.md` for the full reasoning.
When the schema is introduced, it should map onto these types rather
than inventing a parallel shape; `User` additionally gains
`emailVerifiedAt` (added this phase, see `docs/AUTHENTICATION_FLOW.md`
§3) and a backend-only `password_hash` that never appears in this
frontend-facing contract.

## 7. Payment Model

First implementation: **manual bank transfer.**

- Customer sees the studio's card number / IBAN with copy buttons.
- Customer uploads a receipt and submits it for verification.
- A `Payment` row (`type: DEPOSIT | FINAL`) moves
  `PENDING → SUBMITTED` when a receipt is uploaded, then
  `SUBMITTED → VERIFIED | REJECTED` only by a developer/admin action.
  `REFUNDED` is manual/administrative.
- **The server is the only source of truth for `amount` and
  `status`.** The frontend never sends a status; it sends "I uploaded
  a receipt", and the server decides what that means.
- `Payment.method` is `BANK_TRANSFER` today; `GATEWAY` exists as a
  reserved value so a real payment gateway can be added later without
  changing the entity shape or the states above.

## 8. File Model

Categories: `PROJECT_ATTACHMENT`, `PAYMENT_RECEIPT`, `MILESTONE_FILE`,
`FINAL_SOURCE`.

- No file is ever served from a public, guessable URL. `FileAsset.storageKey`
  is an opaque key resolved server-side by a `StorageService`
  abstraction, never exposed directly to the client.
- `FINAL_SOURCE` files are the strictest category: downloadable only
  when the server confirms (a) the requesting user owns the project
  and (b) the project's final payment is `VERIFIED`. This check
  happens on every download request, not just at upload time.
- `StorageService` must be swappable between local disk, S3,
  Cloudflare R2, etc. without touching business logic — business code
  calls `StorageService.put/get/delete`, never a provider SDK directly.

## 9. Notification Architecture

Centralized: business logic emits a `Notification` (or a
provider-agnostic "notify" call), it never calls an email/SMS/Telegram
SDK directly.

- Launch channel: `IN_APP` only.
- Reserved channels: `EMAIL`, `TELEGRAM`, `SMS` — the `NotificationChannel`
  union in `src/types/domain.ts` already includes them so the schema
  doesn't need to change when they're implemented, only a delivery
  adapter needs to be added.

## 10. Security Requirements

Baseline, non-negotiable for every later agent. **Full concrete detail
— not restated here — lives in `docs/SECURITY_ARCHITECTURE.md` and
`docs/AUTHENTICATION_FLOW.md`, established by Agent 2; this section is
now a summary pointer, not the source of truth:**

- Password hashing: **Argon2id** (`docs/SECURITY_ARCHITECTURE.md` §1) —
  never plaintext, never reversible encryption.
- Server-side session/auth strategy: JWT access token + rotating
  refresh token (`docs/AUTHENTICATION_FLOW.md` §1) — never trust a
  client-supplied user id or role.
- RBAC (§2) **plus** object-level authorization (§2) on every
  project/payment/file/message read and write
  (`docs/SECURITY_ARCHITECTURE.md` §2).
- All input validated and sanitized server-side (Pydantic v2),
  regardless of any client-side validation.
- Rate limiting on auth, project-request submission, and file upload
  endpoints — exact limits in `docs/SECURITY_ARCHITECTURE.md` §6.
- CSRF strategy and secure, `httpOnly` cookie configuration:
  `docs/SECURITY_ARCHITECTURE.md` §5, `docs/AUTHENTICATION_FLOW.md` §1.
- Secure headers (CSP, `X-Content-Type-Options`, etc.) and an explicit
  CORS policy — no wildcard origins on authenticated routes
  (`docs/SECURITY_ARCHITECTURE.md` §4).
- File upload: MIME-type validation, file-size limits, private
  storage by default (§8, `docs/SECURITY_ARCHITECTURE.md` §8).
- Audit logging (`AuditLog`) for status changes, payment verification,
  auth events, and file delivery at minimum
  (`docs/SECURITY_ARCHITECTURE.md` §11).
- No secrets, credentials or API keys committed to Git — use
  environment variables (`.env*` is already git-ignored;
  `docs/SECURITY_ARCHITECTURE.md` §10).
- **Never trust frontend-provided price, payment status, project
  status, permissions, or file ownership.** Every one of these is
  computed or checked server-side, always
  (`docs/SECURITY_ARCHITECTURE.md` §9).

## 11. UX Principles

- Simple over feature-rich: avoid unnecessary pages, forms, popups.
- Full pages for consequential flows: project creation, project
  workspace, payments, files, account, admin dashboard.
- Modals only for lightweight interactions: login, register,
  confirmations, quick previews, short forms, file/image preview.
- Always show the customer what state their project is in and what
  happens next — never leave them guessing (§4 table's "Customer
  sees" column is the contract for this).
- Mobile, tablet and desktop are all first-class from the start.

## 12. Design System Direction

Full token reference, theme details and component inventory live in
`docs/DESIGN_SYSTEM.md`. Summary: two themes (Obsidian/Cinematic,
Digital/Blueprint) sharing one token set, implemented in
`src/styles/tokens.css`.

## 13. Performance & Three.js

Full detail in `docs/DESIGN_SYSTEM.md` §Three.js and §Performance.
Summary: Three.js is used deliberately (hero only, for now), lazy
loaded, with a reduced-motion and low-end-device fallback. Never
render WebGL unconditionally on every page.

## 14. Future Extensions

Architected for, not built yet: real payment gateway, Telegram/email/SMS
notification delivery, S3/R2 file storage, additional service
categories and design presets, additional roles if a real need
emerges. None of these should require changing the entity shapes in
`src/types/domain.ts` or the state machine in §4 — only adding
adapters/implementations behind the abstractions already documented.
