// Regression: in-app navigation in the Employee portal must never leave the screen blank (opacity check, not just text).
// Run against a served build:  npm run build && npx vite preview --port 4173   then   node e2e/<file>.cjs
// Requires Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
const { chromium } = require('playwright')
const U = process.env.BASE_URL ?? 'http://localhost:4173'
;(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); let fails = 0
  await p.goto(U); await p.waitForTimeout(800); await p.keyboard.type('miseauroragrand26'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500)
  const check = async (label) => { await p.waitForTimeout(900); const t = (await p.locator('main').innerText().catch(() => '')).trim(); const vis = await p.evaluate(() => { const m = document.querySelectorAll('main'); if (m.length !== 1) return 'mains=' + m.length; let min = 1; for (let e = m[0].querySelector('h1,h2,.font-display') ?? m[0]; e; e = e.parentElement) min = Math.min(min, +getComputedStyle(e).opacity); return min }); const ok = t.length > 20 && vis === 1; if (!ok) console.log('   visibility=', vis); if (!ok) fails++; console.log(ok ? 'ok  ' : 'BLANK', label, '|', t.slice(0, 50).replace(/\n/g, ' ')) }
  await p.goto(U + '/employee'); await check('load /employee'); await p.getByRole('button', { name: 'Got it' }).click().catch(() => {}); await p.waitForTimeout(600)
  for (let i = 0; i < 3; i++) for (const n of ['Guides', 'Reports', 'Me', 'My work']) { await p.locator('aside').getByRole('link', { name: new RegExp('^' + n) }).first().click(); await check('nav ' + n) }
  await p.goto(U + '/employee'); await p.waitForTimeout(800)
  const rooms = await p.locator('main a[href*="/employee/tasks/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  for (const h of rooms) { await p.locator(`main a[href="${h}"]`).first().click(); await check('open ' + h); await p.goBack(); await check('back'); await p.waitForTimeout(400) }
  for (const r of ['Assign rooms', 'Shift cover & time off', 'Overview']) { }
  console.log('blank count:', fails); await b.close(); process.exit(fails ? 1 : 0) })()
