import clsx from 'clsx'
import {
  AlertOctagon, ArrowRight, ArrowRightLeft, BedDouble, CalendarClock, CheckCircle2, ClipboardList, Clock, ListChecks, RotateCcw, ShieldCheck, Sparkles, Users, UserPlus, Zap, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Avatar, Badge, Button, Card, CardHeader, DataTable, EmptyState, PageHeader, Section, StatCard, Switch, Tabs, Timeline, type Column, type Tone,
} from '@/components/ui'
import { byDay, stats } from '@/lib/analytics'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, fDateTime, fTime, hotelDateKey } from '@/lib/time'
import { confirm, toast } from '@/lib/toast'
import type { JoinRequest, Person, Task } from '@/lib/types'
import { relTime, usePersona } from '@/shell/PortalShell'
import { decideJoinAs, setModeForTasks } from './actions'
import { FilterSelect, Meter, MiniRoom, OccupancyLegend, ShiftSwitcher, TaskMarkLegend, useLookups } from './components'
import { COVER_KIND, DAY, SEVERITY, describeAudit, fAge, firstName, isOpen, isOverdue, liveShiftAt, pct } from './model'
import { ReassignDialog, TaskDrawer, useTaskActions } from './TaskDrawer'

const greeting = (now: number) => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: 'numeric', hour12: false }).format(now))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

interface QueueItem { id: string; icon: LucideIcon; tone: Tone; title: ReactNode; sub: ReactNode; at: string; actions: ReactNode; rank: number }

