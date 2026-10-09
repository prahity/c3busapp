# Blank Package — Template Initial State

This summary describes the **initial state** of a workspace created from the `blankPkg`
template, before any user changes, **and embeds the key patterns** (backend calls, route/nav
wiring, which example to copy) you would otherwise open files to learn.

**Treat this summary as sufficient to start building.** Do not open the template files listed
below just to orient yourself or "see what's there" — the structure and the patterns you need
are here. Only open a specific file when you are about to **modify it**, or when you need an
exact detail this summary genuinely does not contain (then read just that file).

> The package directory and its `*.c3pkg.json` are renamed to your package name at creation
> time. Paths below use `<pkg>` to mean that package folder.

## What's scaffolded vs empty

- **Backend (`<pkg>/src/`): does not exist yet.** The template has **no top-level `src/`** (the only
  `src/` is `ui/react/src/`). Create `<pkg>/src/` for the domain entities (`.c3typ`) and
  implementations you add.
- **Frontend (`<pkg>/ui/react/`): fully wired React + Vite + TypeScript + Tailwind shell** with
  no application pages — `<Routes>` contains only a catch-all `path="*"` fallback and there is a
  single "Demo" nav item.
- **No `seed/`, `data/`, `config/`, `metadata/`, `test/`, or `gen/`** directories exist yet;
  create them as needed following the standard C3 package structure.

## Package root

- `<pkg>.c3pkg.json` — manifest. Declares the package dependencies (e.g. `mcpServer`); check the
  file for exact versions. `author`/`description` are
  filled in at creation; `name` is your package name. Do not change the package name.

## Frontend layout (`<pkg>/ui/react/`)

Tooling: Vite + React 18 + TypeScript + Tailwind v4, Radix UI, TanStack Table/Query, Recharts/
ECharts, Leaflet, react-router-dom, axios, i18next. Scripts: `dev`, `build`, `test`
(`jest --passWithNoTests`), `lint`. Config files: `vite.config.mts`, `tsconfig*.json`,
`eslint.config.js`, `jest.config.ts` / `jest.setup.ts`, `components.json`, `.npmrc`.

`src/` structure:

| Path | Contents |
| --- | --- |
| `main.tsx` | Mounts `<App/>` inside a `HashRouter`. |
| `App.tsx` | App shell: `TopNav` across the top + `SideNav` down the left + a `<Routes>` in `<main>` that has the `/` Dashboard route and a catch-all `path="*"` fallback (add application routes alongside them — see "Add a page" below). **`TopNav` and `SideNav` are rendered here, OUTSIDE `<Routes>`, so they appear on every page — the router only swaps `<main>`. Per the design system the TopNavBar is required on every screen; keep it in the shell and never move it into a route or a page.** |
| `c3Action.ts` | Backend client (API surface below). |
| `config/navigation.ts` | Nav config: one "Demo" item (`/`) plus `addNavigationItem` / `removeNavigationItem` / `updateNavigationBadge` helpers. |
| `components/` | `SideNav` (built on `SideNavPanelV2` — the next-generation collapsible app rail; `SideNavBar` is the legacy icon-only rail), `TopNav` (built on `TopNavBar`), `ErrorBoundary`. |
| `components/ui/` | **C3 Design System primitives**, vendored from the `c3-frontend` skill's `references/examples/ui/` (source: the design team's Storybook / `c3-e/c3design`). ~80 components — `button`, `input`, `table`, `modal`, `dropdown-menu`, `tabs`, `badge`, `card`, `side-nav-panel-v2`, `top-nav-bar`, `data-grid`, `date-picker`, and more. Two-axis API: `variant` (visual style) + `appearance` (semantic swatch, e.g. `appearance="danger"`); never `tone`. Styled with Tailwind + `--c3-style-*` tokens (some also ship a `.scss`). **Do not hand-edit — they are re-synced from the design system.** |
| `contexts/` | `AppStateProvider`, `ReportStateProvider`. |
| `hooks/` | `useTheme` (toggles `.dark` on `<html>`), `useEffectExceptOnMount`. |
| `clientProvider/` | axios configuration. |
| `globals.css`, `styles/` | Design-system stylesheet cascade. `globals.css` imports `tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, `@fontsource-variable/inter`, then `styles/tokens.css` (Figma-generated three-layer token cascade) and `styles/manual-tokens.css`, and defines the `@theme inline` / `@layer base` blocks. Components reference Layer-3 `--c3-style-basic-*` tokens and `text-c3-{regular,bold}-{display,heading,body,label,code}-*` typography utilities. Keep aligned with the skill's `references/examples/styles/index.css`. |
| `lib/utils.ts`, `types/`, `assets/`, `data/sampleData.ts` | Utilities, types, static assets, placeholder sample data. |
| `shared/api.ts` | Example `c3Action`-backed API helpers (`fetchUsers`/`fetchUserGroups` against `User`/`UserGroup`) — real backend calls, not placeholder data. |

`public/` holds fonts (Inter, FontAwesome, C3 web-component icons). `index.html` is required for the
build — if it goes missing, copy it from an example and/or run `npm run build`.

## Backend calls — `c3Action.ts` API (you do NOT need to open this file)

All exported from `@/c3Action` (or `./c3Action`). Each returns `Promise<any>` and posts to
`<appBaseUrl>/api/8/<TypeName>/<action>`:

- `c3Action(typeName, actionName, spec?)` — general call. For **fetch**, `actionName='fetch'` and
  `spec` is a Filter/FetchSpec object. For other actions, `spec` is an **array of args**.
- `c3CreateAction(typeName, actionName, spec)` — create/merge; `spec` is the object to persist.
- `c3MemberAction(typeName, actionName, instance, spec?)` — call a member function on `instance`.
- `c3GetAction(typeName, id, include='id')` — convenience get-by-id.

Typical fetch:

```ts
import { c3Action } from '@/c3Action';

