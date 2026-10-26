import {
  ArrowRight, Ban, BookOpen, CalendarClock, CheckCircle2, CircleCheck, LogIn, LogOut, OctagonAlert, RefreshCw, StickyNote, TriangleAlert, Undo2, WifiOff,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, Segmented, ShiftEventInterstitial, Skeleton } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useFirstLoad, useNow } from '@/lib/hooks'
import { fLongDate, fTime, hotelDateKey, minutesBetween } from '@/lib/time'
import type { Person, Shift, Task } from '@/lib/types'
import { confirm, toast } from '@/lib/toast'
import { relTime, usePersona } from '@/shell/PortalShell'
import { Callout, Meter, NoticeCard, OccupancyBadge, PhaseBadge, TaskRow, VipBadge } from './components'
import { PRIORITY, fDuration, firstName, greeting, pickNext, requiredSteps, taskPhase } from './model'

export { isGated } from './model'

/** The signed-in employee's work for today's hotel date (cancelled rooms are kept apart: they are not work). */
export function useMyTasks(personId?: string) {
  const tasks = useDB((s) => s.tasks)
  const shifts = useDB((s) => s.shifts)
  const now = useNow()
  return useMemo(() => {
    const pid = personId ?? ''
    const shift = shifts.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end) && s.memberIds.includes(pid)) ?? shifts.find((s) => s.memberIds.includes(pid))
    const today = hotelDateKey(now)
    const todays = tasks.filter((t) => t.personId === pid && hotelDateKey(t.start) === today).sort((a, b) => a.start.localeCompare(b.start))
    const all = todays.filter((t) => t.status !== 'cancelled')
    const cancelled = todays.filter((t) => t.status === 'cancelled')
    const open = all.filter((t) => t.status !== 'done')
    const next = pickNext(all, now)
    const upNext = all.filter((t) => t !== next && (t.status === 'scheduled' || t.status === 'ready'))
    return { shift, all, open, next, upNext, cancelled, now }
  }, [tasks, shifts, personId, now])
}

export function EmployeeWork() {
  const { person } = usePersona('employee')
  const { shift, all, next, cancelled, now } = useMyTasks(person?.id)
  const offline = useDB((s) => s.connection.hotel === 'offline')
  const loading = useFirstLoad()

  if (!person) return <EmptyState title="No staff profile on this account" description="Ask your manager to link your login to the hotel roster." />
  const returned = all.filter((t) => t.status === 'in_progress' && t.returned)
  const inHand = all.find((t) => t.status === 'in_progress')

  return (
    <div className="space-y-4 sm:space-y-5">
      <UrgentEnded personId={person.id} />
      <ShiftHeader person={person} shift={shift} tasks={all} now={now} />
      <DegradedStates person={person} inHand={offline ? inHand : undefined} />

      {offline ? null : loading ? (
        <><Skeleton className="h-72" /><Skeleton className="h-64" /></>
      ) : (
        <>
          {returned.map((t) => <ReturnedBanner key={t.id} task={t} />)}
          {next ? <UpNextCard task={next} now={now} /> : <NothingNext tasks={all} />}
          <NoticesFeed personId={person.id} />
          {all.length > 0 && <ShiftQueue tasks={all} cancelled={cancelled} now={now} nextId={next?.id} shift={shift} />}
          {shift && <FinishShift person={person} tasks={all} now={now} />}
        </>
      )}
    </div>
  )
}

// ── Header: greeting, shift, check-in, progress ────────────────────────────────

