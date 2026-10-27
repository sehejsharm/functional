# Mise · Staff

Hotel Service Execution Platform: an Employee, a Manager and an Author portal behind one login.

**The core rule:** every task is a live instance of one exact, published SOP version. Managers assign against the
current published version ("You reviewed this exact version"). Authors own Draft → Review (2 independent approvals) → Release.
A release never changes rooms already in progress; they stay pinned to their version.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 — demo passkey: miseauroragrand26
npm run build
```

## Deploy on Vercel

Import the repo in Vercel. `vercel.json` sets the Vite build and SPA rewrites (deep links like `/manager/sops` work).
Environment variables (Project → Settings → Environment Variables; use different values for Preview and Production):

| Variable | Purpose |
| --- | --- |
| `VITE_DEMO_PASSPHRASE` | Shared demo passkey. When set, the login screen stops showing the default hint. |
| `VITE_FIREBASE_*` | Optional. Leave unset to run on the built-in demo backend. |
| `VITE_STATIC_PREVIEW` | Build-time only. `1` builds for static hosting (hash routes, relative assets, no service worker). |

## What each portal does

| Portal | Screens |
| --- | --- |
| **Employee** (phone-first) | My work (check-in, shift progress, Up next, sent-back rooms, notices) · Room task (timer, steps, verification, report an issue) · Guides and guide reader · Reports (incidents) · Me (profile, attendance, notices, acknowledgments) |
| **Manager** | Overview (KPIs, Needs attention, team progress) · Live tasks (verify, send back, reassign, cancel, bulk) · Assign work (single and bulk) · Incidents · Shift cover & time off · Staff directory · Hotel notices · Employee SOPs · Insights and Lead operations (Senior manager) · Settings |
| **Author** | SOP library · SOP detail (versions, compare, feedback, activity) · Create / edit SOP with PDF import and live phone preview · Reviews & releases · Feedback & requests · Use & results (Senior) · Platform & audit (Property admin) |

Across the app: ⌘K / Ctrl+K command palette, notifications centre, breadcrumbs, CSV export on tables, toasts and confirmations
for every action, keyboard and screen-reader support (WCAG 2.1 AA colours, focus management in dialogs and menus).

## Structure

```
src/theme            design tokens (CSS variables → Tailwind): dark sidebar, light canvas, AA status colours
src/components/ui    UI kit: Button/ButtonLink, Badge, StatCard, DataTable, Tabs, Modal/Drawer/Menu, form fields…
src/components       SopSteps (shared step list), Charts
src/lib              domain types, seed data, demo backend (db.ts), session, permissions, hotel time,
                     notifications, toasts/confirm, SOP PDF importer (sopImport.ts)
src/shell            portal shell (sidebar, top bar, breadcrumbs), command palette, tier gates, help, 404
src/portals/{employee,manager,author}   screens + portal-specific actions.ts / model.ts / components.tsx
e2e                  browser tests (Playwright)
firestore.rules      server-side enforcement for the Firebase backend
```

## Browser tests

Build and serve, then run the scripts (they need Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`):

```bash
npm run build && npx vite preview --port 4173 &
npm run e2e:smoke                      # every route, desktop + phone: no crashes, console errors, blank screens, overflow
npm run e2e:nav                        # in-app navigation never leaves the Employee screen blank
SOP_PDF=path/to/sop.pdf npm run e2e:flow   # PDF import → 2 approvals → release → assign → execute → send back → verify
```

## Demo notes

- Data lives in `src/lib/db.ts`, a local store shaped like the Firestore collections and persisted in `localStorage`
  (other tabs update live). It re-seeds each hotel day. Reset it from **Demo** at the bottom of the sidebar, or Author → Platform & audit.
- Locked screens (Acknowledgment ledger, Team progress, Lead operations…) need Senior manager or Property admin.
  Open **Demo** in the sidebar to change the access tier, or (Employee portal) to view as any rostered staff member.
- The status chip in the sidebar simulates the two independent failure states (hotel system offline,
  check-in not confirmed). Step ticks and check-ins made offline queue and sync on reconnect.
- All times are hotel time (Asia/Colombo), never device time.