const res = await c3Action('Vehicle', 'fetch', { include: 'this', limit: -1 });
const vehicles = res.objs ?? [];
```

## Add a page (route + nav) — the wiring you'd otherwise read `App.tsx`/`navigation.ts` to learn

1. In `src/App.tsx`, add a route inside `<Routes>` (the file already imports both `Route` and
   `Routes`, so no import change is needed):

```tsx
import FleetPage from './pages/FleetPage';
// ...
<Routes>
  <Route path="/fleet" element={<FleetPage />} />
  {/* the existing catch-all <Route path="*" .../> stays */}
</Routes>;
```

2. In `src/config/navigation.ts`, add an item to `navigationConfig` (icon is a `lucide-react`
   component); `path` must match the route:

```ts
import { Car } from 'lucide-react';

{ id: 'fleet', path: '/fleet', icon: Car, iconActive: Car, label: 'Fleet', tooltip: 'Fleet overview' }
```

Your page component should render **content only** — do NOT add your own `TopNav`/`TopNavBar`
or `SideNav`. The shell (`App.tsx`) already renders the top bar and side nav around every route,
so a page that adds its own would double it up.

## Reference library — the `c3-frontend` skill's `references/examples/`

The **C3 Design System reference** is NOT vendored into the template; it ships with the
`c3-frontend` skill and is available in the workspace at
`.claude/skills/c3-frontend/references/examples/` (source of truth: the design team's
Storybook / `github.com/c3-e/c3design`). Read it there when building UI (don't reinvent).
**Do not hand-edit the vendored files** — they are re-synced from the design system; copy a
component out into your own file if you need to change it. **How to use:**

1. Skim `foundations.md` first — the shared conventions: the two-axis component API
   (`variant` = visual style + `appearance` = semantic swatch like `danger`/`success`; never
   `tone`), dark mode via the `.dark` class, `--c3-style-basic-*` color tokens, and the
   `text-c3-{regular,bold}-{display,heading,body,label,code}-*` typography utilities.
2. Open `index.md` (catalog of every component), then only the matching `*.md` card for the
   component you need — each card has the import path, a copy-paste snippet, and the props
   contract. The runnable source is already vendored under `src/components/ui/`; import from
   `@/components/ui/<name>`.
3. For a whole page, start from the skill's `page-layouts/` — `_shell/AppShell`,
   `DashboardPage`, `ListPage`, `DetailPage`, `EmptyState`, `LoginPage` — instead of assembling
   app chrome by hand. The app shell (`src/App.tsx` + `SideNav` + `TopNav`) is already built on
   these primitives.

See the skill's `references/examples/index.md` for the full component catalog. Import alias `@/` maps
to `src/`. Page layouts in the skill are **not** routed by default — copy the ones you need
into `src/pages/` and wire them as shown in "Add a page" above.

