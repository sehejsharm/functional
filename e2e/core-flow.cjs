// Core workflow: SOP PDF → review (2 approvals) → release → assign → employee executes → send back → verify.
// Run against a served build:  npm run build && npx vite preview --port 4173   then   node e2e/<file>.cjs
// Requires Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
const { chromium } = require('playwright')
const U = process.env.BASE_URL ?? 'http://localhost:4173', OUT = process.env.OUT_DIR ?? '.', PDF = process.env.SOP_PDF
if (!PDF) { console.error('Set SOP_PDF to the path of an SOP PDF with a numbered quick-reference list (e.g. the luggage-handling SOP).'); process.exit(2) }
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  let n = 0
  const step = async (label, fn) => { n++; try { await fn(); console.log('ok  ', label) } catch (e) { await p.screenshot({ path: `${OUT}/fail-${n}.png` }); console.log('FAIL', label, '—', e.message.split('\n')[0]); await b.close(); process.exit(1) } }
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('mise-demo-hub-v1')).state)
  const session = (patch) => p.evaluate((patch) => { const s = JSON.parse(localStorage.getItem('mise-session-demo-v1')); Object.assign(s.state, patch); localStorage.setItem('mise-session-demo-v1', JSON.stringify(s)) }, patch)
  const dialog = () => p.locator('[role=dialog]').last()

  await step('sign in', async () => { await p.goto(U); await p.waitForTimeout(600); await p.keyboard.type('miseauroragrand26'); await p.keyboard.press('Enter'); await p.waitForURL(/employee/) })
  await step('author: import Trident PDF', async () => {
    await p.goto(U + '/author/new'); await p.waitForTimeout(800)
    await p.setInputFiles('input[aria-label="Upload SOP document"]', PDF)
    await p.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'Luggage Handling on Arrival'), null, { timeout: 15000 })
    const vals = await p.evaluate(() => [...document.querySelectorAll('input, select')].map((i) => i.value).filter(Boolean))
    if (!vals.includes('SOP-FO-04') || !vals.includes('10') || !vals.includes('bellman')) throw new Error('import fields ' + vals.slice(0, 8).join(' | '))
    const steps = await p.locator('li[id^="step-"]').count(); if (steps !== 11) throw new Error('steps=' + steps)
    // The checks above match the Trident luggage SOP; adjust them for another document.
  })
  await p.screenshot({ path: `${OUT}/1-import.png` })
  await step('save draft', async () => { await p.getByRole('button', { name: 'Save draft' }).click(); await p.waitForURL(/author\/edit\//) })
  await step('send for review (confirm)', async () => {
    await p.getByRole('button', { name: /Send for review/ }).first().click(); await p.waitForTimeout(400)
    await dialog().getByRole('button', { name: /Send/ }).last().click(); await p.waitForURL(/author\/reviews\//, { timeout: 8000 })
  })
  const versionUrl = p.url()
  await step('release locked at 0 approvals', async () => { await p.getByText(/needs 2 more approvals/i).first().waitFor({ timeout: 4000 }) })
  await step('author approval does not count', async () => {
    const sel = p.locator('select').filter({ has: p.locator('option', { hasText: 'Leah' }) }).first()
    const authorVal = await sel.locator('option', { hasText: 'author' }).getAttribute('value'); await sel.selectOption(authorVal)
    const ap = p.getByRole('button', { name: /^Approve/ }); if (await ap.count() && await ap.first().isEnabled()) throw new Error('author can approve')
  })
  await step('approve as Marco then Leah', async () => {
    const sel = p.locator('select').filter({ has: p.locator('option', { hasText: 'Leah' }) }).first()
    await sel.selectOption('marco'); await p.getByRole('button', { name: /^Approve/ }).click(); await p.waitForTimeout(400)
    await p.getByText(/needs 1 more approval/i).first().waitFor({ timeout: 4000 })
    await sel.selectOption('leah'); await p.getByRole('button', { name: /^Approve/ }).click(); await p.waitForTimeout(400)
  })
  await step('release with confirm modal', async () => {
    await p.getByRole('button', { name: /Release as/ }).click(); await p.waitForTimeout(400)
    await p.screenshot({ path: `${OUT}/2-release-modal.png` })
    await dialog().getByRole('button', { name: /Release/ }).last().click(); await p.waitForTimeout(800)
    const v = (await db()).sopVersions.find((x) => x.code === 'SOP-FO-04'); if (v.status !== 'published' || v.version !== '1.0') throw new Error(`${v.status} ${v.version}`)
  })
  let roomNo, personId, taskId
  await step('manager: assign SOP-FO-04 to the on-shift bellman', async () => {
    await p.goto(U + '/manager/assign-rooms'); await p.waitForTimeout(900)
    const sel = p.locator('select').filter({ has: p.locator('option', { hasText: 'SOP-FO-04' }) }).first()
    await sel.selectOption(await sel.locator('option', { hasText: 'SOP-FO-04' }).getAttribute('value')); await p.waitForTimeout(300)
    await p.getByRole('checkbox', { name: /You reviewed this exact version/ }).click()
    const radios = p.locator('[role=radiogroup][aria-label="Staff member"] [role=radio]:not([disabled])')
    const names = await radios.allInnerTexts(); if (!names.length) throw new Error('no staff'); console.log('     roster:', names.map((x) => x.split('\n')[0]))
    await radios.first().click()
    const room = p.locator('button:not([disabled])').filter({ hasText: /^\s*1\d\d/ }).first(); roomNo = (await room.innerText()).trim().slice(0, 3); await room.click()
    const start = await p.evaluate(() => new Date(Date.now() + 70000).toLocaleString('sv-SE', { timeZone: 'Asia/Colombo' }).slice(0, 16).replace(' ', 'T'))
    await p.locator('input[type=datetime-local]').first().fill(start)
    await p.getByRole('button', { name: 'Assign room' }).click(); await p.waitForTimeout(600)
    const d = await db(); const vid = d.sopVersions.find((v) => v.code === 'SOP-FO-04').id
    const t = d.tasks.find((x) => x.sopVersionId === vid)
    if (!t) throw new Error('no task created'); personId = t.personId; taskId = t.id
  })
  await p.screenshot({ path: `${OUT}/3-assigned.png` })
  console.log(`     room ${roomNo} → ${personId} (${taskId})`)
  await step('employee: gated "not open yet", then start after the gate', async () => {
    await session({ demoEmployeeId: personId })
    await p.goto(U + `/employee/tasks/${taskId}`); await p.waitForTimeout(900)
    await p.getByText(/not open yet|do not enter/i).first().waitFor({ timeout: 3000 })
    await p.waitForTimeout(72000); await p.reload(); await p.waitForTimeout(900)
    await p.getByRole('button', { name: /Start room/ }).click(); await p.waitForTimeout(500)
  })
  await step('tick all 11 steps and request verification', async () => {
    const ticks = p.locator('button[aria-label^="Step "][aria-pressed]'); const c = await ticks.count(); if (c !== 11) throw new Error('ticks=' + c)
    for (let i = 0; i < c; i++) await ticks.nth(i).click()
    await p.getByRole('button', { name: /Request independent verification/ }).click(); await p.waitForTimeout(500)
    const t = (await db()).tasks.find((x) => x.id === taskId); if (t.status !== 'awaiting_verification' || !t.completedAt) throw new Error(t.status)
  })
  await p.screenshot({ path: `${OUT}/4-awaiting.png` })
  await step('manager: send back with a reason', async () => {
    await p.goto(U + `/manager/tasks?task=${taskId}`); await p.waitForTimeout(900)
    await dialog().getByRole('button', { name: /Send back/ }).first().click(); await p.waitForTimeout(400)
    await dialog().locator('textarea').fill('Luggage rack missing in the room — please place cases on the rack.')
    await dialog().getByRole('button', { name: /Send back/ }).last().click(); await p.waitForTimeout(600)
    const t = (await db()).tasks.find((x) => x.id === taskId); if (t.status !== 'in_progress' || !t.returned) throw new Error(t.status)
  })
  await step('employee sees the reason and resubmits', async () => {
    await p.goto(U + `/employee/tasks/${taskId}`); await p.waitForTimeout(900)
    await p.getByText(/Luggage rack missing/).first().waitFor({ timeout: 3000 })
    await p.getByRole('button', { name: /Request independent verification/ }).click(); await p.waitForTimeout(500)
  })
  await step('manager: record verification', async () => {
    await p.goto(U + `/manager/tasks?task=${taskId}`); await p.waitForTimeout(900)
    await dialog().getByRole('button', { name: /Record verification|^Verify/ }).first().click(); await p.waitForTimeout(600)
    const t = (await db()).tasks.find((x) => x.id === taskId)
    if (t.status !== 'done' || !t.verifiedAt || !(t.completedAt <= t.verifiedAt)) throw new Error(JSON.stringify({ s: t.status, c: t.completedAt, v: t.verifiedAt }))
  })
  await p.screenshot({ path: `${OUT}/5-verified.png` })
  await step('employee sees the room complete', async () => { await p.goto(U + `/employee/tasks/${taskId}`); await p.waitForTimeout(800); await p.getByText(/complete|verified/i).first().waitFor({ timeout: 3000 }) })
  await step('audit trail recorded every step', async () => {
    const acts = (await db()).audit.map((a) => a.action); const need = ['sop.submitted', 'sop.review.approve', 'sop.released', 'task.assigned', 'task.started', 'task.verification_requested', 'task.returned', 'task.verified']
    const missing = need.filter((a) => !acts.includes(a)); if (missing.length) throw new Error('missing ' + missing.join(','))
  })
  console.log('page errors:', errs.length ? errs : 'none'); await b.close()
})()
