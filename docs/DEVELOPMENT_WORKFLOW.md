# Development Workflow

## 1. The Six-Agent Model

This repository is built sequentially by six Claude agents, possibly
across different machines/accounts. Each agent:

1. **Reads `/agent.md` first**, before touching anything. It is the
   single source of truth for "what actually exists right now,"
   overriding any assumption from a task prompt or from this file.
2. Inspects the repository for itself (`git status`, `git log`,
   relevant directories) rather than trusting `agent.md` blindly —
   `agent.md` records what its author believed to be true, and should
   be read as recent-but-verifiable, not infallible.
3. Works only within its assigned scope (see its own task prompt).
   Do not "helpfully" start a later agent's scope early — this causes
   agents to collide on the same code with different assumptions.
4. Updates `/agent.md` before finishing, accurately — never with
   aspirational or fictional completion claims.
5. Leaves the repository in a state the next agent can build on:
   working tree clean, build/lint status documented (even if failing),
   one meaningful commit, pushed if remote access is available.

## 2. Git Workflow

- Branch: `main` for now (six agents working sequentially, not in
  parallel — no feature-branch workflow needed yet). If agents ever
  work concurrently, introduce feature branches then, not
  preemptively.
- Before changing anything: `git status`, `git branch --show-current`,
  `git remote -v`.
- Before committing: `git status`, `git diff`, `git diff --stat` —
  confirm nothing unintended (secrets, build artifacts, `node_modules`)
  is staged.
- **One meaningful commit per agent**, not a series of "wip"/"fix"
  commits. Message format:

  ```
  agent-0N: <short summary of what this agent established/built>
  ```

  Example: `agent-01: establish project architecture and design system foundation`

- Push to `origin/main` if remote access is available; if not,
  document that in `agent.md` "Known Issues" rather than silently
  skipping it.

## 3. Testing Expectations

- No test framework is configured yet (see `agent.md` for current
  status). The agent that introduces the first non-trivial business
  logic (likely the state-machine transitions or an API route) should
  also introduce a test runner — don't leave logic like payment-status
  transitions or file-download authorization untested.
- Until then, "testing" means: `npm run build` succeeds, `npm run
  lint` is clean, and TypeScript reports no errors. Every agent runs
  these before committing and records the results in `agent.md`,
  pass or fail.

## 4. Documentation Expectations

- `docs/PROJECT_SPEC.md` — update when product scope, lifecycle, or
  data model changes.
- `docs/ARCHITECTURE.md` — update when the actual backend/route
  structure diverges from what's documented (i.e. keep it in sync as
  routes/services get built).
- `docs/DESIGN_SYSTEM.md` — update when tokens or the component
  inventory change.
- Don't let documentation describe aspirational structure as if it
  exists — mark clearly what's implemented vs. planned, the way this
  set of docs does.

## 5. Handoff Rules

- `agent.md` is append-and-revise, not append-only: update "Completed"
  /"In Progress"/"Not Started" to reflect current reality rather than
  layering agent-by-agent logs on top of each other. Keep one accurate
  snapshot.
- If an agent must deviate from a previous agent's architecture
  decision, it should say so explicitly in `agent.md` under
  "Architecture Decisions," with the reason — silent deviation is
  what breaks the next agent.
- "Do Not Change" in `agent.md` is a signal, not a hard lock — a later
  agent with good reason can change it, but must document why.
