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

## Structure

```
src/theme            design tokens (CSS variables → Tailwind)
src/components/ui    primitives: Button, Pill, Drawer, Tabs, CheckMark, ShiftEventInterstitial…
src/lib              domain types, seed data, demo backend (db.ts), session/role grants, permissions, hotel time
src/shell            portal shell, persona switcher, tier gates, help drawer, All screens directory
src/portals/{employee,manager,author}
firestore.rules      server-side enforcement for the Firebase backend
```

## Demo notes

- Data lives in `src/lib/db.ts`, a local store shaped like the Firestore collections and persisted in `localStorage`
  (other tabs update live). It re-seeds each hotel day. Reset it from Author → Platform foundation.
- Locked screens (Acknowledgment ledger, Team progress, Lead operations…) need Senior manager or Property admin.
  Use **Demo access tier** in the sidebar to preview them.
- **Hotel connection → Details** in the sidebar simulates the two independent failure states (hotel system offline,
  check-in not confirmed). Step ticks made offline queue and clear on reconnect.
- All times are hotel time (Asia/Colombo), never device time.
