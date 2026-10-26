import clsx from 'clsx'
import { Activity, AlertOctagon, AlertTriangle, BedDouble, CalendarRange, ClipboardList, Clock, Crown, History, Radio, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bars, Donut } from '@/components/Charts'
import { Avatar, Badge, Button, Card, CardHeader, Drawer, EmptyState, KeyValue, PageHeader, SearchBox, Segmented, StatCard, Timeline, type Tone } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, fTime, hotelDateKey, hotelMidnight } from '@/lib/time'
import type { Occupancy, Room, Task } from '@/lib/types'
import { relTime } from '@/shell/PortalShell'
import { FilterSelect, OccupancyChip, OccupancyLegend, TaskStatusBadge, useLookups } from './components'
import { CATEGORY, DAY, OCCUPANCY, OCCUPANCY_ORDER, SEVERITY, describeAudit, fAge, fWindow, isOpen, isOverdue, liveShiftAt, taskState, type TaskStateKey } from './model'
import { coverageFor } from './ShiftCover'
import { TaskDrawer } from './TaskDrawer'

// ── Property board ─────────────────────────────────────────────────────────

const STATE_FILTER: { id: string; label: string; match: (k: TaskStateKey | 'none') => boolean }[] = [
  { id: 'none', label: 'No work today', match: (k) => k === 'none' },
  { id: 'active', label: 'Scheduled or in progress', match: (k) => k === 'scheduled' || k === 'in_progress' },
  { id: 'attention', label: 'Needs attention', match: (k) => k === 'overdue' || k === 'returned' || k === 'awaiting_verification' },
  { id: 'done', label: 'Done', match: (k) => k === 'done' },
]

