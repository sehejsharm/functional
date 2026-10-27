// The task detail drawer and the task actions (verify, send back, reassign, priority, cancel) shared by
// Live tasks, the Overview queue and the Property board. Every action gives a toast; refusals say why.
import clsx from 'clsx'
import {
  AlertOctagon, ArrowRightLeft, Ban, CalendarClock, Check, CheckCircle2, Flag, History, MoreHorizontal, PlayCircle, RotateCcw, ShieldCheck, UserPlus, XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Drawer, EmptyState, KeyValue, Menu, Modal, OptionCard, ProgressBar, Timeline, Tooltip, type MenuItem, type TimelineItem } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, fTime, hotelDateKey, MIN } from '@/lib/time'
import { prompt, toast } from '@/lib/toast'
import type { Priority, Task } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { setTaskPriority, verifyAs } from './actions'
import { Callout, OccupancyChip, PersonCell, PriorityBadge, StepProgress, TaskStatusBadge, useLookups } from './components'
import { CATEGORY, PRIORITY, SEVERITY, firstName, fMinutes, fWindow, isOpen, isOverdue, taskTiming } from './model'

/** Task mutations with feedback. Each returns true when the change landed. */
export function useTaskActions() {
  const { person: me } = usePersona('manager')
  const L = useLookups()
  const label = (t: Task) => `Room ${L.room(t.roomId)?.number ?? '—'}`
  const meta = (t: Task) => { const v = L.version(t.sopVersionId); return `${L.name(t.personId)} · ${v?.code ?? ''} v${v?.version ?? ''}` }
  const actor = me?.id ?? 'elena'
  return {
    canVerify: (t: Task) => t.status === 'awaiting_verification' && t.personId !== actor,
    verify: (t: Task) => {
      const r = verifyAs(t.id, actor)
      if (r.ok) toast.success(`${label(t)} verified`, { description: meta(t) })
      else toast.error(`${label(t)} not verified`, { description: r.reason })
      return r.ok
    },
    sendBack: async (t: Task) => {
      if (t.personId === actor) { toast.error('You can’t check your own room', { description: 'Another manager has to verify or send it back.' }); return false }
      const note = await prompt({
        title: `Send ${label(t).toLowerCase()} back?`, body: `${firstName(L.person(t.personId))} sees your note and the room returns to in progress.`,
        input: { label: 'What needs fixing?', placeholder: 'e.g. Mirror has streaks; replace the bath mat', required: true }, confirmLabel: 'Send back', tone: 'danger',
      })
      if (!note) return false
      const ok = useDB.getState().returnTask(t.id, actor, note)
      if (ok) toast.warning(`${label(t)} sent back`, { description: `${firstName(L.person(t.personId))} will see: “${note}”` })
      else toast.error('Couldn’t send this room back', { description: 'It is no longer waiting for verification.' })
      return ok
    },
    cancel: async (t: Task) => {
      const reason = await prompt({
        title: `Cancel ${label(t).toLowerCase()}?`, body: 'The room comes off the employee’s list straight away. This can’t be undone; assign it again if needed.',
        input: { label: 'Reason', placeholder: 'e.g. Guest extended stay — do not disturb', required: true }, confirmLabel: 'Cancel task', cancelLabel: 'Keep task', tone: 'danger',
      })
      if (!reason) return false
      const ok = useDB.getState().cancelTask(t.id, actor, reason)
      if (ok) toast.success(`${label(t)} cancelled`, { description: reason })
      else toast.error('Couldn’t cancel this task', { description: 'It has already finished or been cancelled.' })
      return ok
    },
    setPriority: (t: Task, p: Priority) => {
      const ok = setTaskPriority(t.id, p, actor)
      if (ok) toast.success(`${label(t)} set to ${PRIORITY[p].label.toLowerCase()} priority`, { description: p === 'urgent' ? `${firstName(L.person(t.personId))} sees it at the top of their list.` : undefined })
      return ok
    },
  }
}

