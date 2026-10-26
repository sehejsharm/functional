import { BarChart3, BellRing, CalendarCheck, CheckCircle2, ClipboardList, Clock, Gauge, Mail, Megaphone, Phone, ShieldCheck, Timer, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bars, HBars, LineChart } from '@/components/Charts'
import {
  Avatar, Badge, Button, Card, CardHeader, DataTable, EmptyState, PageHeader, Section, Segmented, Select, StatCard, type Column,
} from '@/components/ui'
import { stats, type Stats } from '@/lib/analytics'
import { byId, useDB } from '@/lib/db'
import { useBreadcrumb } from '@/lib/crumbs'
import { useNow } from '@/lib/hooks'
import { fDate, fLongDate, fTime, hotelDateKey, minutesBetween } from '@/lib/time'
import { toast } from '@/lib/toast'
import type { Person, Task } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { sendAckReminder } from './actions'
import { Callout, IssueStatusBadge, SeverityBadge, TaskStatusBadge, useLookups } from './components'
import { DAY, ackCompliance, dayLabel, fWindow, offOn, taskTiming, verifyPass, versionsForRole } from './model'
import { STAFF_STATUS, type StaffStatus } from './Staff'

type Period = '7' | '14'

function usePeriod(p: Period) {
  const now = useNow(60_000)
  const { tasks, sopVersions, audit } = useDB()
  return useMemo(() => {
    const n = Number(p)
    // Whole hotel days: the period is today and the n-1 days before it; the comparison is the n days before that.
    const from = hotelDateKey(now - (n - 1) * DAY), prevFrom = hotelDateKey(now - (2 * n - 1) * DAY), today = hotelDateKey(now)
    const cur = tasks.filter((t) => { const k = hotelDateKey(t.start); return k >= from && k <= today })
    const prev = tasks.filter((t) => { const k = hotelDateKey(t.start); return k >= prevFrom && k < from })
    // Charts plot completed days only — today is still running.
    const keys = Array.from({ length: n }, (_, i) => hotelDateKey(now - (n - i) * DAY))
    const day = (k: string) => tasks.filter((t) => hotelDateKey(t.start) === k)
    const window3 = (k: string) => { const i = Date.parse(`${k}T12:00:00Z`); const ks = [0, 1, 2].map((d) => new Date(i - d * DAY).toISOString().slice(0, 10)); return tasks.filter((t) => ks.includes(hotelDateKey(t.start))) }
    return { n, now, cur, prev, keys, day, window3, versions: sopVersions, audit }
  }, [p, tasks, sopVersions, audit, now])
}

const delta = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b)
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

/** Finish time against the SOP target, bucketed in 3-minute steps (positive = over target). */
function targetHistogram(tasks: Task[], target: (t: Task) => number): [string, number][] {
  const m = new Map<number, number>()
  tasks.filter((t) => t.status === 'done' && t.startedAt && t.completedAt).forEach((t) => {
    const b = Math.ceil((minutesBetween(t.startedAt!, t.completedAt!) - target(t)) / 3) * 3
    m.set(b, (m.get(b) ?? 0) + 1)
  })
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k <= 0 ? String(k) : `+${k}`, v])
}

