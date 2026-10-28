import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import type { Actor } from '../../src/lib/domain'
import { initials } from '../../src/lib/domain'
import type { Portal, RoleGrant, Tier } from '../../src/lib/types'
import { PropertyHub, type Env } from './hub'

export { PropertyHub }

const SESSION_DAYS = 14
const PASSKEY_LEN = 17
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/o/1/l/i: easy to read aloud and type

type AccountRow = { id: string; property_id: string; person_id: string; name: string; grants_json: string; disabled: number }
type Vars = { account: AccountRow; actor: Actor }
const app = new Hono<{ Bindings: Env; Variables: Vars }>()

// ── crypto helpers ─────────────────────────────────────────────
const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
}
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
function randomString(n: number, alphabet = ALPHABET) {
  const out: string[] = []
  const buf = new Uint8Array(n * 2)
  while (out.length < n) {
    crypto.getRandomValues(buf)
    for (const b of buf) { if (b < 256 - (256 % alphabet.length)) out.push(alphabet[b % alphabet.length]!); if (out.length === n) break }
  }
  return out.join('')
}
const newId = (p: string) => `${p}-${randomString(12, 'abcdefghijklmnopqrstuvwxyz0123456789')}`
const normalize = (p: string) => p.trim().toLowerCase().replace(/\s+/g, '')

const hub = (env: Env, propertyId: string) => env.HUB.get(env.HUB.idFromName(propertyId))
const grantsOf = (row: AccountRow) => JSON.parse(row.grants_json) as RoleGrant[]
const actorOf = (row: AccountRow): Actor => ({ personId: row.person_id, grants: grantsOf(row).filter((g) => g.propertyId === row.property_id).map(({ portal, tier }) => ({ portal, tier })) })
const publicAccount = (row: AccountRow) => ({ id: row.id, personId: row.person_id, name: row.name, propertyId: row.property_id, grants: grantsOf(row) })

async function createSession(env: Env, accountId: string) {
  const token = randomString(40, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
  const now = new Date()
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), accountId, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * 864e5).toISOString()).run()
  return token
}

async function rateLimited(c: Context<{ Bindings: Env; Variables: Vars }>, bucket: string, max: number) {
  const ip = `${bucket}:${c.req.header('CF-Connecting-IP') ?? 'local'}`
  const since = Date.now() - 15 * 60_000
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(since).run()
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at >= ?').bind(ip, since).first<{ n: number }>()
  if ((n?.n ?? 0) >= max) return true
  await c.env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run()
  return false
}

// ── middleware ─────────────────────────────────────────────────
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return cors({
    origin: (o) => (allowed.includes(o) || allowed.some((a) => a.startsWith('*') && o.startsWith('https://') && o.endsWith(a.slice(1))) ? o : null),
    allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'OPTIONS'], maxAge: 86400,
  })(c, next)
})

const requireAuth = async (c: Context<{ Bindings: Env; Variables: Vars }>, next: () => Promise<void>) => {
  const h = c.req.header('Authorization')
  const token = h?.startsWith('Bearer ') ? h.slice(7) : c.req.query('token')
  if (!token) return c.json({ error: 'Sign in required' }, 401)
  const row = await c.env.DB.prepare(
    `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled = 0`,
  ).bind(await sha256(token), new Date().toISOString()).first<AccountRow>()
  if (!row) return c.json({ error: 'Your session has ended. Sign in again.' }, 401)
  c.set('account', row); c.set('actor', actorOf(row))
  await next()
}
const requireAdmin = async (c: Context<{ Bindings: Env; Variables: Vars }>, next: () => Promise<void>) => {
  if (!c.get('actor').grants.some((g) => g.tier === 'admin')) return c.json({ error: 'Property admins only' }, 403)
  await next()
}

// ── public ─────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true }))

app.get('/setup/status', async (c) => {
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>()
  return c.json({ needsSetup: (n?.n ?? 0) === 0 })
})

