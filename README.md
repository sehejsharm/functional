# Mise · Staff

Hotel Service Execution Platform: an Employee, a Manager and an Author portal behind one login.

**The core rule:** every task is a live instance of one exact, published SOP version. Managers assign against the
current published version ("You reviewed this exact version"). Authors own Draft → Review (2 independent approvals) → Release.
A release never changes rooms already in progress; they stay pinned to their version.

## Two ways to run

| Mode | When | Data | Sign-in |
| --- | --- | --- | --- |
| **Live** | `VITE_API_URL` is set at build time | Cloudflare: one Durable Object per property, D1 for accounts, R2 for photos | Each person's own passkey, issued by the property admin |
| **Demo** | `VITE_API_URL` is not set | A sample hotel kept in this browser (re-seeds each hotel day, syncs between tabs) | Shared passkey `miseauroragrand26`; switch tier and "viewing as" from **Demo** in the sidebar |

Both modes run the same rules: every write is an action handled by `src/lib/domain.ts`. Live, the Worker runs it as the
authority (permissions, tiers, the two-approval quorum, version pinning, "do not enter yet", independent verification)
and the browser runs it first so the screen updates instantly. Demo runs it against `src/lib/demo.ts`, which plays the
server's part. Writes made offline queue on the device and replay in order when the hotel connection returns.

## Architecture (live)

| Layer | Where | What |
| --- | --- | --- |
| Web app | Vercel | React + Vite + Tailwind PWA (`src/`) |
| API | Cloudflare Worker (`worker/src/index.ts`) | Hono: sign-in, first-run setup, admin accounts, photos, actions |
| Operational data | Durable Object per property (`worker/src/hub.ts`) | Single consistent writer, SQLite storage, live WebSocket updates |
| Accounts & sessions | Cloudflare D1 (`worker/migrations`) | Passkeys stored as HMAC with a secret pepper; 14-day sessions; rate-limited sign-in |
| Step photos | Cloudflare R2 | Private; only the uploader, managers and authors can view |

## Deploy

1. **Vercel only (demo):** import the repo. `vercel.json` runs `scripts/vercel-build.sh` and handles SPA routes. Without
   Cloudflare credentials the site builds in demo mode.
2. **With the live API:** add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the Vercel project (Settings →
   Environment Variables). Each build then deploys the Worker (creates D1 + R2, applies migrations, sets the
   `PASSKEY_PEPPER` / `SETUP_TOKEN` secrets) and points the web app at it. The setup token is printed once in the build log
   (or set `SETUP_TOKEN` yourself). You can also deploy the API by hand: `ALLOWED_ORIGINS=https://<app>.vercel.app npm run deploy:api`,
   then set `VITE_API_URL` to the Worker URL.
3. Open `/setup` on the web app, enter the setup token, and create the property and its first Property admin (that
   passkey is shown once). Add job roles, rooms, shifts and staff in **Platform & audit → People & access**; each person's
   passkey is shown once when you create it.

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Worker URL. Set automatically by the Vercel build when Cloudflare credentials are present. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Let the Vercel build deploy the API. |
| `SETUP_TOKEN` | Optional: choose the one-time setup token instead of having one generated. |
| `VITE_SUPPORT_EMAIL` | Optional: shows "Contact support" in Help. |
| `VITE_DEMO_PASSPHRASE` | Demo mode only: replaces the published demo passkey. |
| `VITE_STATIC_PREVIEW` | Build-time only. `1` builds for static hosting (hash routes, relative assets, no service worker). |

## Local development

```bash
npm install
npm run dev                               # demo mode, http://localhost:5173

# live mode
printf 'PASSKEY_PEPPER=dev\nSETUP_TOKEN=dev\n' > worker/.dev.vars
npm run db:migrate:local
npm run dev:api                           # http://localhost:8787
VITE_API_URL=http://localhost:8787 npm run dev
```

## What each portal does

| Portal | Screens |
| --- | --- |
| **Employee** (phone-first) | My work (check-in, shift progress, Up next, sent-back rooms, notices) · Room task (timer, steps, step photos, verification, report an issue) · Guides and guide reader · Reports (incidents) · Me (profile, attendance, notices, acknowledgments, time off) |
| **Manager** | Overview (KPIs, Needs attention, team progress) · Live tasks (verify, send back, reassign, cancel, bulk) · Assign work (single and bulk) · Incidents · Shift cover & time off · Staff directory · Hotel notices · Employee SOPs · Insights and Lead operations (Senior manager) · Settings |
| **Author** | SOP library · SOP detail (versions, compare, feedback, activity) · Create / edit SOP with PDF import and live phone preview · Reviews & releases · Feedback & requests · Use & results (Senior) |
| **Administration** (Property admin) | Platform & audit: people and passkeys, shifts, rooms, job roles, property settings, access requests, audit log, release policy |

Across the app: ⌘K / Ctrl+K command palette, notifications centre, breadcrumbs, CSV export on tables, toasts and confirmations
for every action, keyboard and screen-reader support (WCAG 2.1 AA colours, focus management in dialogs and menus).

## Structure

```
src/theme            design tokens (CSS variables → Tailwind): dark sidebar, light canvas, AA status colours
src/components/ui    UI kit: Button/ButtonLink, Badge, StatCard, DataTable, Tabs, Modal/Drawer/Menu, form fields…
src/components       SopSteps (shared step list), Charts
src/lib              domain.ts (every rule and action), db.ts (client store, outbox, live/demo transport), api.ts,
                     session.ts, demo.ts + seed.ts (demo hotel), time (hotel time zone), notifications, toasts, sopImport.ts
src/auth             sign-in, first-run setup, join request
src/shell            portal shell (sidebar, top bar, breadcrumbs), command palette, tier gates, help, 404
src/portals/{employee,manager,author}   screens + portal-specific actions.ts / model.ts / components.tsx
worker               Cloudflare Worker (API + Durable Object), D1 migrations, wrangler.toml
e2e                  browser tests (Playwright)
```

## Browser tests

Build and serve, then run the scripts (they need Playwright with Chromium):

```bash
npm run build && npx vite preview --port 4173 &
npm run e2e:smoke                          # demo: every route, desktop + phone: no crashes, console errors, blank screens, overflow
npm run e2e:nav                            # demo: in-app navigation never leaves the Employee screen blank
SOP_PDF=path/to/sop.pdf npm run e2e:flow   # demo: PDF import → 2 approvals → release → assign → execute → send back → verify

# live: against a fresh local API (npm run dev:api) and a live build served on :4174
SETUP_TOKEN=dev node e2e/live-setup.cjs > passkeys.json
KEYS=passkeys.json SOP_PDF=path/to/sop.pdf node e2e/live-flow.cjs   # the same workflow, each step as a different person
```

All times are hotel time (the property's time zone), never device time.
