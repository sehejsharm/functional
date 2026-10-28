// Live-mode fixture: sets up a fresh Mise API (e.g. `npm run dev:api`) with a small hotel through the public API —
// first-run setup, job roles, people, rooms, shifts, and personal passkeys — and prints the passkeys as JSON.
// Usage:  API_URL=http://localhost:8787 SETUP_TOKEN=... node e2e/live-setup.cjs > passkeys.json
const API = (process.env.API_URL ?? 'http://localhost:8787').replace(/\/$/, '')
const SETUP_TOKEN = process.env.SETUP_TOKEN ?? 'local-setup-token'
const rnd = () => Math.random().toString(16).slice(2, 10)

async function call(path, { token, json, method } = {}) {
  const r = await fetch(API + path, { method: method ?? (json ? 'POST' : 'GET'), headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: json ? JSON.stringify(json) : undefined })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body.ok === false) throw new Error(`${path}: ${r.status} ${body.error ?? ''}`)
  return body
}

;(async () => {
  const { passkey: admin } = await call('/setup', { json: { setupToken: SETUP_TOKEN, propertyName: 'Trident Mumbai', city: 'Mumbai', timeZone: 'Asia/Kolkata', adminName: 'Asha Kapoor' } })
  const { token } = await call('/auth/login', { json: { passkey: admin } })
  const act = (action) => call('/action', { token, json: { action } })
  const { state } = await call('/state', { token })
  const [attendant, supervisor] = state.jobRoles
  const bell = { id: `role-${rnd()}`, propertyId: '', name: 'Bellman / Porter', team: 'Front office' }
  await act({ type: 'upsertJobRole', role: bell })

  const person = (name, jobRoleId, title) => ({ id: `person-${rnd()}`, propertyId: '', name, initials: '', jobRoleId, title, catalogue: ['pilot', 'whole'] })
  const people = {
    arjun: person('Arjun Mehta', bell.id, 'Bellman'), farah: person('Farah Sheikh', bell.id, 'Bellman'), maya: person('Maya Fernando', attendant.id, 'Room attendant'),
    elena: person('Elena Rossi', supervisor.id, 'Front office shift manager'), leah: person('Leah Cohen', supervisor.id, 'Standards reviewer'), marco: person('Marco Bianchi', supervisor.id, 'Standards reviewer'),
  }
  for (const p of Object.values(people)) await act({ type: 'upsertPerson', person: p })

  for (const n of ['101', '102', '103', '104', '105', '201', '202', '203']) await act({ type: 'upsertRoom', room: { id: `room-${rnd()}`, propertyId: '', number: n, floor: Number(n[0]), wing: 'Tower', type: 'Deluxe King', occupancy: 'arrival' } })
  // Every shift has the bell desk on it, so work can be assigned whatever time the test runs.
  const shifts = [['Morning', '06:00', '14:00'], ['Afternoon', '14:00', '22:00'], ['Night', '22:00', '06:00']]
  for (const [name, start, end] of shifts) {
    await act({ type: 'upsertShift', shift: { id: `shift-${rnd()}`, propertyId: '', name, start, end, staffTarget: 3, team: 'Front office & housekeeping', memberIds: [people.arjun.id, people.farah.id, people.maya.id] } })
  }

  const account = async (p, grants) => (await call('/admin/accounts', { token, json: { personId: p.id, name: p.name, grants } })).passkey
  const keys = {
    admin,
    arjun: await account(people.arjun, [{ portal: 'employee', tier: 'base' }]),
    maya: await account(people.maya, [{ portal: 'employee', tier: 'base' }]),
    elena: await account(people.elena, [{ portal: 'manager', tier: 'base' }]),
    leah: await account(people.leah, [{ portal: 'author', tier: 'base' }]),
    marco: await account(people.marco, [{ portal: 'author', tier: 'base' }]),
  }
  console.log(JSON.stringify({ keys, people: Object.fromEntries(Object.entries(people).map(([k, p]) => [k, p.id])), propertyId: state.property.id }, null, 2))
})().catch((e) => { console.error(e.message); process.exit(1) })
