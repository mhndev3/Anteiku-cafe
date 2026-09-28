# Anteiku

A professional platform for accepting and managing custom software-development
projects: websites, web apps, bots, mobile/desktop apps, APIs/backends,
automation and other custom software.

> Status: **foundation phase.** Architecture, docs, design tokens, a small set
> of UI primitives and the domain type contract exist. Authentication, database,
> backend API, dashboards and the full public site are **not built yet**.
> See [`agent.md`](./agent.md) for the exact current state and next steps.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS v4

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## Documentation

| File | Purpose |
|---|---|
| [`agent.md`](./agent.md) | Handoff between sequential development agents: what exists, what's postponed, validation status |
| [`docs/PROJECT_SPEC.md`](./docs/PROJECT_SPEC.md) | Product vision, roles, lifecycle, payments, files, security, UX |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Frontend layering, route structure, storage/notification abstractions |
| [`docs/BACKEND_ARCHITECTURE.md`](./docs/BACKEND_ARCHITECTURE.md) | FastAPI service: Clean Architecture layering, project structure, API conventions |
| [`docs/SECURITY_ARCHITECTURE.md`](./docs/SECURITY_ARCHITECTURE.md) | Concrete mitigations: injection, IDOR, CSRF, rate limiting, file upload, secrets |
| [`docs/AUTHENTICATION_FLOW.md`](./docs/AUTHENTICATION_FLOW.md) | JWT + refresh-token-rotation design, every auth flow, entities |
| [`docs/INFRASTRUCTURE.md`](./docs/INFRASTRUCTURE.md) | Docker/Nginx/Postgres/Redis topology, dev vs prod, SMTP, testing strategy |
| [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md) | Two themes, design tokens, components, Three.js guidelines |
| [`docs/DEVELOPMENT_WORKFLOW.md`](./docs/DEVELOPMENT_WORKFLOW.md) | Six-agent sequential workflow, git and validation rules |

## Project layout

```
src/
  app/               Next.js App Router (layout, globals.css, page)
  components/ui/     Generic, token-driven UI primitives
  lib/               Small shared utilities
  styles/tokens.css  Design tokens for both themes
  types/domain.ts    Domain type contract (not a DB schema)
docs/                Specification and architecture documents
```

## Security note

Never commit secrets. `.env*` files are git-ignored. See the security section
of `docs/PROJECT_SPEC.md` for the baseline every contributor must follow.