export function ManagerOverview() {
  const { person: me } = usePersona('manager')
  const now = useNow(15_000)
  const nav = useNavigate()
  const db = useDB()
  const { shifts, tasks, sopVersions, cover, people, rooms, audit, issues, attendance } = db
  const L = useLookups()
  const A = useTaskActions()
  const live = liveShiftAt(now, shifts)
  const [shiftId, setShiftId] = useState(live?.id ?? shifts[0].id)
  const [drawer, setDrawer] = useState<string | null>(null)
  const [moving, setMoving] = useState<Task | null>(null)
  const shift = byId(shifts, shiftId) ?? shifts[0]
  const today = hotelDateKey(now)

  const todays = useMemo(() => tasks.filter((t) => hotelDateKey(t.start) === today), [tasks, today])
  const onShift = todays.filter((t) => t.shiftId === shift.id && t.status !== 'cancelled')
  const done = onShift.filter((t) => t.status === 'done').length
  const awaiting = todays.filter((t) => t.status === 'awaiting_verification')
  const overdue = todays.filter((t) => isOverdue(t, now))
  const openIssues = issues.filter((i) => i.status !== 'resolved')
  const hot = openIssues.filter((i) => i.severity === 'high' || i.severity === 'critical')
  const confirmed = shift.memberIds.filter((id) => attendance.some((a) => a.personId === id && a.date === today && a.mark !== 'pending')).length

  const week = stats(tasks.filter((t) => Date.parse(t.start) > now - 7 * DAY), sopVersions, now)
  const prior = stats(tasks.filter((t) => Date.parse(t.start) <= now - 7 * DAY && Date.parse(t.start) > now - 14 * DAY), sopVersions, now)
  const trend = byDay(tasks, sopVersions, 14, now).filter((d) => d.completed).map((d) => d.onTimePct)

  const queue: QueueItem[] = [
    ...awaiting.map((t): QueueItem => ({
      id: t.id, rank: 0, icon: ShieldCheck, tone: 'warning', at: t.startedAt ?? t.start,
      title: <>Room {L.room(t.roomId)?.number} is ready for verification</>,
      sub: <>{L.name(t.personId)} · {L.version(t.sopVersionId)?.code} · started {t.startedAt ? fTime(t.startedAt) : '—'}</>,
      actions: <>
        <Button size="xs" variant="ghost" onClick={() => setDrawer(t.id)}>Open</Button>
        <Button size="xs" variant="secondary" icon={RotateCcw} onClick={() => A.sendBack(t)} disabled={!A.canVerify(t)}>Send back</Button>
        <Button size="xs" variant="primary" icon={ShieldCheck} onClick={() => A.verify(t)} disabled={!A.canVerify(t)}>Verify</Button>
      </>,
    })),
    ...overdue.map((t): QueueItem => ({
      id: t.id, rank: t.priority === 'urgent' ? 0.5 : 1, icon: Clock, tone: 'danger', at: t.end,
      title: <>Room {L.room(t.roomId)?.number} is overdue{t.status === 'scheduled' ? ' and not started' : ''}</>,
      sub: <>{L.name(t.personId)} · due {fTime(t.end)} · {fAge(t.end, now)} late</>,
      actions: <>
        <Button size="xs" variant="ghost" onClick={() => setDrawer(t.id)}>Open</Button>
        <Button size="xs" variant="secondary" icon={ArrowRightLeft} onClick={() => setMoving(t)}>Reassign</Button>
      </>,
    })),
    ...hot.map((i): QueueItem => ({
      id: i.id, rank: i.severity === 'critical' ? 0.2 : 1.5, icon: AlertOctagon, tone: 'danger', at: i.at,
      title: i.title, sub: <>{SEVERITY[i.severity].label} · {i.roomId ? `Room ${L.room(i.roomId)?.number} · ` : ''}{i.assignedToId ? `with ${L.name(i.assignedToId)}` : 'unassigned'} · {fAge(i.at, now)} old</>,
      actions: <Link to={`/manager/incidents?id=${i.id}`}><Button size="xs" variant="secondary">Open</Button></Link>,
    })),
    ...cover.filter((c) => c.status === 'pending').map((c): QueueItem => ({
      id: c.id, rank: 2, icon: CalendarClock, tone: 'info', at: `${c.date}T06:00:00.000Z`,
      title: <>{L.name(c.personId)} · {COVER_KIND[c.kind].label.toLowerCase()}</>, sub: <>{byId(shifts, c.shiftId)?.name} · {fDate(`${c.date}T06:00:00Z`)} · {c.note}</>,
      actions: <Link to="/manager/shift-cover"><Button size="xs" variant="secondary">Review</Button></Link>,
    })),
  ].sort((a, b) => a.rank - b.rank || a.at.localeCompare(b.at))

  const crew = shift.memberIds.map((id) => byId(people, id)!).filter(Boolean)
  const roomTask = (roomId: string) => { const ts = todays.filter((t) => t.roomId === roomId); return ts.find(isOpen) ?? ts[ts.length - 1] }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={live ? `${live.name} shift · live until ${fTime(live.end)}` : 'Between shifts'}
        title={`${greeting(now)}, ${firstName(me)}`}
        description={queue.length ? `${queue.length} thing${queue.length === 1 ? '' : 's'} need${queue.length === 1 ? 's' : ''} you. Start at the top of the list.` : 'Nothing needs you right now. The floor is running to plan.'}
        actions={<>
          <ShiftSwitcher shifts={shifts} value={shift.id} onChange={setShiftId} liveId={live?.id} size="sm" />
          <Link to="/manager/assign-rooms"><Button variant="primary" icon={ClipboardList}>Assign work</Button></Link>
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label={`Rooms done · ${shift.name}`} value={done} unit={`/${onShift.length}`} icon={BedDouble} to={`/manager/tasks?status=done`}
          hint={onShift.length ? `${pct(done, onShift.length)}% complete` : 'Nothing assigned yet'} />
        <StatCard label="On-time · last 7 days" value={week.onTimePct} unit="%" icon={Clock} trend={trend.length > 1 ? trend : undefined} to="/manager/team-progress"
          delta={prior.completed ? week.onTimePct - prior.onTimePct : null} />
        <StatCard label="Awaiting verification" value={awaiting.length} icon={ShieldCheck} to="/manager/tasks?status=awaiting_verification"
          hint={awaiting.length ? `Oldest ${fAge(awaiting.map((t) => t.startedAt ?? t.start).sort()[0], now)}` : 'All checked'} />
        <StatCard label="Open incidents" value={openIssues.length} icon={AlertOctagon} to="/manager/incidents" hint={`${hot.length} high or critical`} />
        <StatCard label={`Attendance · ${shift.name}`} value={confirmed} unit={`/${shift.staffTarget}`} icon={Users} to="/manager/shift-cover"
          hint={confirmed >= shift.staffTarget ? 'At staff target' : `${shift.staffTarget - confirmed} short of target`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader icon={Zap} title="Needs attention" description="Verifications, overdue rooms, serious incidents and cover requests — oldest first within each."
              actions={<Link to="/manager/tasks" className="link text-sm">All tasks</Link>} />
            {queue.length ? (
              <ul className="divide-y divide-line">
                {queue.slice(0, 8).map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-cell', { warning: 'bg-amber/10 text-amber', danger: 'bg-danger/10 text-danger', info: 'bg-info/10 text-info' }[q.tone as string] ?? 'bg-surface-2 text-muted')}><q.icon size={15} aria-hidden /></span>
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="truncate text-sm font-medium text-ink">{q.title}</div>
                      <div className="truncate text-xs text-muted">{q.sub}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-sm:w-full max-sm:justify-end">{q.actions}</div>
                  </li>
                ))}
                {queue.length > 8 && <li className="px-5 py-2.5 text-xs text-muted">{queue.length - 8} more · <Link to="/manager/tasks" className="link">open Live tasks</Link> or <Link to="/manager/incidents" className="link">Incidents</Link></li>}
              </ul>
            ) : <EmptyState compact icon={CheckCircle2} title="Nothing needs you right now" description="New verifications, overdue rooms and incidents land here the moment they happen." />}
          </Card>

          <Card>
            <CardHeader icon={BedDouble} title="Room status" description={`${rooms.length} rooms by floor · tile colour is occupancy, the dot is today’s task`}
              actions={<Link to="/manager/lead/board" className="link text-sm">Property board</Link>} />
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((f) => (
                <div key={f} className="flex items-start gap-3">
                  <div className="w-12 shrink-0 pt-2 text-xs font-semibold text-muted">Floor {f}</div>
                  <div className="grid flex-1 grid-cols-10 gap-1 sm:[grid-template-columns:repeat(20,minmax(0,1fr))]">
                    {rooms.filter((r) => r.floor === f).map((r) => {
                      const t = roomTask(r.id)
                      return <MiniRoom key={r.id} room={r} task={t} now={now} onClick={() => (t ? setDrawer(t.id) : nav(`/manager/tasks?room=${r.id}`))} />
                    })}
                  </div>
                </div>
              ))}
              <div className="space-y-2 border-t border-line pt-3"><OccupancyLegend /><TaskMarkLegend /></div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader icon={Users} title="Team progress now" description={`${shift.name} shift · ${fTime(shift.start)} – ${fTime(shift.end)}`} />
            <ul className="divide-y divide-line">
              {crew.map((p) => {
                const mine = onShift.filter((t) => t.personId === p.id)
                const d = mine.filter((t) => t.status === 'done').length
                const cur = mine.find((t) => t.status === 'in_progress')
                const next = mine.filter((t) => t.status === 'scheduled').sort((a, b) => a.start.localeCompare(b.start))[0]
                const wait = mine.find((t) => t.status === 'awaiting_verification')
                const checkedIn = attendance.some((a) => a.personId === p.id && a.date === today)
                return (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <Link to={`/manager/staff/${p.id}`} className="truncate text-sm font-medium text-ink hover:underline">{p.name}</Link>
                          <span className="shrink-0 text-xs tabular text-ink-2"><b className="text-ink">{d}</b>/{mine.length} tasks</span>
                        </div>
                        <Meter className="mt-1.5" value={d} max={Math.max(1, mine.length)} tone={mine.length && d === mine.length ? 'success' : 'brand'} label={`${p.name}: ${d} of ${mine.length} tasks done`} />
                        <div className="mt-1.5 truncate text-xs text-muted">
                          {cur ? <button className="text-info hover:underline" onClick={() => setDrawer(cur.id)}>In room {L.room(cur.roomId)?.number}{cur.startedAt ? ` · ${fAge(cur.startedAt, now)}` : ''}</button>
                            : wait ? <button className="text-amber hover:underline" onClick={() => setDrawer(wait.id)}>Room {L.room(wait.roomId)?.number} waiting for check</button>
                              : next ? <>Next: room {L.room(next.roomId)?.number} at {fTime(next.start)}</>
                                : mine.length ? 'All tasks finished' : <Link to={`/manager/assign-rooms?staff=${p.id}`} className="link">Nothing assigned · assign work</Link>}
                          {!checkedIn && <span className="ml-2 text-amber">· not checked in</span>}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
              {!crew.length && <li><EmptyState compact title="No one rostered" description="Arrange cover from Shift cover & time off." /></li>}
            </ul>
          </Card>

          <Card>
            <CardHeader icon={Sparkles} title="Recent activity" actions={<Link to="/manager/lead/pulse" className="link text-sm">Operations pulse</Link>} />
            <div className="p-5">
              <Timeline items={audit.slice(0, 8).map((a) => {
                const d = describeAudit(a, db)
                return {
                  id: a.id, tone: d.tone === 'gold' ? 'warning' : (d.tone as 'neutral'),
                  title: <><b className="font-semibold">{L.name(a.actorId) === '—' ? a.actorId : L.name(a.actorId)}</b> {d.to ? <Link to={d.to} className="hover:underline">{d.text}</Link> : d.text}</>,
                  meta: `${relTime(a.at)} · ${fDateTime(a.at)}`,
                }
              })} />
            </div>
          </Card>
        </div>
      </div>

      <TaskDrawer taskId={drawer} onClose={() => setDrawer(null)} />
      <ReassignDialog tasks={moving ? [moving] : []} open={!!moving} onClose={() => setMoving(null)} />
    </div>
  )
}

// ── Guided or Standard ─────────────────────────────────────────────────────

export function GuidedOrStandard() {
  const now = useNow(60_000)
  const { person: me } = usePersona('manager')
  const { tasks, shifts, people, sopVersions } = useDB()
  const [shift, setShift] = useState('')
  const today = hotelDateKey(now)
  const rostered = [...new Set(shifts.flatMap((s) => s.memberIds))].map((id) => byId(people, id)!).filter(Boolean)
  const openOf = (p: Person) => tasks.filter((t) => t.personId === p.id && hotelDateKey(t.start) === today && (t.status === 'scheduled' || t.status === 'in_progress'))
  const rows = rostered.filter((p) => !shift || byId(shifts, shift)?.memberIds.includes(p.id))
  const history = (p: Person) => stats(tasks.filter((t) => t.personId === p.id && Date.parse(t.start) > now - 14 * DAY), sopVersions, now)

  const toggle = (p: Person, standard: boolean) => {
    const open = openOf(p)
    const n = setModeForTasks(open, standard ? 'standard' : 'guided', me?.id ?? 'elena', p.name)
    toast.success(`${p.name} → ${standard ? 'Standard' : 'Guided'}`, { description: n ? `${n} open room${n === 1 ? '' : 's'} updated. The change shows on their phone straight away.` : 'Their open rooms already use this mode.' })
  }

  const columns: Column<Person>[] = [
    { key: 'name', header: 'Staff member', sort: (p) => p.name, csv: (p) => p.name, cell: (p) => (
      <span className="flex items-center gap-2.5"><Avatar name={p.name} size={28} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{p.name}</span><span className="block truncate text-xs text-muted">{p.title}</span></span></span>) },
    { key: 'shift', header: 'Shift', hideOnMobile: true, sort: (p) => shifts.find((s) => s.memberIds.includes(p.id))?.name, csv: (p) => shifts.find((s) => s.memberIds.includes(p.id))?.name, cell: (p) => <span className="text-sm text-ink-2">{shifts.find((s) => s.memberIds.includes(p.id))?.name}</span> },
    { key: 'tenure', header: 'With us', hideOnMobile: true, sort: (p) => p.hiredAt, csv: (p) => p.hiredAt?.slice(0, 10), cell: (p) => { const y = (now - Date.parse(p.hiredAt ?? new Date(now).toISOString())) / (365 * DAY); return <span className="text-sm text-ink-2">{y >= 1 ? `${y.toFixed(1)} yrs` : `${Math.round(y * 12)} months`}</span> } },
    { key: 'ontime', header: 'On-time 14d', align: 'right', hideOnMobile: true, sort: (p) => history(p).onTimePct, csv: (p) => history(p).onTimePct, cell: (p) => { const h = history(p); return h.completed ? <span className="tabular">{h.onTimePct}%</span> : <span className="text-xs text-muted">No history</span> } },
    { key: 'open', header: 'Open rooms', align: 'right', sort: (p) => openOf(p).length, csv: (p) => openOf(p).length, cell: (p) => <span className="tabular">{openOf(p).length}</span> },
    { key: 'mode', header: 'Mode today', cell: (p) => {
      const open = openOf(p); const std = open.filter((t) => t.mode === 'standard').length
      const isStd = open.length > 0 && std === open.length
      return (
        <div className="flex items-center gap-3">
          <Switch checked={isStd} disabled={!open.length} onChange={(v) => toggle(p, v)} label={!open.length ? 'No open rooms' : isStd ? 'Standard' : std ? `Mixed (${std} of ${open.length} Standard)` : 'Guided'} />
        </div>
      )
    } },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Guided or Standard" description="Choose how much of the SOP each person sees on their open rooms today. Verification rules never change." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cell bg-forest-50 text-forest-700"><ListChecks size={18} /></span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Guided <Badge tone="brand" className="ml-1 align-middle">Default</Badge></h2>
              <p className="mt-1 text-sm text-ink-2">Every step on screen, ticked one by one, with guest-care notes. Use it for new starters, after a new SOP version and for anyone back from leave.</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cell bg-gold-50 text-gold-700"><Zap size={18} /></span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Standard</h2>
              <p className="mt-1 text-sm text-ink-2">Only the milestones: steps with an independent check and the final step. For experienced staff who know the SOP by heart. Rooms still need verification.</p>
            </div>
          </div>
        </Card>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} caption="Rostered staff and their mode" search={(p) => `${p.name} ${p.title}`} searchPlaceholder="Find a person"
        exportName="guided-or-standard" pageSize={20}
        filters={<FilterSelect label="Shift" value={shift} onChange={setShift}><option value="">All shifts</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</FilterSelect>} />
    </div>
  )
}

// ── Join requests ──────────────────────────────────────────────────────────

export function JoinRequests() {
  const { person: me } = usePersona('manager')
  const { joinRequests, jobRoles, shifts } = useDB()
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const pending = joinRequests.filter((j) => j.status === 'pending')
  const history = joinRequests.filter((j) => j.status !== 'pending')
  const role = (j: JoinRequest) => byId(jobRoles, j.jobRoleId)
  const shift = (j: JoinRequest) => byId(shifts, j.shiftId)

  const decide = async (j: JoinRequest, status: 'approved' | 'declined') => {
    const ok = await confirm(status === 'approved'
      ? { title: `Approve ${j.name}?`, body: `${j.name} joins the ${shift(j)?.name.toLowerCase()} shift as ${role(j)?.name.toLowerCase()} and can sign in with the hotel passkey.`, confirmLabel: 'Approve' }
      : { title: `Decline ${j.name}?`, body: 'They won’t be able to join this team. They can ask again later.', confirmLabel: 'Decline', tone: 'danger' })
    if (!ok) return
    if (decideJoinAs(j.id, status, me?.id ?? 'elena')) {
      if (status === 'approved') toast.success(`${j.name} approved`, { description: `Added to the ${shift(j)?.name} shift request list as ${role(j)?.name}.` })
      else toast.info(`${j.name} declined`)
    }
  }

  const columns: Column<JoinRequest>[] = [
    { key: 'name', header: 'Applicant', sort: (j) => j.name, csv: (j) => j.name, cell: (j) => <span className="flex items-center gap-2.5"><Avatar name={j.name} size={30} /><span className="text-sm font-medium text-ink">{j.name}</span></span> },
    { key: 'role', header: 'Role', sort: (j) => role(j)?.name, csv: (j) => role(j)?.name, cell: (j) => <div><div className="text-sm text-ink">{role(j)?.name}</div><div className="text-xs text-muted">{role(j)?.team}</div></div> },
    { key: 'shift', header: 'Shift', hideOnMobile: true, sort: (j) => shift(j)?.name, csv: (j) => shift(j)?.name, cell: (j) => <div className="text-sm text-ink-2">{shift(j)?.name}<span className="text-muted"> · {shift(j) ? `${fTime(shift(j)!.start)} – ${fTime(shift(j)!.end)}` : ''}</span></div> },
    { key: 'at', header: 'Requested', hideOnMobile: true, sort: (j) => j.at, csv: (j) => j.at, cell: (j) => <div className="text-sm text-ink-2">{relTime(j.at)}<div className="text-xs text-muted">{fDateTime(j.at)}</div></div> },
    { key: 'act', header: 'Decision', align: 'right', csv: (j) => j.status, cell: (j) => j.status === 'pending' ? (
      <div className="flex justify-end gap-2"><Button size="xs" variant="ghost" onClick={() => decide(j, 'declined')}>Decline</Button><Button size="xs" variant="primary" icon={UserPlus} onClick={() => decide(j, 'approved')}>Approve</Button></div>
    ) : <Badge tone={j.status === 'approved' ? 'success' : 'neutral'} dot>{j.status === 'approved' ? 'Approved' : 'Declined'}</Badge> },
  ]
  return (
    <div className="space-y-6">
      <PageHeader title="Join requests" description="New colleagues asking to join a shift team. Approving lets them sign in; nothing is assigned until you do."
        meta={<span>{pending.length} waiting · oldest {pending.length ? relTime(pending.map((j) => j.at).sort()[0]) : '—'}</span>}>
        <Tabs value={tab} onChange={setTab} items={[{ id: 'pending', label: 'Pending', count: pending.length }, { id: 'history', label: 'History', count: history.length }]} />
      </PageHeader>
      <DataTable rows={tab === 'pending' ? pending : history} columns={columns} rowKey={(j) => j.id} caption="Join requests" initialSort={{ key: 'at', dir: 'desc' }}
        search={(j) => `${j.name} ${role(j)?.name} ${shift(j)?.name}`} searchPlaceholder="Search name, role or shift" exportName="join-requests"
        empty={<EmptyState compact icon={tab === 'pending' ? CheckCircle2 : UserPlus} title={tab === 'pending' ? 'No one is waiting' : 'No decisions yet'} description={tab === 'pending' ? 'New requests appear here as soon as someone asks to join.' : 'Approved and declined requests are kept here.'} />} />
      <Section title="What approval means" icon={ArrowRight}>
        <ul className="grid gap-3 text-sm text-ink-2 md:grid-cols-3">
          <li><b className="text-ink">Access, not work.</b> Approved colleagues can sign in and read SOPs for their role. Rooms come only from Assign work.</li>
          <li><b className="text-ink">Role sets the SOPs.</b> They’ll be asked to acknowledge every published SOP for their job role.</li>
          <li><b className="text-ink">Guided by default.</b> New starters work in Guided mode until you switch them.</li>
        </ul>
      </Section>
    </div>
  )
}