/** Staff who can take these rooms: rostered on each task's shift, with each task's SOP job role. */
function useEligible(tasks: Task[]) {
  const { people, shifts, sopVersions, cover, tasks: all } = useDB()
  const now = useNow(60_000)
  return useMemo(() => {
    const today = hotelDateKey(now)
    const fits = (pid: string) => tasks.every((t) => {
      const v = byId(sopVersions, t.sopVersionId), sh = byId(shifts, t.shiftId), p = byId(people, pid)
      return !!p && !!v && !!sh && sh.memberIds.includes(pid) && p.jobRoleId === v.jobRoleId
    })
    return people.filter((p) => fits(p.id)).map((p) => {
      const mine = all.filter((t) => t.personId === p.id && hotelDateKey(t.start) === today && isOpen(t))
      const away = p.status === 'on_leave' ? 'On leave' : cover.some((c) => c.kind === 'time_off' && c.status === 'approved' && c.personId === p.id && c.date === today) ? 'Time off today' : null
      return { person: p, open: mine.length, minutes: mine.reduce((a, t) => a + (Date.parse(t.end) - Date.parse(t.start)) / MIN, 0), away }
    }).sort((a, b) => a.open - b.open)
  }, [tasks, people, shifts, sopVersions, cover, all, now])
}