export function PropertyBoard() {
  const now = useNow(15_000)
  const { rooms, tasks } = useDB()
  const L = useLookups()
  const [floor, setFloor] = useState('all')
  const [occ, setOcc] = useState('')
  const [state, setState] = useState('')
  const [wing, setWing] = useState('')
  const [q, setQ] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const today = hotelDateKey(now)
  const todays = useMemo(() => tasks.filter((t) => hotelDateKey(t.start) === today), [tasks, today])
  const roomTask = (r: Room) => { const ts = todays.filter((t) => t.roomId === r.id); return ts.find(isOpen) ?? ts.sort((a, b) => b.start.localeCompare(a.start))[0] }
  const stateOf = (r: Room): TaskStateKey | 'none' => { const t = roomTask(r); return t ? taskState(t, now).key : 'none' }
  const shown = rooms.filter((r) => (floor === 'all' || String(r.floor) === floor) && (!occ || r.occupancy === occ) && (!wing || r.wing === wing)
    && (!state || STATE_FILTER.find((f) => f.id === state)!.match(stateOf(r)))
    && (!q || `${r.number} ${r.guestName ?? ''} ${r.type ?? ''} ${roomTask(r) ? L.name(roomTask(r)!.personId) : ''}`.toLowerCase().includes(q.toLowerCase())))
  const counts = OCCUPANCY_ORDER.reduce<Partial<Record<Occupancy, number>>>((m, k) => ({ ...m, [k]: rooms.filter((r) => r.occupancy === k).length }), {})
  const vip = rooms.filter((r) => r.vip)
  const attention = rooms.filter((r) => ['overdue', 'returned', 'awaiting_verification'].includes(stateOf(r)))

  return (
    <div className="space-y-6">
      <PageHeader title="Property board" description="Every room, every floor — occupancy and today’s work in one view. Select a room to act on it."
        meta={<><span>{rooms.length} rooms</span><span>{vip.length} VIP</span><span>{todays.filter((t) => t.status !== 'cancelled').length} tasks today</span></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="To clean" value={(counts.vacant_dirty ?? 0) + (counts.due_out ?? 0)} icon={BedDouble} hint={`${counts.vacant_dirty ?? 0} vacant dirty · ${counts.due_out ?? 0} due out`} />
        <StatCard label="Arrivals" value={counts.arrival ?? 0} icon={Users} hint={`${vip.filter((r) => r.occupancy === 'arrival').length} VIP arrivals`} />
        <StatCard label="Need attention" value={attention.length} icon={AlertTriangle} hint="overdue, sent back or awaiting check" />
        <StatCard label="Out of order" value={counts.out_of_order ?? 0} icon={AlertOctagon} hint="blocked for sale" />
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <SearchBox value={q} onChange={setQ} placeholder="Room, guest, type or attendant" className="w-full sm:w-60" />
          <Segmented size="sm" value={floor} onChange={setFloor} items={[{ id: 'all', label: 'All floors' }, { id: '1', label: 'Floor 1' }, { id: '2', label: 'Floor 2' }, { id: '3', label: 'Floor 3' }]} />
          <FilterSelect label="Occupancy" value={occ} onChange={setOcc}><option value="">Any occupancy</option>{OCCUPANCY_ORDER.map((k) => <option key={k} value={k}>{OCCUPANCY[k].label}</option>)}</FilterSelect>
          <FilterSelect label="Today’s work" value={state} onChange={setState}><option value="">Any work status</option>{STATE_FILTER.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</FilterSelect>
          <FilterSelect label="Wing" value={wing} onChange={setWing}><option value="">Both wings</option><option value="West">West wing</option><option value="East">East wing</option></FilterSelect>
          <span className="ml-auto text-xs text-muted">{shown.length} of {rooms.length}</span>
        </div>
        <div className="border-b border-line px-4 py-2.5"><OccupancyLegend counts={counts} /></div>
        <div className="space-y-6 p-4 sm:p-5">
          {[1, 2, 3].filter((f) => floor === 'all' || String(f) === floor).map((f) => {
            const list = shown.filter((r) => r.floor === f)
            if (!list.length) return null
            return (
              <section key={f} aria-label={`Floor ${f}`}>
                <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">Floor {f}<span className="text-xs font-normal text-muted">{list.length} rooms</span></h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-10">
                  {list.map((r) => {
                    const t = roomTask(r), st = t ? taskState(t, now) : null, o = OCCUPANCY[r.occupancy ?? 'vacant_clean']
                    return (
                      <button key={r.id} type="button" onClick={() => (t ? setTaskId(t.id) : setRoomId(r.id))}
                        aria-label={`Room ${r.number}, ${o.label}${r.vip ? ', VIP' : ''}${st ? `, ${st.label}, ${L.name(t!.personId)}` : ', no work today'}`}
                        className={clsx('flex min-h-[92px] flex-col rounded-cell border p-2.5 text-left transition hover:-translate-y-px hover:shadow-pop', o.tile)}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="flex items-center gap-1 text-[15px] font-bold tabular text-ink">{r.number}{r.vip && <Crown size={12} className="text-gold-700" aria-hidden />}</span>
                          <span className="rounded bg-surface/70 px-1 text-[9px] font-bold text-ink-2">{o.short}</span>
                        </div>
                        <div className="truncate text-2xs text-ink-2">{r.guestName ?? r.type}</div>
                        <div className="mt-auto pt-1.5">
                          {t && st ? (
                            <div className="flex items-center gap-1.5">
                              <Avatar name={L.name(t.personId)} size={18} />
                              <span className={clsx('truncate text-2xs font-semibold', { danger: 'text-danger', warning: 'text-amber', success: 'text-ok', info: 'text-info' }[st.tone as string] ?? 'text-ink-2')}>{st.label}</span>
                            </div>
                          ) : <span className="text-2xs text-muted">No work today</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {!shown.length && <EmptyState compact title="No rooms match" description="Clear a filter to see more rooms." />}
        </div>
      </Card>
      <TaskDrawer taskId={taskId} onClose={() => setTaskId(null)} />
      <RoomDrawer roomId={roomId} onClose={() => setRoomId(null)} />
    </div>
  )
}

function RoomDrawer({ roomId, onClose }: { roomId: string | null; onClose: () => void }) {
  const now = useNow(60_000)
  const nav = useNavigate()
  const { tasks, issues } = useDB()
  const L = useLookups()
  const r = L.room(roomId)
  const history = tasks.filter((t) => t.roomId === roomId).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 6)
  const open = issues.filter((i) => i.roomId === roomId && i.status !== 'resolved')
  return (
    <Drawer open={!!roomId} onClose={onClose} title={r ? `Room ${r.number}` : 'Room'} description={r ? `${r.type} · floor ${r.floor} · ${r.wing} wing` : undefined}
      footer={r && <><Button variant="secondary" icon={AlertOctagon} onClick={() => nav(`/manager/incidents?new=1&room=${r.id}`)}>Log incident</Button><Button variant="primary" icon={ClipboardList} disabled={r.occupancy === 'out_of_order'} onClick={() => nav(`/manager/assign-rooms?room=${r.id}`)}>Assign work</Button></>}>
      {r && (
        <div className="space-y-5">
          <KeyValue columns={2} items={[['Occupancy', <OccupancyChip key="o" occ={r.occupancy} />], ['Guest', r.guestName ?? 'No guest in residence'], ['VIP', r.vip ? 'Yes' : 'No'], ['Yesterday’s attendant', L.name(r.yesterdayAttendantId)]]} />
          <div className="flex gap-2"><Badge>No work today</Badge>{r.occupancy === 'out_of_order' && <Badge tone="danger">Can’t be assigned while out of order</Badge>}</div>
          {open.length > 0 && <ul className="space-y-1.5">{open.map((i) => <li key={i.id}><Link to={`/manager/incidents?id=${i.id}`} className="flex items-center justify-between gap-2 rounded-cell border border-line px-3 py-2 text-sm hover:bg-surface-2"><span className="truncate">{i.title}</span><Badge tone={SEVERITY[i.severity].tone} dot>{SEVERITY[i.severity].label}</Badge></Link></li>)}</ul>}
          <section aria-label="Recent work">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><History size={14} />Recent work</h3>
            {!history.length ? <p className="text-sm text-muted">No tasks on record for this room.</p> : (
              <ul className="divide-y divide-line rounded-cell border border-line">{history.map((t) => (
                <li key={t.id}><Link to={`/manager/tasks?task=${t.id}&scope=14`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                  <span className="min-w-0"><span className="block truncate text-ink">{fDate(t.start)} · {L.version(t.sopVersionId)?.code}</span><span className="text-xs text-muted">{L.name(t.personId)}</span></span>
                  <TaskStatusBadge task={t} now={now} />
                </Link></li>
              ))}</ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  )
}

// ── Shift planner ──────────────────────────────────────────────────────────

export function ShiftPlanner() {
  const now = useNow(60_000)
  const { shifts, people, cover, jobRoles } = useDB()
  const [cellSel, setCellSel] = useState<{ shiftId: string; date: string } | null>(null)
  const days = Array.from({ length: 7 }, (_, i) => hotelDateKey(now + i * DAY))
  const all = shifts.flatMap((s) => days.map((d) => ({ s, d, cv: coverageFor(s, d, cover) })))
  const gaps = all.filter((x) => x.cv.gap)
  const risk = all.filter((x) => !x.cv.gap && x.cv.atRisk)
  const wk = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
  const sel = cellSel && byId(shifts, cellSel.shiftId)
  const selCv = sel && coverageFor(sel, cellSel!.date, cover)
  return (
    <div className="space-y-6">
      <PageHeader title="Shift planner" description="The week ahead: who’s rostered on each shift, who’s off, and where you fall below staff target."
        actions={<Link to="/manager/shift-cover"><Button variant="primary" icon={Users}>Shift cover & time off</Button></Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gaps this week" value={gaps.length} icon={AlertTriangle} hint="shifts below target" />
        <StatCard label="At risk" value={risk.length} icon={Clock} hint="if pending time off is approved" />
        <StatCard label="Time off approved" value={cover.filter((c) => c.kind === 'time_off' && c.status === 'approved' && days.includes(c.date)).length} icon={CalendarRange} hint="next 7 days" />
        <StatCard label="Rostered staff" value={new Set(shifts.flatMap((s) => s.memberIds)).size} icon={Users} hint={`target ${shifts.reduce((a, s) => a + s.staffTarget, 0)} per day`} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader icon={CalendarRange} title="Next 7 days" description="Available / staff target. Select a cell for the roster." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <caption className="sr-only">Shift coverage for the next seven days</caption>
            <thead className="bg-surface-2"><tr className="border-b border-line"><th className="th">Shift</th>{days.map((d, i) => <th key={d} className="th">{wk(d)} {fDate(`${d}T06:00:00Z`)}{i === 0 && <span className="ml-1 normal-case text-forest-700">· today</span>}</th>)}</tr></thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 align-top"><div className="font-medium text-ink">{s.name}</div><div className="text-xs text-muted">{fTime(s.start)} – {fTime(s.end)}</div><div className="text-2xs text-muted">{s.team}</div></td>
                  {days.map((d) => {
                    const cv = coverageFor(s, d, cover)
                    return (
                      <td key={d} className="p-1.5 align-top">
                        <button type="button" onClick={() => setCellSel({ shiftId: s.id, date: d })} aria-label={`${s.name} ${d}: ${cv.available} of ${s.staffTarget}`}
                          className={clsx('w-full rounded-cell border px-2.5 py-2 text-left transition hover:shadow-pop', cv.gap ? 'border-danger/30 bg-danger/[0.06]' : cv.atRisk ? 'border-amber/30 bg-amber/[0.06]' : 'border-line bg-surface')}>
                          <div className="flex items-center justify-between gap-1">
                            <span><b className={clsx('text-base tabular', cv.gap ? 'text-danger' : 'text-ink')}>{cv.available}</b><span className="text-xs text-muted">/{s.staffTarget}</span></span>
                            {cv.gap ? <Badge tone="danger">Gap</Badge> : cv.atRisk ? <Badge tone="warning">At risk</Badge> : null}
                          </div>
                          <div className="mt-1 space-y-0.5 text-2xs">
                            {cv.off.map((o) => <div key={o.id} className="truncate text-ink-2">{byId(people, o.personId)?.name.split(' ')[0]} · off</div>)}
                            {cv.pending.map((o) => <div key={o.id} className="truncate text-amber">{byId(people, o.personId)?.name.split(' ')[0]} · asked</div>)}
                            {!cv.off.length && !cv.pending.length && <div className="text-muted">Full roster</div>}
                          </div>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Drawer open={!!cellSel} onClose={() => setCellSel(null)} title={sel ? `${sel.name} shift · ${wk(cellSel!.date)} ${fDate(`${cellSel!.date}T06:00:00Z`)}` : ''} description={sel ? `${fTime(sel.start)} – ${fTime(sel.end)} · target ${sel.staffTarget}` : ''}
        footer={<Link to="/manager/shift-cover"><Button variant="primary">Arrange cover</Button></Link>}>
        {sel && selCv && (
          <div className="space-y-4">
            <div className="flex items-center gap-2"><b className={clsx('text-2xl tabular', selCv.gap ? 'text-danger' : 'text-ink')}>{selCv.available}</b><span className="text-sm text-muted">of {sel.staffTarget} available</span>{selCv.gap && <Badge tone="danger">Below target</Badge>}</div>
            <ul className="divide-y divide-line rounded-cell border border-line">
              {sel.memberIds.map((id) => { const p = byId(people, id); const off = selCv.off.some((o) => o.personId === id); const asked = selCv.pending.some((o) => o.personId === id); return (
                <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex items-center gap-2.5"><Avatar name={p?.name} size={26} /><span><span className="block text-sm text-ink">{p?.name}</span><span className="block text-xs text-muted">{jobRoles.find((r) => r.id === p?.jobRoleId)?.name}</span></span></span>
                  {off ? <Badge tone="warning">Time off</Badge> : asked ? <Badge tone="info">Asked for time off</Badge> : <Badge tone="success" dot>Working</Badge>}
                </li>
              ) })}
            </ul>
          </div>
        )}
      </Drawer>
    </div>
  )
}

// ── Operations pulse ───────────────────────────────────────────────────────

interface Alert { id: string; tone: Tone; title: string; sub: string; to: string; rank: number }

export function OperationsPulse() {
  const now = useNow(5_000)
  const db = useDB()
  const { audit, tasks, issues, shifts, attendance, connection } = db
  const L = useLookups()
  const [range, setRange] = useState<'today' | 'avg'>('today')
  const today = hotelDateKey(now)
  const todays = tasks.filter((t) => hotelDateKey(t.start) === today)
  const live = liveShiftAt(now, shifts)
  const active = todays.filter((t) => t.status === 'in_progress')
  const awaiting = todays.filter((t) => t.status === 'awaiting_verification')
  const overdue = todays.filter((t) => isOverdue(t, now))
  const openIssues = issues.filter((i) => i.status !== 'resolved')
  const checkedIn = live ? live.memberIds.filter((id) => attendance.some((a) => a.personId === id && a.date === today && a.mark !== 'pending')).length : 0
  const mid = hotelMidnight(now)
  const hours = Array.from({ length: 17 }, (_, i) => 6 + i)
  const hourOf = (iso: string) => Math.floor((Date.parse(iso) - hotelMidnight(Date.parse(iso))) / 3_600_000)
  const finished = (ts: Task[]) => ts.filter((t) => t.completedAt)
  const throughput: [string, number][] = range === 'today'
    ? hours.map((h) => [`${h % 12 || 12}${h < 12 ? 'a' : 'p'}`, finished(tasks).filter((t) => Date.parse(t.completedAt!) >= mid && hourOf(t.completedAt!) === h).length])
    : hours.map((h) => [`${h % 12 || 12}${h < 12 ? 'a' : 'p'}`, Math.round((finished(tasks).filter((t) => Date.parse(t.completedAt!) < mid && Date.parse(t.completedAt!) > mid - 14 * DAY && hourOf(t.completedAt!) === h).length / 14) * 10) / 10])
  const curHour = Math.floor((now - mid) / 3_600_000)
  const recentIssues = issues.filter((i) => Date.parse(i.at) > now - 7 * DAY)
  const byCat = (Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map((c) => ({ label: CATEGORY[c], value: recentIssues.filter((i) => i.category === c).length })).filter((d) => d.value)

  const alerts: Alert[] = [
    ...openIssues.filter((i) => i.severity === 'critical' || (i.severity === 'high' && !i.assignedToId)).map((i) => ({ id: i.id, rank: i.severity === 'critical' ? 0 : 1, tone: 'danger' as Tone, title: i.title, sub: `${SEVERITY[i.severity].label} · ${i.assignedToId ? L.name(i.assignedToId) : 'unassigned'} · ${fAge(i.at, now)} old`, to: `/manager/incidents?id=${i.id}` })),
    ...overdue.map((t) => ({ id: t.id, rank: t.priority === 'urgent' ? 0.5 : 1.5, tone: 'danger' as Tone, title: `Room ${L.room(t.roomId)?.number} overdue`, sub: `${L.name(t.personId)} · due ${fTime(t.end)} · ${fAge(t.end, now)} late`, to: `/manager/tasks?task=${t.id}` })),
    ...awaiting.filter((t) => t.startedAt && now - Date.parse(t.startedAt) > 45 * 60_000).map((t) => ({ id: `w-${t.id}`, rank: 2, tone: 'warning' as Tone, title: `Room ${L.room(t.roomId)?.number} waiting for a check`, sub: `${L.name(t.personId)} · ${fWindow(t)}`, to: `/manager/tasks?task=${t.id}` })),
    ...shifts.map((s) => ({ s, cv: coverageFor(s, today, db.cover) })).filter((x) => x.cv.gap).map(({ s, cv }) => ({ id: `gap-${s.id}`, rank: 2.5, tone: 'warning' as Tone, title: `${s.name} shift below target`, sub: `${cv.available} of ${s.staffTarget} staff today`, to: '/manager/lead/planner' })),
    ...(connection.hotel === 'offline' ? [{ id: 'offline', rank: 0, tone: 'danger' as Tone, title: 'Hotel connection is down', sub: 'Staff changes are queued and will sync on reconnect', to: '/manager/lead/pulse' }] : []),
  ].sort((a, b) => a.rank - b.rank)

  return (
    <div className="space-y-6">
      <PageHeader title="Operations pulse" description="Live, property-wide health — throughput, exceptions and what changed in the last few minutes."
        meta={<span className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-ok" /></span>Live · refreshes every 5 seconds · {fTime(now)} hotel time</span>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Rooms in progress" value={active.length} icon={Activity} to="/manager/tasks?status=in_progress" hint={`${todays.filter((t) => t.status === 'done').length} done today`} />
        <StatCard label="Awaiting check" value={awaiting.length} icon={ShieldCheck} to="/manager/tasks?status=awaiting_verification" />
        <StatCard label="Overdue" value={overdue.length} icon={Clock} to="/manager/tasks?status=overdue" goodWhen="down" />
        <StatCard label="Open incidents" value={openIssues.length} icon={AlertOctagon} to="/manager/incidents" hint={`${openIssues.filter((i) => i.severity === 'critical').length} critical`} />
        <StatCard label={live ? `On shift · ${live.name}` : 'On shift'} value={checkedIn} unit={live ? `/${live.staffTarget}` : undefined} icon={Users} hint="checked in" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader icon={BedDouble} title="Throughput" description={range === 'today' ? 'Rooms finished per hour today · the current hour is highlighted' : 'Average rooms finished per hour over the last 14 days'}
            actions={<Segmented size="sm" value={range} onChange={setRange} items={[{ id: 'today', label: 'Today' }, { id: 'avg', label: '14-day avg' }]} />} />
          <div className="p-5"><Bars data={throughput} label="Rooms finished per hour" unit="" height={180} highlight={(k) => range === 'today' && throughput.findIndex((x) => x[0] === k) === curHour - 6} /></div>
        </Card>
        <Card>
          <CardHeader icon={AlertOctagon} title="Incidents by category" description="Raised in the last 7 days" actions={<Link to="/manager/incidents" className="link text-sm">All incidents</Link>} />
          <div className="p-5">{byCat.length ? <Donut data={byCat} label="Incidents by category" center={{ value: recentIssues.length, caption: 'incidents' }} /> : <EmptyState compact title="No incidents this week" />}</div>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={AlertTriangle} title="Alerts" description="What needs a decision now, most serious first" />
          {alerts.length ? (
            <ul className="divide-y divide-line">{alerts.map((a) => (
              <li key={a.id}><Link to={a.to} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                <span className={clsx('h-2 w-2 shrink-0 rounded-full', a.tone === 'danger' ? 'bg-danger' : 'bg-amber')} aria-hidden />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{a.title}</span><span className="block truncate text-xs text-muted">{a.sub}</span></span>
                <Badge tone={a.tone}>{a.tone === 'danger' ? 'Act now' : 'Watch'}</Badge>
              </Link></li>
            ))}</ul>
          ) : <EmptyState compact icon={ShieldCheck} title="All clear" description="No overdue rooms, critical incidents or staffing gaps." />}
        </Card>
        <Card>
          <CardHeader icon={Radio} title="Live feed" description="Every action across the property" />
          <div className="max-h-[420px] overflow-y-auto p-5">
            <Timeline items={audit.slice(0, 20).map((a) => { const d = describeAudit(a, db); return {
              id: a.id, tone: d.tone === 'gold' ? 'warning' : (d.tone as 'neutral'),
              title: <><b className="font-semibold">{L.name(a.actorId) === '—' ? a.actorId : L.name(a.actorId)}</b> {d.to ? <Link to={d.to} className="hover:underline">{d.text}</Link> : d.text}</>, meta: `${relTime(a.at)} · ${fTime(a.at)}`,
            } })} />
          </div>
        </Card>
      </div>
    </div>
  )
}