/** First-run: create the property and its first Property admin. Needs the SETUP_TOKEN secret and only works once. */
app.post('/setup', async (c) => {
  if (await rateLimited(c, 'setup', 10)) return c.json({ error: 'Too many attempts. Wait 15 minutes.' }, 429)
  const b = await c.req.json<{ setupToken: string; propertyName: string; city: string; timeZone: string; adminName: string }>()
  if (!c.env.SETUP_TOKEN || b.setupToken !== c.env.SETUP_TOKEN) return c.json({ error: 'Setup token is not correct' }, 403)
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>()
  if ((n?.n ?? 0) > 0) return c.json({ error: 'Mise is already set up' }, 409)
  if (!b.propertyName?.trim() || !b.adminName?.trim()) return c.json({ error: 'Property and admin name are required' }, 400)
  try { new Intl.DateTimeFormat('en', { timeZone: b.timeZone }) } catch { return c.json({ error: 'Unknown time zone' }, 400) }

  const propertyId = newId('prop'), personId = newId('person'), accountId = newId('acct')
  const now = new Date().toISOString()
  const roles = [
    { id: newId('role'), name: 'Room attendant', team: 'Housekeeping' },
    { id: newId('role'), name: 'Housekeeping supervisor', team: 'Housekeeping' },
  ]
  const admin = { id: personId, propertyId, name: b.adminName.trim(), initials: initials(b.adminName), jobRoleId: roles[1]!.id, title: 'Property admin', catalogue: ['pilot', 'whole'] as ('pilot' | 'whole')[] }
  await hub(c.env, propertyId).init({ id: propertyId, name: b.propertyName.trim(), city: (b.city ?? '').trim(), timeZone: b.timeZone, codeScheme: '{TEAM}-{NUMBER}', defaultTimeTargetMin: 15 }, admin, roles)
  const passkey = randomString(PASSKEY_LEN)
  const grants: RoleGrant[] = (['employee', 'manager', 'author'] as Portal[]).map((portal) => ({ propertyId, portal, tier: 'admin', personId }))
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO properties (id, name, created_at) VALUES (?, ?, ?)').bind(propertyId, b.propertyName.trim(), now),
    c.env.DB.prepare('INSERT INTO accounts (id, property_id, person_id, name, passkey_lookup, grants_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(accountId, propertyId, personId, admin.name, await hmac(c.env.PASSKEY_PEPPER, passkey), JSON.stringify(grants), now),
  ])
  return c.json({ passkey })
})

app.post('/auth/login', async (c) => {
  if (await rateLimited(c, 'login', 20)) return c.json({ error: 'Too many attempts. Wait 15 minutes and try again.' }, 429)
  const { passkey } = await c.req.json<{ passkey: string }>()
  if (typeof passkey !== 'string' || !passkey) return c.json({ error: 'That passkey did not match. Try again.' }, 401)
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE passkey_lookup = ? AND disabled = 0')
    .bind(await hmac(c.env.PASSKEY_PEPPER, normalize(passkey))).first<AccountRow>()
  if (!row) return c.json({ error: 'That passkey did not match. Try again.' }, 401)
  return c.json({ token: await createSession(c.env, row.id), account: publicAccount(row) })
})

/** A new hire asks to join a shift team; a manager approves it in Join requests. */
app.get('/join/:propertyId', async (c) => c.json((await hub(c.env, c.req.param('propertyId')).publicInfo()) ?? { error: 'Unknown property' }))
app.post('/join/:propertyId', async (c) => {
  if (await rateLimited(c, 'join', 5)) return c.json({ error: 'Too many requests' }, 429)
  const b = await c.req.json<{ name: string; jobRoleId: string; shiftId: string }>()
  if (!b.name?.trim() || b.name.length > 80) return c.json({ error: 'Your name is required' }, 400)
  const r = await hub(c.env, c.req.param('propertyId')).addJoinRequest({ id: newId('join'), name: b.name.trim(), jobRoleId: b.jobRoleId, shiftId: b.shiftId })
  return c.json(r, r.ok ? 200 : 400)
})

// ── signed in ──────────────────────────────────────────────────
app.use('/me', requireAuth); app.use('/auth/logout', requireAuth); app.use('/state', requireAuth); app.use('/action', requireAuth)
app.use('/ws', requireAuth); app.use('/photos', requireAuth); app.use('/photos/*', requireAuth); app.use('/admin/*', requireAuth)

app.get('/me', (c) => c.json({ account: publicAccount(c.get('account')) }))
app.post('/auth/logout', async (c) => {
  const token = c.req.header('Authorization')!.slice(7)
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  return c.json({ ok: true })
})
app.get('/state', async (c) => c.json(await hub(c.env, c.get('account').property_id).view(c.get('actor'))))
app.post('/action', async (c) => {
  const { action } = await c.req.json()
  if (!action || typeof action.type !== 'string') return c.json({ ok: false, error: 'Bad request' }, 400)
  const r = await hub(c.env, c.get('account').property_id).act(c.get('actor'), action)
  return c.json(r, r.ok ? 200 : 422)
})
app.get('/ws', async (c) => hub(c.env, c.get('account').property_id).fetch(c.req.raw))

