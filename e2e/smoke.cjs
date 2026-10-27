// Smoke test: every route at desktop and phone width — no crashes, console errors, blank screens or sideways scroll.
// Run against a served build:  npm run build && npx vite preview --port 4173   then   node e2e/<file>.cjs
// Requires Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
const { chromium } = require('playwright')
const OUT = process.env.OUT_DIR ?? '.', U = process.env.BASE_URL ?? 'http://localhost:4173'
const routes = ['/employee', '/employee/tasks/t-114', '/employee/guides', '/employee/guides/hk-reset', '/employee/reports', '/employee/me',
  '/manager', '/manager/tasks', '/manager/assign-rooms', '/manager/incidents', '/manager/shift-cover', '/manager/staff', '/manager/staff/maya', '/manager/notices', '/manager/sops',
  '/manager/acknowledgments', '/manager/team-progress', '/manager/sop-results', '/manager/lead/board', '/manager/lead/planner', '/manager/lead/pulse', '/manager/guided-or-standard', '/manager/join-requests', '/manager/sop-policy',
  '/author', '/author/sops/hk-reset', '/author/new', '/author/edit/hk-deep-1', '/author/reviews', '/author/reviews/hk-102-1', '/author/feedback', '/author/use-results', '/author/platform', '/screens', '/manager/nope', '/nope']
;(async () => { const b = await chromium.launch(); let bad = 0
  for (const [w, h, tag] of [[1440, 900, 'd'], [390, 844, 'm']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|fonts|unsplash/.test(m.text()) && errs.push('console: ' + m.text()))
    await p.goto(U); await p.waitForTimeout(700); await p.keyboard.type('miseauroragrand26'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500)
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('mise-session-v1')); s.state.demoTier = 'admin'; localStorage.setItem('mise-session-v1', JSON.stringify(s)) })
    for (const r of routes) {
      errs.length = 0
      await p.goto(U + r); await p.waitForTimeout(1100)
      await p.getByRole('button', { name: 'Got it' }).click({ timeout: 500 }).catch(() => {})
      const info = await p.evaluate(() => { const m = document.querySelector('main') ?? document.body; const t = m.innerText.trim(); const crashed = /couldn.t load/i.test(t); const ow = document.documentElement.scrollWidth > window.innerWidth + 2; return { len: t.length, crashed, ow, h1: (m.querySelector('h1')?.textContent ?? '').slice(0, 40) } })
      const ok = info.len > 40 && !info.crashed && !errs.length
      if (!ok || info.ow) bad++
      if (!ok || info.ow || tag === 'd') console.log(`${ok ? (info.ow ? 'OVERFLOW' : 'ok  ') : 'FAIL'} ${tag} ${r.padEnd(28)} ${info.h1} ${errs.slice(0, 2).join(' | ')}`)
      if (process.env.SCREENSHOTS) await p.screenshot({ path: `${OUT}/${tag}${r.replace(/\//g, '_').replace(/\?.*/, '')}.png` })
    }
    await p.close() }
  console.log('problems:', bad); await b.close(); process.exit(bad ? 1 : 0) })()
