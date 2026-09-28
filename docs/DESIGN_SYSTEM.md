# Design System

Status: foundation established by Agent 1. Tokens are implemented and
working (`src/styles/tokens.css`); most components and both full
themes' visual polish are not.

## 1. Direction

Premium, dark, cinematic, technical, minimal, professional. A serious
software studio — not a generic "AI startup" gradient-and-blob
aesthetic.

Two themes, one shared token contract:

**Theme A — Obsidian / Cinematic** (default, `data-theme="obsidian"`
or unset). Black/charcoal base, glass surfaces, soft glow, large
typography, restrained 3D. Used across the public site and most of
the product.

**Theme B — Digital / Blueprint** (`data-theme="blueprint"`). Navy/
graphite base, technical grid, wireframe-inspired accents, engineering
feel. Intended for places that benefit from a more technical register
(e.g. an admin/developer workspace, or specific marketing sections) —
not mandated everywhere.

Both themes are switched purely via the `data-theme` attribute on
`<html>` — no component should branch on theme in JS/TSX. If a
component looks wrong in one theme, fix the token values, not the
component.

## 2. Tokens

Source of truth: `src/styles/tokens.css`. Mapped into Tailwind
utilities via `@theme inline` in `src/app/globals.css`, so both
`var(--color-accent)` and `bg-accent` work.

| Category | Tokens | Notes |
|---|---|---|
| Color | `--color-bg`, `-bg-elevated`, `-surface`, `-surface-glass`, `-border`, `-border-strong`, `-fg`, `-fg-muted`, `-fg-subtle`, `-accent`, `-accent-fg`, `-accent-soft`, `-highlight`, `-success`, `-warning`, `-danger`, `-info` | Redefined per `[data-theme]`, shared names |
| Radius | `--radius-sm/md/lg/xl/full` | |
| Shadow | `--shadow-sm/md/lg`, `--shadow-glow-accent` | |
| Blur | `--blur-sm/md/lg` | For glass surfaces |
| Motion | `--duration-fast/base/slow`, `--ease-standard`, `--ease-emphasized` | |
| Z-index | `--z-base/header/dropdown/overlay/modal/toast` | Use these, not ad hoc `z-50` |
| Typography | `--font-sans`, `--font-mono`, `--text-display/h1/h2/h3/body-lg/body/body-sm/caption` | Fluid via `clamp()` |
| Section spacing | `--space-section-y`, `--space-section-x` | For page-level rhythm; use Tailwind's spacing scale for component-internal spacing |
| Blueprint grid | `--grid-line`, `--grid-size` | Blueprint theme only, not part of the shared contract |

Breakpoints deliberately use Tailwind's default scale (`sm/md/lg/xl/2xl`)
rather than a custom set — no reason to diverge from a well-understood
default.

**Rule:** no component may hardcode a raw hex color, px shadow, or
arbitrary z-index. Add a token if one doesn't exist yet.

## 3. Component Inventory

Implemented in `src/components/ui/` (see `index.ts` for the barrel
export):

- `Button` — variants `primary | secondary | outline | ghost`, sizes `sm | md | lg`
- `Card` — neutral surface container, no built-in slots
- `Badge` — tones `neutral | accent | success | warning | danger`

**Not yet implemented** (documented placeholders — build these in
`src/components/ui/` following `Button.tsx`'s pattern — `forwardRef`,
a `base` class string, a `variants`/`sizes` record, tokens only, no
hardcoded values — when a real screen first needs each one):

`Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Dialog`/`Modal`,
`Tabs`, `Progress`, `Toast`, `Tooltip`, `FileUpload`, `Stepper`,
`Skeleton`, `EmptyState`, `ErrorState`.

Domain-specific composites (e.g. `ProjectStatusBadge`,
`MilestoneCard`) do not belong in `ui/` — see `docs/ARCHITECTURE.md`
§5.

## 4. Three.js Guidelines

- One reusable visual system, not a scene wired directly into a page
  component. Expect a `src/components/three/` module when this is
  built, with the scene itself decoupled from where it's mounted.
- Lazy-load the Three.js bundle (dynamic import, `ssr: false`) — never
  ship it in the main bundle for a page that might not render it.
- Respect `prefers-reduced-motion` (already handled globally at the
  CSS level in `globals.css` for CSS animations; a Three.js scene must
  check this itself, e.g. via `window.matchMedia`, and either skip
  animation or render a static fallback).
- Provide a non-WebGL fallback (static image or gradient) for devices
  that don't support it or where a capability check fails.
- Hero only, for the first pass. Do not spread WebGL scenes across
  every page "because it's available."

## 5. Performance

- Code-split by route (App Router does this by default — don't
  fight it with premature `"use client"` at the layout level).
- Lazy-load anything heavy and below the fold.
- `next/image` for all raster images; explicit `width`/`height` to
  avoid layout shift.
- Animation throttling: prefer CSS transitions using the `--duration-*`
  tokens over JS-driven animation loops where possible.
- Mobile is not an afterthought: test the token-driven layout at
  small viewports as components are built, not after.