function ShiftHeader({ person, shift, tasks, now }: { person: Person; shift?: Shift; tasks: Task[]; now: number }) {
  const today = hotelDateKey(now)
  const attendance = useDB((s) => s.attendance.find((a) => a.personId === person.id && a.date === today))
  const checkinState = useDB((s) => s.connection.checkin)
  const ended = useDB((s) => s.cover.find((c) => c.personId === person.id && c.date === today && (c.kind === 'ended' || c.kind === 'early_departure')))
  const role = useDB((s) => byId(s.jobRoles, person.jobRoleId))

  const done = tasks.filter((t) => t.status === 'done').length
  const awaiting = tasks.filter((t) => t.status === 'awaiting_verification').length
  const total = tasks.length
  const start = shift ? Date.parse(shift.start) : 0
  const end = shift ? Date.parse(shift.end) : 0
  const timeLabel = !shift ? '' : now < start ? `Starts in ${fDuration(start - now)}` : now >= end ? 'Shift over' : `${fDuration(end - now)} left`

  const onCheckIn = () => {
    const offline = useDB.getState().connection.hotel === 'offline'
    useDB.getState().checkIn(person.id)
    if (offline) toast.warning('Check-in saved on this phone', { description: 'It is confirmed as soon as the hotel system is back.' })
    else toast.success('You’re checked in', { description: `${fTime(Date.now())} hotel time${shift ? ` · ${shift.name} shift` : ''}` })
  }

  return (
    <section className="card overflow-hidden" aria-label="Your shift">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-5">
        <div className="min-w-0">
          <div className="eyebrow">{fLongDate(now)}</div>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight text-ink sm:text-2xl">{greeting(now)}, {firstName(person)}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {shift ? <>{shift.name} shift · <span className="tabular">{fTime(shift.start)} – {fTime(shift.end)}</span><span className="max-sm:hidden"> · {role?.name ?? person.title}</span></> : 'You are not on today’s roster.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ended ? <Badge tone={ended.kind === 'ended' ? 'neutral' : 'warning'} size="md" dot>{ended.kind === 'ended' ? 'Shift ended' : 'Early leave sent'}</Badge>
            : attendance ? <Badge tone="success" size="md" dot>Checked in {fTime(attendance.at)}</Badge>
              : checkinState === 'attention' ? <Badge tone="warning" size="md" dot>Check-in unconfirmed</Badge>
                : <Badge tone="neutral" size="md" dot>Not checked in</Badge>}
        </div>
      </div>

      {!attendance && !ended && checkinState !== 'attention' && !(shift && now >= end) && (
        <div className="flex flex-col gap-3 border-t border-gold-500/25 bg-gold-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Check in to start your shift</div>
            <div className="text-xs text-ink-2">Your manager sees you on the floor once you check in.</div>
          </div>
          <Button variant="primary" size="lg" icon={LogIn} onClick={onCheckIn} className="max-sm:w-full">Check in</Button>
        </div>
      )}

      {shift && (
        <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
          <div className="space-y-2 px-4 py-3.5 sm:px-5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted">Rooms done</span>
              <span className="text-sm font-semibold text-ink tabular">{done}<span className="font-normal text-muted"> / {total}</span></span>
            </div>
            <Meter value={done} max={total} label="Rooms done" valueText={`${done} of ${total} rooms done`} tone="success" />
            <div className="text-2xs text-muted">{!total ? 'No rooms assigned yet' : awaiting ? `${awaiting} awaiting check` : done === total ? 'All rooms done' : `${total - done} to go`}</div>
          </div>
          <div className="space-y-2 px-4 py-3.5 sm:px-5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted">Shift time</span>
              <span className="text-sm font-semibold text-ink tabular">{timeLabel}</span>
            </div>
            <Meter value={now - start} max={end - start} label="Shift time elapsed" valueText={timeLabel} />
            <div className="flex justify-between text-2xs text-muted tabular"><span>{fTime(start)}</span><span>{fTime(end)}</span></div>
          </div>
        </div>
      )}
    </section>
  )
}