app.post('/photos', async (c) => {
  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File)) return c.json({ error: 'No photo' }, 400)
  if (file.size > 8 * 1024 * 1024) return c.json({ error: 'Photo is larger than 8 MB' }, 413)
  if (!/^image\/(jpeg|png|webp|heic)$/.test(file.type)) return c.json({ error: 'Use a JPEG, PNG, WEBP or HEIC photo' }, 415)
  const key = `${c.get('account').property_id}/${newId('photo')}`
  await c.env.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { personId: c.get('account').person_id } })
  return c.json({ key })
})
app.get('/photos/*', async (c) => {
  const key = c.req.path.slice('/photos/'.length)
  const acct = c.get('account')
  if (!key.startsWith(`${acct.property_id}/`)) return c.json({ error: 'Not found' }, 404)
  const obj = await c.env.PHOTOS.get(key)
  if (!obj) return c.json({ error: 'Not found' }, 404)
  const mine = obj.customMetadata?.personId === acct.person_id
  if (!mine && !(await hub(c.env, acct.property_id).canSeePhoto(c.get('actor'), key))) return c.json({ error: 'Not found' }, 404)
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } })
})

// ── Platform foundation: accounts & access (Property admin) ────
app.use('/admin/*', requireAdmin)
app.get('/admin/accounts', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM accounts WHERE property_id = ? ORDER BY name').bind(c.get('account').property_id).all<AccountRow>()
  return c.json({ accounts: rows.results.map((r) => ({ ...publicAccount(r), disabled: !!r.disabled })) })
})
const validGrants = (g: unknown): g is { portal: Portal; tier: Tier }[] =>
  Array.isArray(g) && g.length > 0 && g.every((x) => ['employee', 'manager', 'author'].includes(x?.portal) && ['base', 'senior', 'admin'].includes(x?.tier))
    && new Set(g.map((x) => x.portal)).size === g.length

app.post('/admin/accounts', async (c) => {
  const pid = c.get('account').property_id
  const b = await c.req.json<{ personId: string; name: string; grants: { portal: Portal; tier: Tier }[] }>()
  if (!validGrants(b.grants)) return c.json({ error: 'Choose at least one portal' }, 400)
  if (!(await hub(c.env, pid).personExists(b.personId))) return c.json({ error: 'Add the person to the roster first' }, 400)
  const passkey = randomString(PASSKEY_LEN)
  const grants = b.grants.map((g) => ({ ...g, propertyId: pid, personId: b.personId }))
  try {
    await c.env.DB.prepare('INSERT INTO accounts (id, property_id, person_id, name, passkey_lookup, grants_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('acct'), pid, b.personId, b.name, await hmac(c.env.PASSKEY_PEPPER, passkey), JSON.stringify(grants), new Date().toISOString()).run()
  } catch { return c.json({ error: 'This person already has an account' }, 409) }
  return c.json({ passkey })
})
app.post('/admin/accounts/:id/grants', async (c) => {
  const b = await c.req.json<{ grants: { portal: Portal; tier: Tier }[] }>()
  if (!validGrants(b.grants)) return c.json({ error: 'Choose at least one portal' }, 400)
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ? AND property_id = ?').bind(c.req.param('id'), c.get('account').property_id).first<AccountRow>()
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.id === c.get('account').id && !b.grants.some((g) => g.tier === 'admin')) return c.json({ error: 'You cannot remove your own admin access' }, 400)
  await c.env.DB.prepare('UPDATE accounts SET grants_json = ? WHERE id = ?').bind(JSON.stringify(b.grants.map((g) => ({ ...g, propertyId: row.property_id, personId: row.person_id }))), row.id).run()
  return c.json({ ok: true })
})
app.post('/admin/accounts/:id/passkey', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM accounts WHERE id = ? AND property_id = ?').bind(c.req.param('id'), c.get('account').property_id).first<AccountRow>()
  if (!row) return c.json({ error: 'Not found' }, 404)
  const passkey = randomString(PASSKEY_LEN)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE accounts SET passkey_lookup = ? WHERE id = ?').bind(await hmac(c.env.PASSKEY_PEPPER, passkey), row.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(row.id),
  ])
  return c.json({ passkey })
})
app.post('/admin/accounts/:id/disable', async (c) => {
  const { disabled } = await c.req.json<{ disabled: boolean }>()
  if (c.req.param('id') === c.get('account').id) return c.json({ error: 'You cannot disable your own account' }, 400)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE accounts SET disabled = ? WHERE id = ? AND property_id = ?').bind(disabled ? 1 : 0, c.req.param('id'), c.get('account').property_id),
    c.env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(c.req.param('id')),
  ])
  return c.json({ ok: true })
})

app.onError((err, c) => { console.error(err); return c.json({ error: 'Something went wrong on the hotel server' }, 500) })

export default app
