import {
  Activity, BadgeCheck, Database, Download, FileClock, GitBranch, KeyRound, Layers, Lock, MessageSquare, Pin, PlayCircle, RotateCcw, ScrollText, ShieldCheck, Timer, Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bars, LineChart } from '@/components/Charts'
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, PageHeader, Select, StatCard, Tabs, type Column } from '@/components/ui'
import { byDay, durationHistogram, stats } from '@/lib/analytics'
import { downloadCsv } from '@/lib/csv'
import { APPROVALS_REQUIRED, byId, useDB } from '@/lib/db'
import { tierLabel } from '@/lib/permissions'
import { fDate, fDateTime, hotelDateKey, minutesBetween } from '@/lib/time'
import { confirm, toast } from '@/lib/toast'
import type { AuditEntry, SopVersion, Tier } from '@/lib/types'
import { relTime, usePersona } from '@/shell/PortalShell'
import { AREA_LABEL, ackRate, auditArea, humanAction, humanDetail, sopRows, useRevisionLinks, versionsOf, type AuditArea } from './actions'
import { PersonChip, VersionStatusBadge, VersionTag } from './components'

const DAY = 86_400_000

// ── Use & results (senior) ───────────────────────────────────────────────────

export function UseResults() {
  const db = useDB()
  const rows = useMemo(() => sopRows(db), [db])
  const withTasks = rows.filter((r) => db.tasks.some((t) => versionsOf(db, r.sopId).some((v) => v.id === t.sopVersionId)))
  const options = [...withTasks, ...rows.filter((r) => r.current && !withTasks.includes(r))]
  const [sopId, setSopId] = useState(options.find((r) => r.sopId === 'hk-reset')?.sopId ?? options[0]?.sopId ?? '')
  const row = rows.find((r) => r.sopId === sopId)
  const versions = versionsOf(db, sopId).filter((v) => v.status === 'published' || v.status === 'superseded')
  const vids = new Set(versions.map((v) => v.id))
  const now = Date.now()
  const all = db.tasks.filter((t) => vids.has(t.sopVersionId) && t.status !== 'cancelled')
  const recent = all.filter((t) => Date.parse(t.start) > now - 14 * DAY && Date.parse(t.start) <= now)
  const st = stats(recent, db.sopVersions, now)
  const done = recent.filter((t) => t.status === 'done' && t.startedAt && t.completedAt)
  const avgMin = done.length ? Math.round((done.reduce((a, t) => a + minutesBetween(t.startedAt!, t.completedAt!), 0) / done.length) * 10) / 10 : null
  const daily = byDay(all, db.sopVersions, 14, now)
  const perDay = Array.from({ length: 14 }, (_, i) => { const k = hotelDateKey(now - (14 - i) * DAY); return all.filter((t) => hotelDateKey(t.start) === k).length })
  const target = row?.current?.timeTargetMin ?? versions[0]?.timeTargetMin ?? 0
  const hist = durationHistogram(done)
  const openFb = db.feedback.filter((f) => vids.has(f.sopVersionId) && f.status === 'open').length

  type Perf = { v: SopVersion; n: number; onTime: number; avg: number | null; delta: number; pass: number; ack: number | null }
  const perf: Perf[] = versions.map((v) => {
    const ts = db.tasks.filter((t) => t.sopVersionId === v.id && t.status !== 'cancelled')
    const s = stats(ts, db.sopVersions, now)
    const d = ts.filter((t) => t.status === 'done' && t.startedAt && t.completedAt)
    return { v, n: ts.length, onTime: s.onTimePct, avg: d.length ? Math.round((d.reduce((a, t) => a + minutesBetween(t.startedAt!, t.completedAt!), 0) / d.length) * 10) / 10 : null, delta: s.avgDelta, pass: s.verifyPassPct, ack: ackRate(db, v).pct }
  })
  const columns: Column<Perf>[] = [
    { key: 'v', header: 'Version', sort: (p) => p.v.createdAt, csv: (p) => p.v.version, cell: (p) => <span className="inline-flex items-center gap-2"><VersionTag label={p.v.version} /><VersionStatusBadge status={p.v.status} /></span> },
    { key: 'live', header: 'Live from', sort: (p) => p.v.publishedAt, csv: (p) => (p.v.publishedAt ? fDate(p.v.publishedAt) : ''), hideOnMobile: true, cell: (p) => (p.v.publishedAt ? fDate(p.v.publishedAt) : '—') },
    { key: 'n', header: 'Tasks', sort: (p) => p.n, align: 'right', cell: (p) => p.n },
    { key: 'onTime', header: 'On time', sort: (p) => p.onTime, csv: (p) => `${p.onTime}%`, align: 'right', cell: (p) => (p.n ? `${p.onTime}%` : '—') },
    { key: 'avg', header: 'Avg minutes', sort: (p) => p.avg, align: 'right', hideOnMobile: true, cell: (p) => (p.avg != null ? <span>{p.avg} <span className="text-muted">/ {p.v.timeTargetMin}</span></span> : '—') },
    { key: 'delta', header: 'vs target', sort: (p) => p.delta, csv: (p) => p.delta, align: 'right', hideOnMobile: true, cell: (p) => (p.n ? <span className={p.delta > 0 ? 'text-danger' : 'text-ok'}>{p.delta > 0 ? '+' : ''}{p.delta} min</span> : '—') },
    { key: 'pass', header: 'Verified', sort: (p) => p.pass, csv: (p) => `${p.pass}%`, align: 'right', hideOnMobile: true, cell: (p) => (p.n ? `${p.pass}%` : '—') },
    { key: 'ack', header: 'Acknowledged', sort: (p) => p.ack ?? -1, csv: (p) => (p.ack == null ? '' : `${p.ack}%`), align: 'right', cell: (p) => (p.ack == null ? '—' : `${p.ack}%`) },
  ]
  const exportDaily = () => downloadCsv(`${row?.code ?? 'sop'}-daily-14d.csv`, [['Date', 'Tasks finished', 'On time %', 'Avg minutes vs target'], ...daily.map((d) => [d.key, d.completed, d.onTimePct, d.avgDelta])])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Insights" title="Use & results" description="Is the SOP working on the floor? Volume, timing and verification for each version, from real task records."
        actions={<>
          <Select aria-label="SOP" className="h-9 w-full py-1.5 sm:w-80" value={sopId} onChange={(e) => setSopId(e.target.value)}>
            {options.map((r) => <option key={r.sopId} value={r.sopId}>{r.code} · {r.title}</option>)}
          </Select>
          <Button icon={Download} onClick={exportDaily} disabled={!all.length}>Export</Button>
        </>} />
      {!all.length ? <Card><EmptyState icon={Activity} title="No task history for this SOP yet" description="Results appear once managers assign it and staff complete rooms with it." /></Card> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="Tasks · 14 days" value={recent.length} icon={PlayCircle} trend={perDay} />
          <StatCard label="On time" value={st.onTimePct} unit="%" icon={Timer} hint={`${done.length} finished in 14 days`} />
          <StatCard label="Avg duration" value={avgMin ?? '—'} unit={avgMin != null ? 'min' : undefined} icon={FileClock} hint={`target ${target} min`} />
          <StatCard label="Verification pass" value={st.verifyPassPct} unit="%" icon={BadgeCheck} hint="first time" />
          <StatCard label="Acknowledged" value={row?.ack.pct ?? '—'} unit={row?.ack.pct != null ? '%' : undefined} icon={ShieldCheck} hint={row?.current ? `${row.ack.acked} of ${row.ack.audience} staff` : undefined} />
          <StatCard label="Open feedback" value={openFb} icon={MessageSquare} to="/author/feedback" />
        </div>
        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="On time, per day" description="Share of finished tasks completed within the time target · last 14 days" />
            <div className="p-5"><LineChart label="On-time percentage per day" points={daily.map((d) => ({ x: d.key, y: d.onTimePct }))} max={100} /></div>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="How long it really takes" description={`Finished tasks by duration, 3-minute buckets · amber is over the ${target}-minute target`} />
            <div className="p-5">{hist.length ? <Bars data={hist.map(([k, c]) => [k, c] as [number, number])} unit="m" label="Duration histogram" highlight={(k) => Number(k) >= target} height={190} /> : <p className="text-sm text-muted">No finished tasks in the last 14 days.</p>}</div>
          </Card>
        </div>
        <div>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Version performance</h2>
          <DataTable rows={perf} columns={columns} rowKey={(p) => p.v.id} initialSort={{ key: 'v', dir: 'desc' }} exportName={`${row?.code ?? 'sop'}-version-performance`} caption="Version performance" />
        </div>
      </>}
    </div>
  )
}