function PeriodSwitch({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return <Segmented value={value} onChange={onChange} items={[{ id: '7', label: 'Last 7 days' }, { id: '14', label: 'Last 14 days' }]} />
}

// ── Team progress ──────────────────────────────────────────────────────────

interface PersonRow { p: Person; s: Stats; vp: number | null; incidents: number }

export function TeamProgress() {
  const nav = useNavigate()
  const [period, setPeriod] = useState<Period>('7')
  const P = usePeriod(period)
  const { people, issues } = useDB()
  const s = stats(P.cur, P.versions, P.now), sp = stats(P.prev, P.versions, P.now)
  const vp = verifyPass(P.cur, P.audit), vpp = verifyPass(P.prev, P.audit)
  const hasPrev = sp.completed > 0
  const target = (t: Task) => byId(P.versions, t.sopVersionId)?.timeTargetMin ?? 27
  const series = [
    { name: 'On-time %', points: P.keys.map((k) => ({ x: dayLabel(k), y: stats(P.day(k), P.versions, P.now).onTimePct })) },
    { name: 'Verification pass %', points: P.keys.map((k) => ({ x: dayLabel(k), y: verifyPass(P.day(k), P.audit).pct ?? 0 })) },
  ]
  const rows: PersonRow[] = people.filter((p) => P.cur.some((t) => t.personId === p.id)).map((p) => {
    const mine = P.cur.filter((t) => t.personId === p.id)
    return { p, s: stats(mine, P.versions, P.now), vp: verifyPass(mine, P.audit).pct, incidents: issues.filter((i) => i.reportedById === p.id && Date.parse(i.at) > P.now - P.n * DAY).length }
  })
  const columns: Column<PersonRow>[] = [
    { key: 'name', header: 'Staff member', sort: (r) => r.p.name, csv: (r) => r.p.name, cell: (r) => <span className="flex items-center gap-2.5 whitespace-nowrap"><Avatar name={r.p.name} size={26} /><span className="text-sm font-medium text-ink">{r.p.name}</span></span> },
    { key: 'done', header: 'Completed', align: 'right', sort: (r) => r.s.completed, csv: (r) => r.s.completed, cell: (r) => r.s.completed },
    { key: 'ontime', header: 'On-time', align: 'right', sort: (r) => r.s.onTimePct, csv: (r) => r.s.onTimePct, cell: (r) => <Badge tone={r.s.onTimePct >= 70 ? 'success' : r.s.onTimePct >= 45 ? 'warning' : 'danger'}>{r.s.onTimePct}%</Badge> },
    { key: 'avg', header: 'Avg vs target', align: 'right', hideOnMobile: true, sort: (r) => r.s.avgDelta, csv: (r) => r.s.avgDelta, cell: (r) => <span className={r.s.avgDelta > 0 ? 'text-danger' : 'text-ok'}>{signed(r.s.avgDelta)} min</span> },
    { key: 'vp', header: 'Verified first time', align: 'right', hideOnMobile: true, sort: (r) => r.vp ?? -1, csv: (r) => r.vp ?? '', cell: (r) => (r.vp == null ? <span className="text-muted">—</span> : `${r.vp}%`) },
    { key: 'inc', header: 'Incidents', align: 'right', hideOnMobile: true, sort: (r) => r.incidents, csv: (r) => r.incidents, cell: (r) => r.incidents },
  ]
  return (
    <div className="space-y-6">
      <PageHeader title="Team progress" description="Are rooms finishing within the time the standard sets, and passing the independent check first time?"
        meta={<span>Compared with the {P.n} days before · hotel time</span>} actions={<PeriodSwitch value={period} onChange={setPeriod} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On-time completion" value={s.onTimePct} unit="%" icon={Clock} delta={hasPrev ? s.onTimePct - sp.onTimePct : null} deltaLabel={`vs prior ${P.n} days`} hint={!hasPrev ? 'No earlier data to compare' : undefined} trend={series[0].points.map((x) => x.y)} />
        <StatCard label="Avg vs SOP target" value={signed(s.avgDelta)} unit=" min" icon={Timer} goodWhen="down" delta={hasPrev ? Math.round((s.avgDelta - sp.avgDelta) * 10) / 10 : null} deltaLabel={`vs prior ${P.n} days`} hint={!hasPrev ? 'Negative is faster' : undefined} />
        <StatCard label="Rooms completed" value={s.completed} icon={CheckCircle2} delta={hasPrev ? s.completed - sp.completed : null} deltaLabel={`vs prior ${P.n} days`} hint={!hasPrev ? `${rows.length} people` : undefined} />
        <StatCard label="Verification pass" value={vp.pct ?? '—'} unit={vp.pct == null ? undefined : '%'} icon={ShieldCheck} delta={delta(vp.pct, vpp.checked ? vpp.pct : null)} deltaLabel={`vs prior ${P.n} days`} hint={`${vp.checked} rooms checked`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Daily trend" description="Completed days only; today is still running." icon={BarChart3}>
          <LineChart series={series} label="On-time and verification pass rate by day" max={100} target={80} />
        </Section>
        <Section title="Finish time vs target" description="Minutes over (+) or under the SOP target, every completed room" icon={Timer}>
          {P.cur.some((t) => t.status === 'done') ? <Bars data={targetHistogram(P.cur, target)} label="Finish time against SOP target" unit="m" highlight={(k) => String(k).startsWith('+')} /> : <EmptyState compact title="No completed rooms" />}
          <p className="mt-3 flex items-center gap-4 text-xs text-muted"><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-forest-700/80" />Within target</span><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-amber/80" />Over target</span></p>
        </Section>
      </div>
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Section title="On-time by person" icon={Gauge}>
          {rows.length ? <HBars data={[...rows].sort((a, b) => b.s.onTimePct - a.s.onTimePct).map((r) => ({ label: r.p.name, value: r.s.onTimePct, hint: `${r.s.completed} rooms` }))} suffix="%" max={100} /> : <EmptyState compact title="No work in this period" />}
        </Section>
        <Card>
          <CardHeader title="By employee" description="Select a row for the full profile" />
          <DataTable bare rows={rows} columns={columns} rowKey={(r) => r.p.id} caption="Team progress by employee" initialSort={{ key: 'ontime', dir: 'desc' }} onRowClick={(r) => nav(`/manager/staff/${r.p.id}`)} exportName={`team-progress-${P.n}d`} />
        </Card>
      </div>
    </div>
  )
}

// ── SOP results ────────────────────────────────────────────────────────────

interface SopRow { sopId: string; code: string; title: string; current: string; versions: string[]; runs: number; s: Stats; vp: number | null; rating: number | null; target: number }

export function SopResults() {
  const [period, setPeriod] = useState<Period>('14')
  const P = usePeriod(period)
  const { sops, sopVersions, feedback } = useDB()
  const rows: SopRow[] = sops.map((sop) => {
    const vIds = sopVersions.filter((v) => v.sopId === sop.id).map((v) => v.id)
    const ts = P.cur.filter((t) => vIds.includes(t.sopVersionId))
    const cur = byId(sopVersions, sop.currentVersionId) ?? sopVersions.filter((v) => v.sopId === sop.id).slice(-1)[0]
    const ratings = feedback.filter((f) => f.lane === 'rating' && vIds.includes(f.sopVersionId) && f.rating)
    return {
      sopId: sop.id, code: sop.code, title: cur?.title ?? sop.code, current: cur?.version ?? '—', target: cur?.timeTargetMin ?? 0,
      versions: [...new Set(ts.map((t) => byId(sopVersions, t.sopVersionId)?.version ?? ''))], runs: ts.length, s: stats(ts, sopVersions, P.now), vp: verifyPass(ts, P.audit).pct,
      rating: ratings.length ? Math.round((ratings.reduce((a, f) => a + (f.rating ?? 0), 0) / ratings.length) * 10) / 10 : null,
    }
  }).filter((r) => r.runs > 0)
  const [pick, setPick] = useState('hk-reset')
  const sel = rows.find((r) => r.sopId === pick) ?? rows[0]
  const all = stats(P.cur, P.versions, P.now), vpAll = verifyPass(P.cur, P.audit)
  const top = [...rows].sort((a, b) => b.runs - a.runs).slice(0, 4)
  const series = top.map((r) => {
    const vIds = sopVersions.filter((v) => v.sopId === r.sopId).map((v) => v.id)
    return { name: r.code, points: P.keys.map((k) => ({ x: dayLabel(k), y: stats(P.window3(k).filter((t) => vIds.includes(t.sopVersionId)), P.versions, P.now).onTimePct })) }
  })
  const selTasks = sel ? P.cur.filter((t) => byId(sopVersions, t.sopVersionId)?.sopId === sel.sopId) : []
  const byVersion = sel ? [...new Set(selTasks.map((t) => t.sopVersionId))].map((vid) => { const v = byId(sopVersions, vid)!; const ts = selTasks.filter((t) => t.sopVersionId === vid); return { v, s: stats(ts, sopVersions, P.now), runs: ts.length } }) : []

  const columns: Column<SopRow>[] = [
    { key: 'code', header: 'SOP', sort: (r) => r.code, csv: (r) => r.code, cell: (r) => <div><div className="font-medium text-ink">{r.code}</div><div className="text-xs text-muted">{r.title}</div></div> },
    { key: 'ver', header: 'Versions run', hideOnMobile: true, csv: (r) => r.versions.join(' '), cell: (r) => <div className="flex gap-1">{r.versions.map((v) => <Badge key={v} tone={v === r.current ? 'brand' : 'neutral'}>v{v}</Badge>)}</div> },
    { key: 'runs', header: 'Runs', align: 'right', sort: (r) => r.runs, csv: (r) => r.runs, cell: (r) => r.runs },
    { key: 'ontime', header: 'On-time', align: 'right', sort: (r) => r.s.onTimePct, csv: (r) => r.s.onTimePct, cell: (r) => <Badge tone={r.s.onTimePct >= 70 ? 'success' : r.s.onTimePct >= 45 ? 'warning' : 'danger'}>{r.s.onTimePct}%</Badge> },
    { key: 'avg', header: 'Avg vs target', align: 'right', hideOnMobile: true, sort: (r) => r.s.avgDelta, csv: (r) => r.s.avgDelta, cell: (r) => <span className={r.s.avgDelta > 0 ? 'text-danger' : 'text-ok'}>{signed(r.s.avgDelta)} min <span className="text-muted">/ {r.target}</span></span> },
    { key: 'vp', header: 'Verification pass', align: 'right', hideOnMobile: true, sort: (r) => r.vp ?? -1, csv: (r) => r.vp ?? '', cell: (r) => (r.vp == null ? <span className="text-muted">No check</span> : `${r.vp}%`) },
    { key: 'rating', header: 'Staff rating', align: 'right', hideOnMobile: true, sort: (r) => r.rating ?? -1, csv: (r) => r.rating ?? '', cell: (r) => (r.rating == null ? <span className="text-muted">—</span> : `${r.rating} / 5`) },
  ]
  return (
    <div className="space-y-6">
      <PageHeader title="SOP results" description="How each standard performs across everyone who runs it — and whether a new version made a difference." actions={<PeriodSwitch value={period} onChange={setPeriod} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="SOPs in use" value={rows.length} icon={ClipboardList} hint={`of ${sops.filter((s) => s.currentVersionId && !s.retiredAt).length} published`} />
        <StatCard label="Runs" value={P.cur.length} icon={CheckCircle2} hint={`${all.completed} completed`} />
        <StatCard label="On-time across SOPs" value={all.onTimePct} unit="%" icon={Clock} hint={`avg ${signed(all.avgDelta)} min vs target`} />
        <StatCard label="Verification pass" value={vpAll.pct ?? '—'} unit={vpAll.pct == null ? undefined : '%'} icon={ShieldCheck} hint={`${vpAll.checked} rooms checked`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="On-time by SOP" description="The four most-run SOPs · 3-day rolling average, completed days" icon={BarChart3}>
          <LineChart series={series} label="On-time rate by SOP" max={100} area={false} />
        </Section>
        <Section title="Runs by SOP" icon={Gauge}>
          <HBars data={[...rows].sort((a, b) => b.runs - a.runs).map((r) => ({ label: r.code, value: r.runs, hint: `${r.s.onTimePct}% on time` }))} tone="gold" />
        </Section>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.sopId} caption="SOP results" initialSort={{ key: 'runs', dir: 'desc' }} onRowClick={(r) => setPick(r.sopId)} exportName={`sop-results-${P.n}d`}
        rowClassName={(r) => (r.sopId === sel?.sopId ? 'bg-forest-50/70' : undefined)} />
      {sel && (
        <Card>
          <CardHeader icon={Timer} title={`${sel.code} · ${sel.title}`} description={`Target ${sel.target} min · current v${sel.current}`}
            actions={<Select aria-label="Choose an SOP" value={sel.sopId} onChange={(e) => setPick(e.target.value)} className="h-9 w-auto py-1.5">{rows.map((r) => <option key={r.sopId} value={r.sopId}>{r.code}</option>)}</Select>} />
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="mb-2 text-xs font-medium text-muted">Completion time (minutes) · amber is over the {sel.target} min target</div>
              {selTasks.some((t) => t.completedAt) ? <Bars data={(() => { const m = new Map<number, number>(); selTasks.filter((t) => t.startedAt && t.completedAt).forEach((t) => { const d = minutesBetween(t.startedAt!, t.completedAt!); m.set(d, (m.get(d) ?? 0) + 1) }); return [...m.entries()].sort((a, b) => a[0] - b[0]) })()} label={`${sel.code} completion time distribution`} unit="" highlight={(k) => Number(k) > sel.target} /> : <EmptyState compact title="No completed runs" />}
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-muted">By pinned version</div>
              <ul className="divide-y divide-line rounded-cell border border-line">
                {byVersion.map(({ v, s, runs }) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span><b className="font-semibold">v{v.version}</b> <span className="text-xs text-muted">{v.status === 'published' ? 'current' : 'superseded'} · {runs} runs</span></span>
                    <span className="tabular">{s.onTimePct}% on time</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Rooms keep the version they were assigned with, so each version’s results stay separate.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Staff detail ───────────────────────────────────────────────────────────

export function StaffDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const now = useNow(60_000)
  const db = useDB()
  const { people, tasks, sopVersions, attendance, ackEvents, issues, jobRoles, shifts, audit } = db
  const { person: me } = usePersona('manager')
  const L = useLookups()
  const p = byId(people, id)
  useBreadcrumb(p?.name)
  if (!p) return <div><PageHeader title="Person not found" back={{ to: '/manager/staff', label: 'Staff directory' }} /><EmptyState icon={UserX} title="No one with that ID" description="They may have left the property or the link is wrong." action={<Link to="/manager/staff"><Button variant="secondary">Back to the directory</Button></Link>} /></div>
  const role = byId(jobRoles, p.jobRoleId)
  const myShifts = shifts.filter((x) => x.memberIds.includes(p.id))
  const today = hotelDateKey(now)
  const status: StaffStatus = p.status === 'on_leave' ? 'on_leave' : p.status === 'inactive' ? 'inactive' : offOn(db, p.id, today) ? 'time_off' : 'active'
  const mine = tasks.filter((t) => t.personId === p.id)
  const recent = mine.filter((t) => Date.parse(t.start) > now - 14 * DAY).sort((a, b) => b.start.localeCompare(a.start))
  const s = stats(recent, sopVersions, now)
  const vp = verifyPass(recent, audit)
  const att = attendance.filter((a) => a.personId === p.id).sort((a, b) => b.date.localeCompare(a.date))
  const att28 = att.filter((a) => Date.parse(a.at) > now - 28 * DAY)
  const ack = ackCompliance(db, p)
  const required = versionsForRole(db, p.jobRoleId)
  const reported = issues.filter((i) => (i.reportedById === p.id || i.assignedToId === p.id) && i.status !== 'resolved')
  const tenure = (now - Date.parse(p.hiredAt ?? new Date(now).toISOString())) / (365 * DAY)
  const keys = Array.from({ length: 14 }, (_, i) => hotelDateKey(now - (14 - i) * DAY))
  const trend = keys.map((k) => ({ x: dayLabel(k), y: stats(mine.filter((t) => hotelDateKey(t.start) === k), sopVersions, now).onTimePct, n: mine.filter((t) => hotelDateKey(t.start) === k && t.status === 'done').length })).filter((d) => d.n)
  const remind = (vIds: string[]) => {
    const what = vIds.map((v) => { const x = byId(sopVersions, v); return `${x?.code} v${x?.version}` }).join(', ')
    sendAckReminder(me?.id ?? 'elena', [p.id], what)
    toast.success(`Reminder sent to ${p.name.split(' ')[0]}`, { description: `${what} — it appears on their phone until acknowledged.` })
  }

  const taskCols: Column<Task>[] = [
    { key: 'day', header: 'Date', sort: (t) => t.start, csv: (t) => hotelDateKey(t.start), cell: (t) => <span className="whitespace-nowrap text-sm text-ink-2">{fDate(t.start)}<span className="ml-1.5 text-xs text-muted">{fWindow(t)}</span></span> },
    { key: 'room', header: 'Room', sort: (t) => L.room(t.roomId)?.number, csv: (t) => L.room(t.roomId)?.number, cell: (t) => <span className="font-medium tabular">{L.room(t.roomId)?.number}</span> },
    { key: 'sop', header: 'SOP', hideOnMobile: true, sort: (t) => L.version(t.sopVersionId)?.code, csv: (t) => L.version(t.sopVersionId)?.code, cell: (t) => <span className="whitespace-nowrap text-sm">{L.version(t.sopVersionId)?.code} <span className="text-xs text-muted">v{L.version(t.sopVersionId)?.version}</span></span> },
    { key: 'status', header: 'Status', sort: (t) => t.status, csv: (t) => t.status, cell: (t) => <TaskStatusBadge task={t} now={now} /> },
    { key: 'time', header: 'Time', align: 'right', hideOnMobile: true, sort: (t) => taskTiming(t, L.version(t.sopVersionId), now).elapsed ?? -1, csv: (t) => taskTiming(t, L.version(t.sopVersionId), now).elapsed ?? '', cell: (t) => { const x = taskTiming(t, L.version(t.sopVersionId), now); return x.elapsed == null ? <span className="text-muted">—</span> : <span className="whitespace-nowrap"><b className={x.over ? 'text-danger' : 'text-ink'}>{x.elapsed}</b><span className="text-muted">/{x.target}m</span></span> } },
  ]

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: '/manager/staff', label: 'Staff directory' }}
        title={<span className="flex flex-wrap items-center gap-3"><Avatar name={p.name} size={48} />{p.name}<Badge tone={STAFF_STATUS[status].tone} dot size="md">{STAFF_STATUS[status].label}</Badge></span>}
        description={`${p.title} · ${role?.team} · ${myShifts.length ? `${myShifts.map((x) => x.name).join(' & ')} shift` : 'not rostered today'}`}
        meta={<>
          <span className="tabular">{p.employeeNo}</span>
          {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail size={12} />{p.email}</a>}
          {p.phone && <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone size={12} />{p.phone}</a>}
          <span>Speaks {p.languages?.join(', ')}</span>
          {p.hiredAt && <span>Joined {fDate(p.hiredAt)} {new Date(p.hiredAt).getUTCFullYear()} · {tenure >= 1 ? `${tenure.toFixed(1)} yrs` : `${Math.round(tenure * 12)} months`}</span>}
        </>}
        actions={<>
          <Link to={`/manager/notices?new=1&to=${p.id}`}><Button variant="secondary" icon={Megaphone}>Send notice</Button></Link>
          <Link to={`/manager/assign-rooms?staff=${p.id}`}><Button variant="primary" icon={ClipboardList}>Assign work</Button></Link>
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Rooms · 14 days" value={s.completed} icon={CheckCircle2} hint={`${mine.filter((t) => hotelDateKey(t.start) === today && t.status !== 'cancelled').length} today`} />
        <StatCard label="On-time" value={s.completed ? s.onTimePct : '—'} unit={s.completed ? '%' : undefined} icon={Clock} hint="last 14 days" />
        <StatCard label="Avg vs target" value={s.completed ? signed(s.avgDelta) : '—'} unit={s.completed ? ' min' : undefined} icon={Timer} hint="negative is faster" />
        <StatCard label="Verification pass" value={vp.pct ?? '—'} unit={vp.pct == null ? undefined : '%'} icon={ShieldCheck} hint={`${vp.checked} checked`} />
        <StatCard label="Check-ins · 28 days" value={att28.filter((a) => a.mark !== 'pending').length} icon={CalendarCheck} hint={`${att28.filter((a) => a.mark === 'pending').length} pending review`} />
        <StatCard label="SOP acknowledgment" value={ack.pct ?? '—'} unit={ack.pct == null ? undefined : '%'} icon={BellRing} hint={ack.total ? `${ack.acked} of ${ack.total} versions` : 'No SOP for role'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Section title="On-time trend" description="Days with completed rooms, last 14 days" icon={BarChart3}>
            {trend.length > 1 ? <LineChart points={trend} label={`${p.name} on-time trend`} max={100} target={80} /> : <EmptyState compact title="Not enough history yet" description="The trend appears after two working days with completed rooms." />}
          </Section>
          <Card>
            <CardHeader title="Recent tasks" description="Last 14 days · select a row to open it in Live tasks" />
            <DataTable bare dense rows={recent} columns={taskCols} rowKey={(t) => t.id} pageSize={8} caption="Recent tasks" exportName={`${p.name.toLowerCase().replace(/\s+/g, '-')}-tasks`}
              onRowClick={(t) => nav(`/manager/tasks?task=${t.id}&scope=14`)} empty={<EmptyState compact title="No tasks in the last 14 days" />} />
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Section title="SOP acknowledgments" description={`Published versions for ${role?.name.toLowerCase()}s`} icon={ShieldCheck}
            actions={required.some((v) => !ackEvents.some((a) => a.personId === p.id && a.refId === v.id && a.acknowledgedAt)) && <Button size="xs" variant="secondary" icon={BellRing} onClick={() => remind(required.filter((v) => !ackEvents.some((a) => a.personId === p.id && a.refId === v.id && a.acknowledgedAt)).map((v) => v.id))}>Remind</Button>}>
            {!required.length ? <p className="text-sm text-muted">No published SOP governs this role yet.</p> : (
              <ul className="divide-y divide-line">
                {required.map((v) => {
                  const a = ackEvents.find((x) => x.personId === p.id && x.kind === 'sop' && x.refId === v.id)
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{v.code} v{v.version}</span><span className="block truncate text-xs text-muted">{v.title}</span></span>
                      {a?.acknowledgedAt ? <Badge tone="success" dot>Acknowledged {fDate(a.acknowledgedAt)}</Badge> : a?.openedAt ? <Badge tone="warning" dot>Opened {fDate(a.openedAt)}</Badge> : <Badge tone="danger" dot>Not opened</Badge>}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
          <Section title="Attendance" description="Most recent check-ins" icon={CalendarCheck}>
            {!att.length ? <p className="text-sm text-muted">No check-ins recorded.</p> : (
              <ul className="divide-y divide-line">
                {att.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="text-ink">{fLongDate(`${a.date}T06:00:00Z`)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">{fTime(a.at)}{a.mark === 'checkin' ? <Badge tone="success">Checked in</Badge> : a.mark === 'extra' ? <Badge tone="info">Extra shift</Badge> : <Badge tone="warning">Pending review</Badge>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Open incidents" description="Reported by or assigned to them" icon={Gauge}>
            {!reported.length ? <p className="text-sm text-muted">Nothing open.</p> : (
              <ul className="divide-y divide-line">
                {reported.map((i) => (
                  <li key={i.id}><Link to={`/manager/incidents?id=${i.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{i.title}</span><span className="text-xs text-muted">{i.assignedToId === p.id ? 'Assigned to them' : 'Reported'} · {fDate(i.at)}</span></span>
                    <span className="flex shrink-0 gap-1.5"><SeverityBadge severity={i.severity} /><IssueStatusBadge status={i.status} /></span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Section>
          {status !== 'active' && <Callout tone="warning" title={STAFF_STATUS[status].label}>Don’t assign rooms to {p.name.split(' ')[0]} until they’re back. Their open rooms can be moved from Live tasks.</Callout>}
        </div>
      </div>
    </div>
  )
}