/** Two independent degraded states: check-in confirmation vs. the wider hotel system. */
function DegradedStates({ person, inHand }: { person: Person; inHand?: Task }) {
  const conn = useDB((s) => s.connection)
  const outbox = useDB((s) => s.outbox.length)
  const room = useDB((s) => byId(s.rooms, inHand?.roomId))
  const nav = useNavigate()
  const offline = conn.hotel === 'offline'
  const refresh = () => {
    useDB.getState().checkIn(person.id)
    if (useDB.getState().connection.checkin === 'ok') toast.success('Check-in confirmed', { description: `${fTime(Date.now())} hotel time` })
    else toast.error('Still could not confirm your check-in', { description: 'It stays saved on this phone. Try again in a minute.' })
  }
  const retry = () => {
    useDB.getState().setConnection({ hotel: navigator.onLine ? 'online' : 'offline' })
    if (useDB.getState().connection.hotel === 'online') toast.success('Hotel system is back', { description: outbox ? `${outbox} saved change${outbox === 1 ? '' : 's'} synced.` : 'Everything is up to date.' })
    else toast.error('Still offline', { description: 'Check the Wi-Fi and try again.' })
  }
  return (
    <>
      {conn.checkin === 'attention' && (
        <Callout tone="warning" icon={TriangleAlert} role="alert" title="Check-in needs attention"
          action={<Button size="md" variant="primary" icon={RefreshCw} disabled={offline} onClick={refresh} className="max-sm:h-11">Refresh check-in</Button>}>
          The server could not confirm your check-in. It is saved on this phone.{' '}
          <Link to="/employee/me?tab=checkins" className="link whitespace-nowrap">View check-in log</Link>
        </Callout>
      )}
      {offline && (
        <Callout tone="neutral" icon={WifiOff} role="status" title="Hotel system is offline"
          action={<Button size="md" variant="secondary" icon={RefreshCw} onClick={retry} className="max-sm:h-11">Try again</Button>}>
          Saved hotel-system details stay hidden until the server confirms this signed-in account.
          {outbox > 0 && <> <b className="font-semibold text-ink">{outbox} change{outbox === 1 ? '' : 's'}</b> waiting to sync.</>}
        </Callout>
      )}
      {offline && inHand && (
        <Callout tone="info" icon={CheckCircle2} title={`Room ${room?.number ?? ''} is still in progress`}
          action={<Button variant="primary" iconRight={ArrowRight} onClick={() => nav(`/employee/tasks/${inHand.id}`)} className="max-sm:h-11">Continue room</Button>}>
          Steps you tick are kept on this phone and sync when the connection is back.
        </Callout>
      )}
    </>
  )
}

// ── Sent back, up next ─────────────────────────────────────────────────────────

function ReturnedBanner({ task }: { task: Task }) {
  const room = useDB((s) => byId(s.rooms, task.roomId))
  const by = useDB((s) => byId(s.people, task.returned?.byId))
  const nav = useNavigate()
  if (!task.returned) return null
  return (
    <Callout tone="warning" icon={Undo2} role="alert" title={`Room ${room?.number} was sent back`}
      action={<Button variant="primary" iconRight={ArrowRight} onClick={() => nav(`/employee/tasks/${task.id}`)} className="max-sm:h-11 max-sm:w-full">Fix room</Button>}>
      <span className="text-ink">“{task.returned.note}”</span>
      <span className="mt-1 block text-xs text-muted">{by?.name ?? 'Your manager'} · {relTime(task.returned.at)}</span>
    </Callout>
  )
}

