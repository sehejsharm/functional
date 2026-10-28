// Live workflow against the real API, each step signed in as a different person with their own passkey:
// author imports a PDF and sends it for review → two other authors approve → release → manager assigns →
// employee does the room → manager sends it back → employee resubmits → manager verifies. State is read back from the API.
// Usage (after e2e/live-setup.cjs):  KEYS=passkeys.json SOP_PDF=sop.pdf BASE_URL=http://localhost:4174 API_URL=http://localhost:8787 node e2e/live-flow.cjs
const { chromium } = require('playwright')
const U = process.env.BASE_URL ?? 'http://localhost:4174', API = process.env.API_URL ?? 'http://localhost:8787', OUT = process.env.OUT_DIR ?? '.', PDF = process.env.SOP_PDF
const K = require(require('path').resolve(process.env.KEYS ?? 'passkeys.json'))
if (!PDF) { console.error('Set SOP_PDF (e.g. the luggage-handling SOP).'); process.exit(2) }
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  let n = 0
  const step = async (label, fn) => { n++; try { await fn(); console.log('ok  ', label) } catch (e) { await p.screenshot({ path: `${OUT}/live-fail-${n}.png` }); console.log('FAIL', label, '—', e.message.split('\n')[0]); await b.close(); process.exit(1) } }
  // Server truth, read as the admin.
  const adminToken = (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passkey: K.keys.admin }) })).json()).token
  const state = async () => (await (await fetch(`${API}/state`, { headers: { Authorization: `Bearer ${adminToken}` } })).json()).state
  const dialog = () => p.locator('[role=dialog]').last()
  const signInAs = async (who, landing) => {
    await p.goto(U); await p.waitForTimeout(400)
    await p.evaluate(() => { localStorage.removeItem('mise-session-v2') })
    await p.goto(U); await p.waitForTimeout(700)
    await p.keyboard.type(K.keys[who]); await p.keyboard.press('Enter'); await p.waitForURL(landing, { timeout: 8000 })
  }

  let versionId, taskId
  await step('author (admin) signs in with a personal passkey', () => signInAs('admin', /manager/))
  await step('author: import the PDF, save, send for review', async () => {
    await p.goto(U + '/author/new'); await p.waitForTimeout(900)
    await p.setInputFiles('input[aria-label="Upload SOP document"]', PDF)
    await p.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'Luggage Handling on Arrival'), null, { timeout: 15000 })
    await p.getByRole('button', { name: 'Save draft' }).click(); await p.waitForURL(/author\/edit\//)
    await p.getByRole('button', { name: /Send for review/ }).first().click(); await p.waitForTimeout(400)
    await dialog().getByRole('button', { name: /Send/ }).last().click(); await p.waitForURL(/author\/reviews\//, { timeout: 8000 })
    versionId = p.url().split('/').pop()
    await p.waitForTimeout(800)
    const v = (await state()).sopVersions.find((x) => x.id === versionId); if (v?.status !== 'in_review') throw new Error('server has ' + v?.status)
  })
  await step('author cannot approve their own version', async () => {
    const ap = p.getByRole('button', { name: /^Approve/ }); if (await ap.count() && await ap.first().isEnabled()) throw new Error('author can approve')
  })
  await step('reviewer 1 (Leah) approves from her own account', async () => {
    await signInAs('leah', /author/)
    await p.goto(U + `/author/reviews/${versionId}`); await p.waitForTimeout(900)
    await p.getByRole('button', { name: /^Approve/ }).click(); await p.waitForTimeout(800)
    await p.getByText(/needs 1 more approval/i).first().waitFor({ timeout: 4000 })
    if (await p.getByRole('button', { name: /Release as/ }).isEnabled().catch(() => false)) throw new Error('release enabled at 1 approval')
  })
  await step('reviewer 2 (Marco) approves and releases', async () => {
    await signInAs('marco', /author/)
    await p.goto(U + `/author/reviews/${versionId}`); await p.waitForTimeout(900)
    await p.getByRole('button', { name: /^Approve/ }).click(); await p.waitForTimeout(800)
    await p.getByRole('button', { name: /Release as/ }).click(); await p.waitForTimeout(400)
    await dialog().getByRole('button', { name: /Release/ }).last().click(); await p.waitForTimeout(1200)
    const v = (await state()).sopVersions.find((x) => x.id === versionId); if (v.status !== 'published') throw new Error('server has ' + v.status)
  })
  await step('manager (Elena) assigns it to Arjun', async () => {
    await signInAs('elena', /manager/)
    await p.goto(U + '/manager/assign-rooms'); await p.waitForTimeout(1000)
    const sel = p.locator('select').filter({ has: p.locator('option', { hasText: 'SOP-FO-04' }) }).first()
    await sel.selectOption(await sel.locator('option', { hasText: 'SOP-FO-04' }).getAttribute('value')); await p.waitForTimeout(300)
    await p.getByRole('checkbox', { name: /You reviewed this exact version/ }).click()
    await p.locator('[role=radiogroup][aria-label="Staff member"] [role=radio]').filter({ hasText: 'Arjun' }).first().click()
    await p.locator('button:not([disabled])').filter({ hasText: /^\s*1\d\d/ }).first().click()
    const start = await p.evaluate(() => new Date(Date.now() + 70000).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 16).replace(' ', 'T'))
    await p.locator('input[type=datetime-local]').first().fill(start)
    await p.getByRole('button', { name: 'Assign room' }).click(); await p.waitForTimeout(1200)
    const t = (await state()).tasks.find((x) => x.sopVersionId === versionId); if (!t) throw new Error('server has no task'); taskId = t.id
    if (t.personId !== K.people.arjun) throw new Error('assigned to ' + t.personId)
  })
  await step('employee (Arjun) sees "do not enter yet", then starts after the gate', async () => {
    await signInAs('arjun', /employee/)
    await p.goto(U + `/employee/tasks/${taskId}`); await p.waitForTimeout(1000)
    await p.getByText(/not open yet|do not enter/i).first().waitFor({ timeout: 4000 })
    await p.waitForTimeout(72000); await p.reload(); await p.waitForTimeout(1200)
    await p.getByRole('button', { name: /Start room/ }).click(); await p.waitForTimeout(800)
  })
  await step('employee ticks all 11 steps and asks for verification', async () => {
    const ticks = p.locator('button[aria-label^="Step "][aria-pressed]'); const c = await ticks.count(); if (c !== 11) throw new Error('ticks=' + c)
    for (let i = 0; i < c; i++) { await ticks.nth(i).click(); await p.waitForTimeout(60) }
    await p.getByRole('button', { name: /Request independent verification/ }).click(); await p.waitForTimeout(1500)
    const t = (await state()).tasks.find((x) => x.id === taskId); if (t.status !== 'awaiting_verification' || t.doneStepIds.length !== 11) throw new Error(`server: ${t.status} ${t.doneStepIds.length}`)
  })
  await step('manager (Elena) sends it back with a reason', async () => {
    await signInAs('elena', /manager/)
    await p.goto(U + `/manager/tasks?task=${taskId}`); await p.waitForTimeout(1000)
    await dialog().getByRole('button', { name: /Send back/ }).first().click(); await p.waitForTimeout(400)
    await dialog().locator('textarea').fill('Luggage rack missing in the room — please place cases on the rack.')
    await dialog().getByRole('button', { name: /Send back/ }).last().click(); await p.waitForTimeout(1200)
    const t = (await state()).tasks.find((x) => x.id === taskId); if (t.status !== 'in_progress' || !t.returned) throw new Error('server: ' + t.status)
  })
  await step('employee sees the reason and resubmits', async () => {
    await signInAs('arjun', /employee/)
    await p.goto(U + `/employee/tasks/${taskId}`); await p.waitForTimeout(1000)
    await p.getByText(/Luggage rack missing/).first().waitFor({ timeout: 4000 })
    await p.getByRole('button', { name: /Request independent verification/ }).click(); await p.waitForTimeout(1200)
  })
  await step('manager verifies; server records who and when', async () => {
    await signInAs('elena', /manager/)
    await p.goto(U + `/manager/tasks?task=${taskId}`); await p.waitForTimeout(1000)
    await dialog().getByRole('button', { name: /Record verification|^Verify/ }).first().click(); await p.waitForTimeout(1200)
    const t = (await state()).tasks.find((x) => x.id === taskId)
    if (t.status !== 'done' || t.verifiedById !== K.people.elena || !(t.completedAt <= t.verifiedAt)) throw new Error(JSON.stringify({ s: t.status, by: t.verifiedById, c: t.completedAt, v: t.verifiedAt }))
  })
  await step('server audit trail names each person', async () => {
    const s = await state(); const by = (a) => s.audit.find((x) => x.action === a)?.actorId
    const want = { 'sop.released': K.people.marco, 'task.assigned': K.people.elena, 'task.started': K.people.arjun, 'task.returned': K.people.elena, 'task.verified': K.people.elena }
    const wrong = Object.entries(want).filter(([a, id]) => by(a) !== id); if (wrong.length) throw new Error('wrong actors: ' + wrong.map(([a]) => a).join(','))
    const approvers = new Set(s.audit.filter((x) => x.action === 'sop.review.approve').map((x) => x.actorId)); if (!approvers.has(K.people.leah) || !approvers.has(K.people.marco)) throw new Error('approvals')
  })
  console.log('page errors:', errs.length ? errs : 'none'); await b.close()
})()