export function ReassignDialog({ tasks, open, onClose, onDone }: { tasks: Task[]; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { person: me } = usePersona('manager')
  const L = useLookups()
  const movable = tasks.filter(isOpen)
  const eligible = useEligible(movable)
  const [pick, setPick] = useState('')
  const single = movable.length === 1 ? movable[0] : null
  const submit = () => {
    let ok = 0
    movable.forEach((t) => { if (useDB.getState().reassignTask(t.id, pick, me?.id ?? 'elena')) ok++ })
    const skipped = tasks.length - ok
    if (ok) toast.success(single ? `Room ${L.room(single.roomId)?.number} moved to ${L.name(pick)}` : `${ok} room${ok === 1 ? '' : 's'} moved to ${L.name(pick)}`,
      { description: skipped ? `${skipped} skipped — already finished, cancelled or theirs already.` : 'Progress so far is kept.' })
    else toast.error('Nothing was reassigned', { description: 'Those rooms are finished, cancelled or already with that person.' })
    setPick(''); onClose(); onDone?.()
  }
  const shiftNames = [...new Set(movable.map((t) => byId(useDB.getState().shifts, t.shiftId)?.name))].join(', ')
  return (
    <Modal open={open} onClose={() => { setPick(''); onClose() }} size="md"
      title={single ? `Reassign room ${L.room(single.roomId)?.number}` : `Reassign ${movable.length} rooms`}
      description={`Showing ${shiftNames || 'rostered'} shift staff who do this job. Steps already ticked stay ticked.`}
      footer={<><Button variant="secondary" onClick={() => { setPick(''); onClose() }}>Cancel</Button><Button variant="primary" icon={ArrowRightLeft} disabled={!pick} onClick={submit}>{pick ? `Move to ${firstName(L.person(pick))}` : 'Choose someone'}</Button></>}>
      {!movable.length ? <EmptyState compact title="Nothing to reassign" description="Finished and cancelled rooms can’t move." /> : !eligible.length ? (
        <EmptyState compact icon={UserPlus} title="No one else can take this" description="Nobody else rostered on this shift does this job. Arrange backup cover first."
          action={<Link to="/manager/shift-cover" className="link text-sm">Open shift cover</Link>} />
      ) : (
        <div className="grid gap-2" role="radiogroup" aria-label="Choose a staff member">
          {eligible.map(({ person: p, open: n, minutes, away }) => {
            const current = single?.personId === p.id
            return (
              <OptionCard key={p.id} selected={pick === p.id} disabled={current || !!away} onClick={() => setPick(p.id)}>
                <div className="flex items-center gap-3 pr-6">
                  <Avatar name={p.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{p.name}{current && <span className="ml-2 text-xs font-normal text-muted">Current</span>}</div>
                    <div className="text-xs text-muted">{p.title} · {n} open room{n === 1 ? '' : 's'} · {fMinutes(Math.round(minutes))} booked</div>
                  </div>
                  {away && <Badge tone="warning">{away}</Badge>}
                </div>
              </OptionCard>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export function TaskDrawer({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const now = useNow(15_000)
  const nav = useNavigate()
  const { tasks, audit, issues, shifts } = useDB()
  const { person: me } = usePersona('manager')
  const L = useLookups()
  const A = useTaskActions()
  const [reassign, setReassign] = useState(false)
  const t = byId(tasks, taskId)
  const v = t && L.version(t.sopVersionId)
  const room = t && L.room(t.roomId)

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!t) return []
    const items: (TimelineItem & { at: string })[] = []
    const assigned = audit.find((a) => a.action === 'task.assigned' && a.detail.startsWith(`${t.roomId} → `) && a.detail.includes(`(${t.sopVersionId})`) && hotelDateKey(a.at) === hotelDateKey(t.start))
    items.push({ id: 'assigned', at: assigned?.at ?? '', icon: CalendarClock, tone: 'brand', title: <>Assigned by <b>{L.name(t.assignedById)}</b></>, meta: assigned ? `${fDateTime(assigned.at)} · window ${fWindow(t)}` : `Window ${fWindow(t)}` })
    audit.filter((a) => a.detail.startsWith(`${t.id} `) || a.detail.startsWith(`${t.id}:`) || a.detail === t.id).forEach((a) => {
      const [, rest] = a.detail.split(/: | → /)
      if (a.action === 'task.reassigned') items.push({ id: a.id, at: a.at, icon: ArrowRightLeft, tone: 'info', title: <>Moved to <b>{L.name(rest)}</b> by {L.name(a.actorId)}</>, meta: fDateTime(a.at) })
      if (a.action === 'task.priority_changed') items.push({ id: a.id, at: a.at, icon: Flag, tone: 'warning', title: <>Priority set to <b>{rest}</b> by {L.name(a.actorId)}</>, meta: fDateTime(a.at) })
      if (a.action === 'task.verification_requested') items.push({ id: a.id, at: a.at, icon: ShieldCheck, tone: 'warning', title: 'Asked for verification', meta: fDateTime(a.at) })
      if (a.action === 'task.returned') items.push({ id: a.id, at: a.at, icon: RotateCcw, tone: 'danger', title: <>Sent back by <b>{L.name(a.actorId)}</b></>, meta: fDateTime(a.at), body: `“${rest}”` })
    })
    if (t.returned && !items.some((i) => i.at === t.returned!.at)) items.push({ id: 'ret', at: t.returned.at, icon: RotateCcw, tone: 'danger', title: <>Sent back by <b>{L.name(t.returned.byId)}</b></>, meta: fDateTime(t.returned.at), body: `“${t.returned.note}”` })
    if (t.startedAt) items.push({ id: 'start', at: t.startedAt, icon: PlayCircle, tone: 'info', title: <><b>{L.name(t.personId)}</b> started the room</>, meta: fDateTime(t.startedAt) })
    if (t.completedAt) items.push({ id: 'done', at: t.completedAt, icon: CheckCircle2, tone: 'success', title: t.verifiedById ? 'Finished and passed verification' : 'Finished — no independent check needed', meta: fDateTime(t.completedAt) })
    if (t.verifiedAt && t.verifiedById) items.push({ id: 'ver', at: t.verifiedAt, icon: ShieldCheck, tone: 'success', title: <>Verified by <b>{L.name(t.verifiedById)}</b></>, meta: fDateTime(t.verifiedAt) })
    if (t.cancelled) items.push({ id: 'cx', at: t.cancelled.at, icon: Ban, tone: 'neutral', title: <>Cancelled by <b>{L.name(t.cancelled.byId)}</b></>, meta: fDateTime(t.cancelled.at), body: t.cancelled.reason })
    return items.sort((a, b) => (a.at || '0').localeCompare(b.at || '0'))
  }, [t, audit, L])

  if (!t || !v || !room) {
    return (
      <Drawer open={!!taskId} onClose={onClose} title="Task not found" width="lg">
        <EmptyState icon={History} title="This task isn’t available" description="It may have been created in another browser or removed by a demo reset." action={<Button variant="secondary" onClick={onClose}>Close</Button>} />
      </Drawer>
    )
  }

  const timing = taskTiming(t, v, now)
  const own = t.personId === me?.id
  const linked = issues.filter((i) => i.taskId === t.id || (i.roomId === t.roomId && i.status !== 'resolved'))
  const open = isOpen(t)
  const overdue = isOverdue(t, now)
  const shift = byId(shifts, t.shiftId)
  const priorityItems: MenuItem[] = [{ heading: 'Priority' }, ...(['standard', 'high', 'urgent'] as Priority[]).map((p) => ({
    label: PRIORITY[p].label, icon: t.priority === p ? Check : undefined, hint: t.priority === p ? 'Current' : undefined, disabled: t.priority === p, onClick: () => A.setPriority(t, p),
  }))]
  const more: MenuItem[] = [...priorityItems, 'separator',
    { label: 'Reassign…', icon: ArrowRightLeft, onClick: () => setReassign(true) },
    { label: 'Log an incident for this room', icon: AlertOctagon, onClick: () => nav(`/manager/incidents?new=1&room=${t.roomId}&task=${t.id}`) },
    'separator', { label: 'Cancel task…', icon: XCircle, danger: true, onClick: () => A.cancel(t) }]

  const footer = t.status === 'awaiting_verification' ? (
    <>
      <Menu width={240} label="More actions" trigger={({ toggle }) => <Button variant="ghost" icon={MoreHorizontal} onClick={toggle}>More</Button>} items={more} />
      <Button variant="secondary" icon={RotateCcw} onClick={() => A.sendBack(t)} disabled={own}>Send back</Button>
      {own ? (
        <Tooltip label="You worked this room, so someone else must verify it."><Button variant="primary" icon={ShieldCheck} disabled>Record verification</Button></Tooltip>
      ) : <Button variant="primary" icon={ShieldCheck} onClick={() => A.verify(t)}>Record verification</Button>}
    </>
  ) : open ? (
    <>
      <Button variant="ghost" icon={XCircle} className="mr-auto text-danger hover:bg-danger/5 hover:text-danger" onClick={() => A.cancel(t)}>Cancel task</Button>
      <Menu width={220} label="Change priority" trigger={({ toggle }) => <Button variant="secondary" icon={Flag} onClick={toggle}>Priority</Button>} items={priorityItems} />
      <Button variant="primary" icon={ArrowRightLeft} onClick={() => setReassign(true)}>Reassign</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => nav(`/manager/tasks?room=${t.roomId}`)} icon={History}>Room history</Button>
      <Button variant="secondary" onClick={onClose}>Close</Button>
    </>
  )

  return (
    <>
      <Drawer open={!!taskId} onClose={onClose} width="lg" footer={footer}
        title={<span className="flex items-center gap-2">Room {room.number}<span className="text-sm font-normal text-muted">· {room.type}</span></span>}
        description={`${v.title} · ${v.code} v${v.version}`}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge task={t} now={now} />
            <PriorityBadge priority={t.priority} />
            <Badge tone="brand">{t.mode === 'standard' ? 'Standard mode' : 'Guided mode'}</Badge>
            <Badge tone="neutral"><ShieldCheck size={11} aria-hidden /> Pinned to v{v.version}</Badge>
          </div>

          {t.status === 'awaiting_verification' && (own
            ? <Callout tone="neutral" title="You can’t verify this room">You worked it yourself. Another manager has to record the check.</Callout>
            : <Callout tone="warning" icon={ShieldCheck} title="Ready for your check">Walk the guest path, then record verification or send it back with a note.</Callout>)}
          {t.returned && t.status === 'in_progress' && <Callout tone="danger" icon={RotateCcw} title={`Sent back by ${L.name(t.returned.byId)} · ${fTime(t.returned.at)}`}>“{t.returned.note}”</Callout>}
          {overdue && <Callout tone="danger" title={t.status === 'scheduled' ? 'Not started and past its finish time' : 'Running past its finish time'}>Due {fTime(t.end)}. Reassign it or raise the priority so {firstName(L.person(t.personId))} sees it first.</Callout>}
          {t.cancelled && <Callout tone="neutral" icon={Ban} title={`Cancelled by ${L.name(t.cancelled.byId)} · ${fDateTime(t.cancelled.at)}`}>{t.cancelled.reason}</Callout>}
          {t.notes && <Callout tone="info" title="Note for the employee">{t.notes}</Callout>}

          <div className="card-inset p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink-2">Time on room</span>
              <span className="tabular text-ink"><b className={clsx(timing.over && 'text-danger')}>{timing.elapsed == null ? 'Not started' : `${timing.elapsed} min`}</b><span className="text-muted"> / {timing.target} min target</span></span>
            </div>
            <ProgressBar value={timing.elapsed ?? 0} max={timing.target} tone={timing.over ? 'danger' : t.status === 'done' ? 'success' : 'brand'} label="Time on room against SOP target" />
          </div>

          <KeyValue columns={2} items={[
            ['Staff member', <PersonCell key="p" person={L.person(t.personId)} sub={L.person(t.personId)?.title} size={24} />],
            ['Guest', <span key="g" className="flex flex-col gap-0.5">{room.guestName ?? 'No guest in residence'}<OccupancyChip occ={room.occupancy} /></span>],
            ['Window · hotel time', fWindow(t)],
            ['Shift', shift ? `${shift.name} · ${fTime(shift.start)} – ${fTime(shift.end)}` : '—'],
            ['Location', `Floor ${room.floor} · ${room.wing} wing${room.vip ? ' · VIP' : ''}`],
            ['Assigned by', L.name(t.assignedById)],
            ['Started', t.startedAt ? fDateTime(t.startedAt) : '—'],
            ['Verified', t.verifiedById ? `${L.name(t.verifiedById)} · ${fTime(t.verifiedAt!)}` : v.steps.some((s) => s.requireCheck) ? 'Needs an independent check' : 'No check needed'],
          ]} />

          <section aria-label="Steps">
            <h3 className="mb-2 text-sm font-semibold text-ink">Step progress</h3>
            <StepProgress version={v} task={t} />
          </section>

          <section aria-label="Timeline">
            <h3 className="mb-3 text-sm font-semibold text-ink">Timeline</h3>
            <Timeline items={timeline} />
          </section>

          {linked.length > 0 && (
            <section aria-label="Incidents">
              <h3 className="mb-2 text-sm font-semibold text-ink">Incidents for this room</h3>
              <ul className="divide-y divide-line rounded-cell border border-line">
                {linked.map((i) => (
                  <li key={i.id}><Link to={`/manager/incidents?id=${i.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-surface-2">
                    <span className="min-w-0"><span className="block truncate font-medium text-ink">{i.title}</span><span className="text-xs text-muted">{CATEGORY[i.category]} · {i.status.replace('_', ' ')}</span></span>
                    <Badge tone={SEVERITY[i.severity].tone} dot>{SEVERITY[i.severity].label}</Badge>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </Drawer>
      <ReassignDialog tasks={[t]} open={reassign} onClose={() => setReassign(false)} />
    </>
  )
}