function UpNextCard({ task, now }: { task: Task; now: number }) {
  const room = useDB((s) => byId(s.rooms, task.roomId))
  const v = useDB((s) => byId(s.sopVersions, task.sopVersionId))
  const assigner = useDB((s) => byId(s.people, task.assignedById))
  const nav = useNavigate()
  const phase = taskPhase(task, now)
  const inHand = phase === 'in_progress' || phase === 'returned'
  const req = v ? requiredSteps(task, v) : []
  const doneReq = req.filter((s) => task.doneStepIds.includes(s.id)).length
  const mins = minutesBetween(task.start, task.end)
  const hint = phase === 'gated' ? 'You can read the steps before it opens.'
    : phase === 'blocked' ? 'This slot ended over an hour ago.'
      : inHand ? `Started ${task.startedAt ? fTime(task.startedAt) : ''} · ${doneReq} of ${req.length} steps done`
        : phase === 'overdue' ? `Was due by ${fTime(task.end)}` : 'Start the timer inside the room.'

  return (
    <section aria-labelledby="up-next-title" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id="up-next-title" className="eyebrow">{inHand ? 'In progress' : 'Up next'}</h2>
        <div className="flex items-center gap-1.5">
          {task.priority !== 'standard' && <Badge tone={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</Badge>}
          <PhaseBadge task={task} now={now} />
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <span className="font-display text-[64px] font-bold leading-[0.82] tracking-tight text-ink tabular" aria-label={`Room ${room?.number}`}>{room?.number}</span>
              {room?.vip && <span className="mb-1"><VipBadge /></span>}
            </div>
            <div className="mt-2.5 text-sm text-ink-2">{[room?.type, room && `Floor ${room.floor}`, room?.wing && `${room.wing} wing`].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="shrink-0 rounded-cell border border-line bg-surface-2 px-3.5 py-2.5 text-center">
            <div className="text-2xl font-semibold leading-none text-ink tabular">{mins}</div>
            <div className="mt-1 text-2xs font-medium text-muted">min</div>
          </div>
        </div>

        {(room?.occupancy || room?.guestName) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <OccupancyBadge room={room} />
            {room?.guestName && <span className="text-sm font-medium text-ink">{room.guestName}</span>}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-xs text-muted">Standard</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">{v?.title}<span className="ml-1.5 whitespace-nowrap text-xs font-normal text-muted">{v?.code} · v{v?.version}</span></dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Time window</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink tabular">{fTime(task.start)} – {fTime(task.end)}</dd>
          </div>
          {inHand && (
            <div>
              <dt className="text-xs text-muted">Progress</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink tabular">{doneReq} of {req.length} steps</dd>
            </div>
          )}
        </dl>

        {task.notes && (
          <Callout tone="gold" icon={StickyNote} title={`Note from ${assigner?.name ?? 'your manager'}`} className="mt-4">{task.notes}</Callout>
        )}
      </div>

      {phase === 'gated' && (
        <div className="flex items-center gap-2 border-t border-amber/25 bg-amber/[0.08] px-5 py-3 text-sm font-semibold text-amber" role="status">
          <Ban size={16} aria-hidden /> Do not enter yet · opens at {fTime(task.start)}
        </div>
      )}
      {phase === 'blocked' && (
        <div className="flex items-center gap-2 border-t border-danger/25 bg-danger/[0.06] px-5 py-3 text-sm font-semibold text-danger" role="alert">
          <OctagonAlert size={16} aria-hidden /> Do not enter — contact your supervisor
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted">{hint}</span>
        <Button variant={phase === 'gated' || phase === 'blocked' ? 'secondary' : 'gold'} size="lg" iconRight={ArrowRight}
          onClick={() => nav(`/employee/tasks/${task.id}`)} className="max-sm:w-full">
          {inHand ? 'Continue room' : phase === 'gated' ? 'Read room steps' : 'Open room'}
        </Button>
      </div>
    </section>
  )
}

function NothingNext({ tasks }: { tasks: Task[] }) {
  const nav = useNavigate()
  const awaiting = tasks.filter((t) => t.status === 'awaiting_verification').length
  if (!tasks.length) {
    return (
      <Card>
        <EmptyState icon={CalendarClock} title="No rooms assigned yet"
          description="New work appears here the moment your manager assigns it. While you wait, the guides for your role are a good read."
          action={<Button variant="secondary" icon={BookOpen} onClick={() => nav('/employee/guides')} className="h-11">Open guides</Button>} />
      </Card>
    )
  }
  return (
    <Card>
      <EmptyState icon={CircleCheck} title="Nothing to start right now"
        description={awaiting ? `${awaiting} room${awaiting === 1 ? ' is' : 's are'} waiting for an independent check. New rooms appear here as soon as they are assigned.` : 'Every room on your shift is done. Nice work.'} />
    </Card>
  )
}

// ── Notices ────────────────────────────────────────────────────────────────────

function NoticesFeed({ personId }: { personId: string }) {
  const notices = useDB((s) => s.notices)
  const acks = useDB((s) => s.ackEvents)
  // Notices answered on this visit stay visible (with their new status) until the person leaves the screen.
  const shown = useRef(new Set<string>())
  const visible = useMemo(() => {
    const mine = notices.filter((n) => n.sentAt && n.recipientIds.includes(personId))
    mine.forEach((n) => { if (!acks.some((a) => a.personId === personId && a.kind === 'notice' && a.refId === n.id && a.acknowledgedAt)) shown.current.add(n.id) })
    return mine.filter((n) => shown.current.has(n.id)).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))
  }, [notices, acks, personId])
  const unread = visible.filter((n) => !acks.some((a) => a.personId === personId && a.kind === 'notice' && a.refId === n.id && a.acknowledgedAt)).length
  if (!visible.length) return null
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Notices {unread > 0 && <Badge tone="danger" className="ml-1 align-middle">{unread} new</Badge>}</h2>
          <p className="text-xs text-muted">Opening or replying is never task acceptance.</p>
        </div>
        <Link to="/employee/me?tab=notices" className="link shrink-0 text-sm">History</Link>
      </div>
      <div className="divide-y divide-line">{visible.map((n) => <NoticeCard key={n.id} notice={n} personId={personId} compact />)}</div>
    </Card>
  )
}

// ── Full shift queue ───────────────────────────────────────────────────────────

type QueueFilter = 'upnext' | 'in_progress' | 'awaiting' | 'done' | 'all'

function ShiftQueue({ tasks, cancelled, now, nextId, shift }: { tasks: Task[]; cancelled: Task[]; now: number; nextId?: string; shift?: Shift }) {
  const rooms = useDB((s) => s.rooms)
  const people = useDB((s) => s.people)
  const groups = useMemo(() => ({
    upnext: tasks.filter((t) => t.status === 'scheduled' || t.status === 'ready'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    awaiting: tasks.filter((t) => t.status === 'awaiting_verification'),
    done: tasks.filter((t) => t.status === 'done'),
    all: tasks,
  }), [tasks])
  const [filter, setFilter] = useState<QueueFilter>(() => (groups.upnext.length ? 'upnext' : 'all'))
  const list = groups[filter]
  const EMPTY: Record<QueueFilter, string> = {
    upnext: 'Nothing else is queued. New rooms land here when they are assigned.', in_progress: 'No room is in progress. Open your next room to start.',
    awaiting: 'Nothing is waiting for a check.', done: 'No rooms finished yet today.', all: 'No rooms on this shift.',
  }
  return (
    <Card>
      <div className="border-b border-line px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Full shift</h2>
          <span className="text-xs text-muted tabular">{tasks.length} room{tasks.length === 1 ? '' : 's'}{shift ? ` · ${fTime(shift.start)} – ${fTime(shift.end)}` : ''}</span>
        </div>
        <div className="scrollbar-none -mx-4 mt-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented value={filter} onChange={setFilter} className="max-sm:[&>button]:min-h-10"
            items={[
              { id: 'upnext', label: 'Up next', count: groups.upnext.length },
              { id: 'in_progress', label: 'In progress', count: groups.in_progress.length },
              { id: 'awaiting', label: 'Awaiting check', count: groups.awaiting.length },
              { id: 'done', label: 'Done', count: groups.done.length },
              { id: 'all', label: 'All', count: groups.all.length },
            ]} />
        </div>
      </div>
      {list.length ? (
        <ul className="divide-y divide-line" aria-label="Rooms">{list.map((t) => <TaskRow key={t.id} task={t} now={now} highlight={t.id === nextId && filter !== 'done'} />)}</ul>
      ) : <p className="px-5 py-8 text-center text-sm text-muted">{EMPTY[filter]}</p>}
      {cancelled.length > 0 && (
        <ul className="space-y-1 rounded-b-card border-t border-line bg-surface-2 px-4 py-3 text-xs text-muted sm:px-5">
          {cancelled.map((t) => (
            <li key={t.id}><span className="font-medium text-ink-2">Room {byId(rooms, t.roomId)?.number} was cancelled</span> by {byId(people, t.cancelled?.byId)?.name ?? 'your manager'}{t.cancelled?.reason ? ` — ${t.cancelled.reason}` : ''}. No action needed.</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── End of shift ───────────────────────────────────────────────────────────────

function FinishShift({ person, tasks, now }: { person: Person; tasks: Task[]; now: number }) {
  const today = hotelDateKey(now)
  const ended = useDB((s) => s.cover.find((c) => c.personId === person.id && c.date === today && (c.kind === 'ended' || c.kind === 'early_departure')))
  const open = tasks.filter((t) => t.status === 'scheduled' || t.status === 'ready' || t.status === 'in_progress').length
  const finish = async (early: boolean) => {
    const ok = await confirm(early
      ? { title: 'Go early?', body: `${open} room${open === 1 ? ' is' : 's are'} still open. Your manager is told straight away, reviews your early leave and reassigns what is left.`, confirmLabel: 'Go early', tone: 'danger' }
      : { title: 'End your shift?', body: 'Your manager sees that you have finished for today. You can still open your rooms to read them.', confirmLabel: 'End shift' })
    if (!ok) return
    useDB.getState().endShift(person.id, early)
    if (early) toast.info('Early leave sent to your manager', { description: 'They will review it. Thank you for today.' })
    else toast.success('Shift ended', { description: 'Rest well — see you next shift.' })
  }
  if (ended) {
    return (
      <Callout tone={ended.kind === 'ended' ? 'success' : 'info'} icon={ended.kind === 'ended' ? CircleCheck : LogOut}
        title={ended.kind === 'ended' ? 'Shift ended' : 'Early leave sent'}>
        {ended.kind === 'ended' ? 'Your manager can see you have finished. Rest well.'
          : ended.status === 'pending' ? 'Your manager has been told and is reviewing it.' : ended.status === 'approved' ? 'Your manager approved your early leave.' : 'Your manager declined the early leave — please check in with them.'}
      </Callout>
    )
  }
  return (
    <Card>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Finish your shift</h2>
          <p className="mt-0.5 text-sm text-muted">{open ? `${open} room${open === 1 ? '' : 's'} still open. Use “Go early” if you must leave — your manager reviews it.` : tasks.length ? 'All your rooms are finished or waiting for a check.' : 'No rooms were assigned to you on this shift.'}</p>
        </div>
        <div className="flex gap-2 max-sm:grid max-sm:grid-cols-2">
          <Button variant="secondary" size="lg" onClick={() => finish(true)} disabled={!open}>Go early</Button>
          <Button variant="primary" size="lg" icon={LogOut} onClick={() => finish(false)} disabled={open > 0}>End shift</Button>
        </div>
      </div>
    </Card>
  )
}

/** A gentle full-screen interruption when an urgent request on one of your rooms has ended. */
function UrgentEnded({ personId }: { personId: string }) {
  const task = useDB((s) => s.tasks.find((t) => t.personId === personId && t.urgentEnded && !t.urgentEnded.seen))
  const inProgress = useDB((s) => s.tasks.find((t) => t.personId === personId && t.status === 'in_progress'))
  const rooms = useDB((s) => s.rooms)
  const versions = useDB((s) => s.sopVersions)
  return (
    <ShiftEventInterstitial
      open={!!task}
      title="Priority changed"
      lead="This urgent request has ended. Nothing changed. Carry on with your work; your manager can see it ended."
      details={task && (<>
        <div className="font-display text-3xl font-bold text-ink">Room {byId(rooms, task.roomId)?.number}</div>
        <div className="mt-1 text-sm text-muted">Reason: {task.urgentEnded!.reason}</div>
        <div className="mt-2 text-sm text-ink-2">{byId(versions, task.sopVersionId)?.title} · {minutesBetween(task.start, task.end)} min</div>
      </>)}
      actionLabel="Carry on"
      onAction={() => task && useDB.getState().markUrgentSeen(task.id)}
      footer={inProgress ? `Room ${byId(rooms, inProgress.roomId)?.number} in progress · Going now pauses nothing` : 'No room in progress · Going now pauses nothing'}
    />
  )
}