// ── Platform & audit (admin) ─────────────────────────────────────────────────

type PTab = 'audit' | 'roles' | 'policy' | 'data'

export function PlatformFoundation() {
  const db = useDB()
  const [tab, setTab] = useState<PTab>('audit')
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Platform & audit" description={`How Mise is set up at ${db.properties[0]?.name ?? 'this property'}, and the permanent record of every change.`}>
        <Tabs value={tab} onChange={setTab} items={[{ id: 'audit', label: 'Audit log', count: db.audit.length }, { id: 'roles', label: 'Roles & access' }, { id: 'policy', label: 'Release policy' }, { id: 'data', label: 'Data' }]} />
      </PageHeader>
      {tab === 'audit' && <AuditLog />}
      {tab === 'roles' && <Roles />}
      {tab === 'policy' && <Policy />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}

type Row = AuditEntry & { area: AuditArea; what: string; detailText: string; actor: string }

function AuditLog() {
  const db = useDB()
  const [area, setArea] = useState<'all' | AuditArea>('all')
  const [actor, setActor] = useState('all')
  const rows: Row[] = useMemo(() => db.audit.map((a) => ({ ...a, area: auditArea(a.action), what: humanAction(a.action), detailText: humanDetail(db, a), actor: byId(db.people, a.actorId)?.name ?? a.actorId })), [db])
  const actors = [...new Set(rows.map((r) => r.actorId))].map((id) => ({ id, name: byId(db.people, id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name))
  const visible = rows.filter((r) => (area === 'all' || r.area === area) && (actor === 'all' || r.actorId === actor))
  const columns: Column<Row>[] = [
    { key: 'at', header: 'Time', sort: (r) => r.at, csv: (r) => fDateTime(r.at), width: '170px', cell: (r) => <div className="whitespace-nowrap"><div className="text-sm text-ink">{fDateTime(r.at)}</div><div className="text-xs text-muted">{relTime(r.at)}</div></div> },
    { key: 'actor', header: 'Actor', sort: (r) => r.actor, csv: (r) => r.actor, cell: (r) => <PersonChip id={r.actorId} size={26} sub={byId(db.people, r.actorId)?.title} /> },
    { key: 'action', header: 'Action', sort: (r) => r.what, csv: (r) => r.action,
      cell: (r) => <div><div className="text-sm font-medium text-ink">{r.what}</div><code className="font-mono text-[11px] text-muted">{r.action}</code></div> },
    { key: 'area', header: 'Area', sort: (r) => r.area, csv: (r) => AREA_LABEL[r.area], hideOnMobile: true, cell: (r) => <Badge tone={r.area === 'sop' ? 'brand' : r.area === 'issue' ? 'warning' : r.area === 'task' ? 'info' : 'neutral'}>{AREA_LABEL[r.area]}</Badge> },
    { key: 'detail', header: 'Detail', csv: (r) => r.detailText, hideOnMobile: true, cell: (r) => <span className="line-clamp-2 max-w-md text-sm text-ink-2" title={r.detail}>{r.detailText}</span> },
  ]
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-ink-2"><ScrollText size={15} className="text-muted" /> Append-only: entries can be filtered and exported, never edited or deleted. Times are hotel time.</p>
      <DataTable rows={visible} columns={columns} rowKey={(r) => r.id} search={(r) => `${r.what} ${r.action} ${r.detailText} ${r.detail} ${r.actor}`} searchPlaceholder="Search actions, people, SOP codes"
        initialSort={{ key: 'at', dir: 'desc' }} pageSize={15} exportName="mise-audit-log" caption="Audit log"
        filters={<>
          <Select aria-label="Area" className="h-9 w-full py-1.5 sm:w-40" value={area} onChange={(e) => setArea(e.target.value as 'all' | AuditArea)}>
            <option value="all">All areas</option>{(Object.keys(AREA_LABEL) as AuditArea[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </Select>
          <Select aria-label="Actor" className="h-9 w-full py-1.5 sm:w-48" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="all">Everyone</option>{actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </>}
        empty={<EmptyState compact icon={ScrollText} title="No entries match" description="Try another area, person or search." />} />
    </div>
  )
}

const TIERS: { tier: Tier; can: string[] }[] = [
  { tier: 'base', can: ['Employee: their rooms, guides, reports', 'Manager: assign work, verify rooms, incidents, cover, notices', 'Author: write SOPs, send for review, act on feedback'] },
  { tier: 'senior', can: ['Everything a shift manager can do', 'Insights: acknowledgment ledger, team progress, SOP results, use & results', 'Lead operations: property board, shift planner, operations pulse'] },
  { tier: 'admin', can: ['Everything a senior manager can do', 'Platform & audit: audit log, roles, release policy', 'Demo data reset'] },
]

function Roles() {
  const db = useDB()
  const { grant } = usePersona('author')
  type R = { id: string; name: string; team: string; total: number; active: number; leave: number; sops: number }
  const rows: R[] = db.jobRoles.map((r) => {
    const ppl = db.people.filter((p) => p.jobRoleId === r.id)
    return { id: r.id, name: r.name, team: r.team, total: ppl.length, active: ppl.filter((p) => p.status !== 'on_leave' && p.status !== 'inactive').length, leave: ppl.filter((p) => p.status === 'on_leave').length,
      sops: db.sops.filter((s) => !s.retiredAt && s.currentVersionId && byId(db.sopVersions, s.currentVersionId)?.jobRoleId === r.id).length }
  })
  const columns: Column<R>[] = [
    { key: 'name', header: 'Job role', sort: (r) => r.name, cell: (r) => <span className="font-medium text-ink">{r.name}</span> },
    { key: 'team', header: 'Team', sort: (r) => r.team, cell: (r) => <span className="text-ink-2">{r.team}</span> },
    { key: 'total', header: 'Headcount', sort: (r) => r.total, align: 'right', cell: (r) => r.total },
    { key: 'active', header: 'Active', sort: (r) => r.active, align: 'right', hideOnMobile: true, cell: (r) => r.active },
    { key: 'leave', header: 'On leave', sort: (r) => r.leave, align: 'right', hideOnMobile: true, cell: (r) => r.leave || <span className="text-muted">—</span> },
    { key: 'sops', header: 'Live SOPs', sort: (r) => r.sops, align: 'right', cell: (r) => r.sops || <span className="text-muted">—</span> },
  ]
  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-3"><DataTable rows={rows} columns={columns} rowKey={(r) => r.id} initialSort={{ key: 'team', dir: 'asc' }} exportName="mise-job-roles" caption="Job roles" /></div>
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader icon={KeyRound} title="Access tiers" description="Each portal grant carries a tier. Higher tiers include everything below them." />
          <ol className="divide-y divide-line">
            {TIERS.map((t, i) => (
              <li key={t.tier} className="flex gap-3 px-5 py-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest-50 text-xs font-semibold text-forest-800">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold text-ink">{tierLabel[t.tier]}</span>{grant?.tier === t.tier && <Badge tone="gold">You</Badge>}</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-ink-2">{t.can.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader icon={Users} title="Portal grants" description="Who the shared demo account signs in as, per portal" />
          <ul className="divide-y divide-line">
            {db.accounts.flatMap((a) => a.grants).map((g) => (
              <li key={g.portal} className="flex items-center justify-between gap-3 px-5 py-3">
                <PersonChip id={g.personId} sub={`${g.portal[0].toUpperCase()}${g.portal.slice(1)} portal`} />
                <Badge>{tierLabel[g.tier]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Rule({ icon: I, title, children }: { icon: typeof Lock; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-cell bg-forest-50 text-forest-700"><I size={15} /></span>
      <div><div className="text-sm font-semibold text-ink">{title}</div><p className="mt-0.5 text-sm text-ink-2">{children}</p></div>
    </li>
  )
}

function Policy() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader icon={BadgeCheck} title="Approvals" description="Enforced for every SOP at this property" />
        <div className="space-y-5 p-5">
          <div className="flex items-center gap-4 rounded-cell bg-forest-50 p-4">
            <span className="text-5xl font-semibold tabular text-forest-900">{APPROVALS_REQUIRED}</span>
            <span className="text-sm text-ink-2">independent approvals are required before a version can be released.</span>
          </div>
          <ul className="space-y-4">
            <Rule icon={Lock} title="No self-approval">The author of a version can never approve it, even if they hold a reviewer role.</Rule>
            <Rule icon={MessageSquare} title="Changes requested">Sends the version back to its author. Resubmitting clears earlier approvals, so reviewers approve the final wording.</Rule>
            <Rule icon={ShieldCheck} title="Rejection is final">A rejected version can’t be released. The author starts a new revision instead.</Rule>
            <Rule icon={Activity} title="Release is a separate, recorded step">Approval alone changes nothing on the floor. Someone has to release the version; the time and person are written to the audit log.</Rule>
          </ul>
        </div>
      </Card>
      <Card>
        <CardHeader icon={GitBranch} title="Versioning" description="How release numbers are chosen" />
        <div className="space-y-5 p-5">
          <ul className="space-y-4">
            <Rule icon={Layers} title="Structural change → next major (3.0 → 4.0)">When the number of steps changes, the time target changes, or a step gains or loses an independent check.</Rule>
            <Rule icon={ScrollText} title="Wording change → next minor (3.0 → 3.1)">Same steps, checks and time target — only instructions, guest-care detail, photos or icons changed.</Rule>
            <Rule icon={Pin} title="Version pinning">Every task is pinned to the exact version it was assigned with. A release never changes a checklist mid-room; new assignments get the new version.</Rule>
            <Rule icon={FileClock} title="One open revision per SOP">While a revision is in review, another can’t be started. Drafts are private to their author until sent.</Rule>
            <Rule icon={RotateCcw} title="Retire, never delete">Retired SOPs can’t be assigned but keep their versions, results and audit history. They can be restored.</Rule>
          </ul>
        </div>
      </Card>
    </div>
  )
}

function DataTab() {
  const db = useDB()
  const counts: [string, number][] = [
    ['SOPs', db.sops.length], ['SOP versions', db.sopVersions.length], ['Tasks', db.tasks.length], ['Incidents', db.issues.length],
    ['Staff', db.people.length], ['Rooms', db.rooms.length], ['Feedback', db.feedback.length], ['Audit entries', db.audit.length],
  ]
  const onReset = async () => {
    const ok = await confirm({ title: 'Reset all demo data?', tone: 'danger', confirmLabel: 'Reset demo data', requireText: 'RESET',
      body: 'Every portal goes back to this morning’s seed: drafts, reviews, releases, tasks, incidents and the audit log are replaced. Everyone using the shared demo sees the reset.' })
    if (!ok) return
    db.reset()
    useRevisionLinks.setState({ byDraft: {} })
    toast.success('Demo data reset', { description: 'All portals are back to the seeded state for today.' })
  }
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader icon={Database} title="What’s stored" description="Live record counts for this property" />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {counts.map(([k, n]) => <div key={k} className="rounded-cell border border-line bg-surface-2 px-3 py-3"><div className="text-2xl font-semibold tabular text-ink">{n}</div><div className="text-xs text-muted">{k}</div></div>)}
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">Demo build: data lives in this browser and syncs between open tabs. It re-seeds automatically at the start of each hotel day.</p>
      </Card>
      <Card className="border-danger/30">
        <CardHeader icon={RotateCcw} title="Reset demo data" description="Start the demo again from a clean slate" />
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-2">Restores the seeded SOPs, staff, rooms, 14 days of task history and the audit log. This can’t be undone.</p>
          <Button variant="danger" icon={RotateCcw} onClick={onReset}>Reset demo data</Button>
        </div>
      </Card>
    </div>
  )
}
