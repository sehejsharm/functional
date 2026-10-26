# Mise · Staff

Hotel Service Execution Platform: Employee, Manager and Author portals behind one login.

**Core rule:** every task is a live instance of one exact, published SOP version. Managers assign against the
current published version only after reviewing it. Authors own Draft → Review (two independent approvals) → Release.
A release never changes rooms already in progress; they stay pinned to their version.

## Architecture

| Layer | Where | What |
| --- | --- | --- |
| Web app | Vercel | React + Vite + Tailwind PWA (`src/`) |
| API | Cloudflare Worker (`worker/src/index.ts`) | Hono: sign-in, setup, admin accounts, photos, actions |
| Operational data | Durable Object per property (`worker/src/hub.ts`) | Single consistent writer, SQLite storage, live WebSocket updates |
| Accounts & sessions | Cloudflare D1 (`worker/migrations`) | Passkeys stored as HMAC with a secret pepper; 14-day sessions; rate-limited sign-in |
| Step photos | Cloudflare R2 | Private; only the uploader, managers and authors can view |

Every write is an action handled by `src/lib/domain.ts`. The Worker runs it as the authority (permissions, tiers,
two-approval quorum, pinned versions, "do not enter yet" gating). The browser runs the same function first so the
UI updates instantly, and queues writes offline, replaying them in order when the hotel connection returns.

## Deploy

1. **API (Cloudflare):** with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set:
   ```bash
   npm install
   ALLOWED_ORIGINS=https://<your-app>.vercel.app npm run deploy:api
   ```
   Creates D1 + R2, applies migrations, sets the `PASSKEY_PEPPER` / `SETUP_TOKEN` secrets, deploys, and prints the
   setup token once.
2. **Web (Vercel):** set `VITE_API_URL` to the Worker URL and deploy (`vercel.json` handles SPA routing).
3. Open `/setup` on the web app, enter the setup token, and create the property and first Property admin. You get
   that admin's passkey once. Add roles, rooms, shifts and staff in **Platform foundation**; each person's passkey is
   shown once when you create it.

## Local development

```bash
npm install
printf 'PASSKEY_PEPPER=dev\nSETUP_TOKEN=dev\n' > worker/.dev.vars
npm run db:migrate:local
npm run dev:api        # http://localhost:8787
npm run dev            # http://localhost:5173
```
