import clsx from 'clsx'
import {
  ArrowLeft, ArrowRight, Ban, BookOpenCheck, CircleCheck, Flag, History, Info, Lock, MessageSquareText, OctagonAlert, Play, ShieldCheck, StickyNote, Undo2, WifiOff, XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, EmptyState, Select, Textarea, Timeline, type TimelineItem } from '@/components/ui'
import { useBreadcrumb } from '@/lib/crumbs'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, fDateTime, fTime, minutesBetween, MIN } from '@/lib/time'
import type { Person, SopVersion, Task } from '@/lib/types'
import { toast } from '@/lib/toast'
import { relTime, usePersona } from '@/shell/PortalShell'
import { Callout, IssueForm, OccupancyBadge, PhaseBadge, Sheet, StepList, VipBadge, type IssueDraft } from './components'
import { PRIORITY, activityLabel, fClock, fDuration, needsVerification, pickNext, requiredSteps, taskPhase } from './model'
import { useMyTasks } from './Work'

export function TaskDetail() {
  const { id } = useParams()
  const { person } = usePersona('employee')
  const task = useDB((s) => byId(s.tasks, id))
  const room = useDB((s) => byId(s.rooms, task?.roomId))
  const v = useDB((s) => byId(s.sopVersions, task?.sopVersionId))
  const currentV = useDB((s) => byId(s.sopVersions, s.sops.find((x) => x.id === v?.sopId)?.currentVersionId))
  const assigner = useDB((s) => byId(s.people, task?.assignedById))
  const openedAt = useDB((s) => s.ackEvents.find((a) => a.personId === person?.id && a.kind === 'sop' && a.refId === v?.id)?.openedAt)
  const now = useNow(5000)
  const [reporting, setReporting] = useState(false)
  useBreadcrumb(room ? `Room ${room.number}` : null)

  // Viewing the pinned version counts as opening it (never as acknowledging it).
  useEffect(() => { if (person && v && !openedAt) useDB.getState().openRef(person.id, 'sop', v.id) }, [person, v, openedAt])

  if (!task || !v || !person) {
    return (
      <Card>
        <EmptyState icon={Ban} title="Room not found" description="This room may have been reassigned or removed from your shift."
          action={<Link to="/employee" className="link">Back to my work</Link>} />
      </Card>
    )
  }

  const phase = taskPhase(task, now)
  const mine = task.personId === person.id
  const newer = currentV && currentV.id !== v.id && currentV.status === 'published' ? currentV : undefined
  const mins = minutesBetween(task.start, task.end)

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/employee" className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-cell px-2 text-sm font-medium text-ink-2 hover:bg-ink/5 hover:text-ink">
          <ArrowLeft size={16} aria-hidden /> My work
        </Link>
        {phase !== 'cancelled' && <Button variant="secondary" icon={Flag} onClick={() => setReporting(true)} className="max-sm:h-11">Report an issue</Button>}
      </div>

      <div className="space-y-4 sm:space-y-5">
        {/* Header card */}
        <section className="card overflow-hidden" aria-label="Room details">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                  <h1 className="font-display text-[56px] font-bold leading-[0.82] tracking-tight text-ink tabular">{room?.number}</h1>
                  {room?.vip && <span className="mb-0.5"><VipBadge /></span>}
                </div>
                <p className="mt-2.5 text-sm text-ink-2">{[room?.type, room && `Floor ${room.floor}`, room?.wing && `${room.wing} wing`].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <PhaseBadge task={task} now={now} size="md" />
                {task.priority !== 'standard' && <Badge tone={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</Badge>}
              </div>
            </div>
            {(room?.occupancy || room?.guestName) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <OccupancyBadge room={room} />
                {room?.guestName && <span className="text-sm font-medium text-ink">{room.guestName}</span>}
              </div>
            )}
          </div>
          <div className="border-t border-line px-5 py-4">
            <div className="text-xs text-muted">Standard</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[15px] font-semibold text-ink">{v.title}</span>
              <span className="text-xs text-muted">{v.code} · v{v.version} · {task.mode === 'standard' ? 'Standard mode' : 'Guided mode'}</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-3">
            <div className="col-span-2 border-b border-line px-5 py-3 sm:col-span-1 sm:border-b-0">
              <dt className="text-xs text-muted">Time window</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink tabular">{fTime(task.start)} – {fTime(task.end)}</dd>
            </div>
            <div className="border-line px-5 py-3 sm:border-l">
              <dt className="text-xs text-muted">Time target</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink tabular">{v.timeTargetMin} min{mins !== v.timeTargetMin && <span className="font-normal text-muted"> · {mins} min slot</span>}</dd>
            </div>
            <div className="border-l border-line px-5 py-3">
              <dt className="text-xs text-muted">{task.status === 'in_progress' ? 'Elapsed' : task.status === 'done' ? 'Time taken' : task.status === 'awaiting_verification' ? 'Started' : task.status === 'cancelled' ? 'Status' : now < Date.parse(task.start) ? 'Opens' : 'Opened'}</dt>
              <dd className="mt-0.5"><TimeFact task={task} v={v} /></dd>
            </div>
          </dl>
          {newer && (
            <div className="flex gap-2.5 border-t border-line bg-info/[0.05] px-5 py-3 text-xs text-ink-2">
              <Info size={15} className="mt-px shrink-0 text-info" aria-hidden />
              <span>This room stays on <b className="font-semibold text-ink">version {v.version}</b>, the version it was assigned with. Version {newer.version} applies to new rooms.</span>
            </div>
          )}
        </section>

        {!mine && <Callout tone="info" icon={Info} title="This room is assigned to someone else">You can read it, but only the assigned person can work it.</Callout>}

        {task.returned && task.status === 'in_progress' && (
          <ReturnedNote task={task} />
        )}
        {task.notes && (
          <Callout tone="gold" icon={StickyNote} title={`Note from ${assigner?.name ?? 'your manager'}`}>{task.notes}</Callout>
        )}
        {phase === 'cancelled' && (
          <Callout tone="neutral" icon={XCircle} title="This room was cancelled">
            <CancelledBy task={task} /> No action is needed.
          </Callout>
        )}
        {phase === 'blocked' && (
          <Callout tone="danger" icon={OctagonAlert} role="alert" title="Do not enter — contact your supervisor">This slot ended more than an hour ago. Your supervisor decides whether the room still needs doing.</Callout>
        )}
        {phase === 'gated' && (
          <Callout tone="warning" icon={Ban} role="status" title={`Do not enter yet · this room opens at ${fTime(task.start)} hotel time`}>You can read the steps now. The Start button unlocks on its own.</Callout>
        )}

        <StepList steps={v.steps} version={v.version} done={task.doneStepIds} photos={task.photoStepIds} interactive={mine && task.status === 'in_progress'} mode={task.mode}
          hideLockHint={task.status !== 'scheduled'}
          onToggle={(sid) => useDB.getState().toggleStep(task.id, sid)} onPhoto={(sid) => { useDB.getState().attachPhoto(task.id, sid); toast.success('Photo attached', { description: `Step ${v.steps.findIndex((s) => s.id === sid) + 1} · Room ${room?.number}` }) }} />

        {mine && phase !== 'cancelled' && <ActionBar task={task} v={v} person={person} roomNumber={room?.number} />}

        <ReadVersion v={v} person={person} />
        <Suggest v={v} person={person} roomNumber={room?.number} onReport={phase !== 'cancelled' ? () => setReporting(true) : undefined} />
        <Activity task={task} />
        <p className="px-1 text-center text-2xs text-muted">A time target must never override safety or guest privacy.</p>
      </div>

      <ReportSheet open={reporting} onClose={() => setReporting(false)} task={task} person={person} />
    </div>
  )
}

/** Live timer vs target while in progress; final time afterwards. Ticks on its own so the page doesn't re-render. */
function TimeFact({ task, v }: { task: Task; v: SopVersion }) {
  const now = useNow(task.status === 'in_progress' ? 1000 : 30_000)
  if (task.status === 'in_progress' && task.startedAt) {
    const ms = now - Date.parse(task.startedAt)
    const over = ms > v.timeTargetMin * MIN
    const near = !over && ms > v.timeTargetMin * MIN * 0.8
    return (
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className={clsx('tabular', over ? 'text-danger' : near ? 'text-amber' : 'text-ink')} role="timer" aria-live="off">{fClock(ms)}</span>
        <span className="text-xs font-normal text-muted">of {v.timeTargetMin}:00</span>
        {over && <Badge tone="danger">Over target</Badge>}
      </span>
    )
  }
  if (task.status === 'awaiting_verification' && task.startedAt) return <span className="text-sm font-medium text-ink tabular">{fTime(task.startedAt)} <span className="font-normal text-muted">· {relTime(task.startedAt)}</span></span>
  if (task.status === 'done' && task.startedAt) {
    const end = task.completedAt ?? task.verifiedAt
    const m = end ? minutesBetween(task.startedAt, end) : null
    return <span className="text-sm font-medium text-ink tabular">{m != null ? `${m} min` : `Started ${fTime(task.startedAt)}`}{m != null && <span className={clsx('ml-1.5 text-xs font-normal', m <= v.timeTargetMin ? 'text-ok' : 'text-amber')}>{m <= v.timeTargetMin ? 'on target' : `+${m - v.timeTargetMin} min`}</span>}</span>
  }
  if (task.status === 'cancelled') return <span className="text-sm font-medium text-muted">Cancelled</span>
  return <span className="text-sm font-medium text-ink tabular">{now < Date.parse(task.start) ? `in ${fDuration(Date.parse(task.start) - now)}` : <>{fTime(task.start)} <span className="font-normal text-muted">· {relTime(task.start)}</span></>}</span>
}

function ReturnedNote({ task }: { task: Task }) {
  const by = useDB((s) => byId(s.people, task.returned?.byId))
  if (!task.returned) return null
  return (
    <Callout tone="warning" icon={Undo2} role="alert" title={`Sent back by ${by?.name ?? 'your manager'} · ${relTime(task.returned.at)}`}>
      <span className="text-ink">“{task.returned.note}”</span>
      <span className="mt-1 block text-xs text-muted">Fix what is listed, then request the check again. Your ticked steps are kept.</span>
    </Callout>
  )
}

function CancelledBy({ task }: { task: Task }) {
  const by = useDB((s) => byId(s.people, task.cancelled?.byId))
  return <>{by?.name ?? 'Your manager'} cancelled it {task.cancelled ? relTime(task.cancelled.at) : ''}{task.cancelled?.reason ? ` — “${task.cancelled.reason}”.` : '.'}</>
}

/** Sticky primary action, always reachable above the bottom tabs. */
function ActionBar({ task, v, person, roomNumber }: { task: Task; v: SopVersion; person: Person; roomNumber?: string }) {
  const now = useNow(5000)
  const nav = useNavigate()
  const offline = useDB((s) => s.connection.hotel === 'offline')
  const outbox = useDB((s) => s.outbox.filter((o) => o.taskId === task.id).length)
  const verifier = useDB((s) => byId(s.people, task.verifiedById))
  const { all } = useMyTasks(person.id)
  const phase = taskPhase(task, now)
  const req = requiredSteps(task, v)
  const left = req.filter((s) => !task.doneStepIds.includes(s.id)).length
  const checks = needsVerification(v)
  const nextTask = pickNext(all.filter((t) => t.id !== task.id), now)
  const goNext = () => nav(nextTask ? `/employee/tasks/${nextTask.id}` : '/employee')

  const start = () => {
    useDB.getState().startTask(task.id)
    toast.success(`Room ${roomNumber} started`, { description: `Timer running · target ${v.timeTargetMin} min. Tick each step as you go.` })
  }
  const finish = () => {
    useDB.getState().requestVerification(task.id)
    const after = useDB.getState().tasks.find((t) => t.id === task.id)?.status
    if (after === 'awaiting_verification') {
      toast.success('Independent check requested', { description: `A supervisor will verify room ${roomNumber}. You can move on to your next room.`, action: nextTask ? { label: 'Open next room', onClick: goNext } : undefined })
    } else if (after === 'done') {
      toast.success(`Room ${roomNumber} complete`, { description: 'Nice work.', action: nextTask ? { label: 'Open next room', onClick: goNext } : undefined })
    } else {
      toast.error('Could not finish the room', { description: 'Tick every required step first.' })
    }
  }

  let body: ReactNode
  if (task.status === 'scheduled' || task.status === 'ready') {
    const locked = phase === 'gated' || phase === 'blocked'
    body = (
      <>
        <Hint icon={locked ? Lock : Play} tone={locked ? 'muted' : 'ink'}>
          {phase === 'gated' ? `Opens at ${fTime(task.start)} hotel time` : phase === 'blocked' ? 'Ask your supervisor before going in' : `${req.length} step${req.length === 1 ? '' : 's'} · target ${v.timeTargetMin} min`}
        </Hint>
        <Button variant="gold" size="lg" icon={locked ? Lock : Play} disabled={locked} onClick={start} className="max-sm:w-full">
          {phase === 'gated' ? `Opens at ${fTime(task.start)}` : 'Start room'}
        </Button>
      </>
    )
  } else if (task.status === 'in_progress') {
    body = (
      <>
        <Hint icon={left ? Info : CircleCheck} tone={left ? 'muted' : 'ok'}>
          {left ? `${left} required step${left === 1 ? '' : 's'} left to tick` : checks ? 'All steps done · ready for an independent check' : 'All steps done'}
          {offline && <span className="ml-1 inline-flex items-center gap-1 text-amber"><WifiOff size={12} aria-hidden /> Offline{outbox ? ` · ${outbox} saved` : ''}</span>}
        </Hint>
        <Button variant="gold" size="lg" icon={checks ? ShieldCheck : CircleCheck} disabled={left > 0} onClick={finish} className="max-sm:w-full">
          {checks ? 'Request independent verification' : 'Finish room'}
        </Button>
      </>
    )
  } else if (task.status === 'awaiting_verification') {
    body = (
      <>
        <Hint icon={ShieldCheck} tone="amber">Waiting for an independent check. You can move on.</Hint>
        <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={goNext} className="max-sm:w-full">{nextTask ? 'Next room' : 'Back to my work'}</Button>
      </>
    )
  } else {
    body = (
      <>
        <Hint icon={CircleCheck} tone="ok">Room complete{verifier ? ` · verified by ${verifier.name}${task.verifiedAt ? ` at ${fTime(task.verifiedAt)}` : ''}` : task.completedAt ? ` at ${fTime(task.completedAt)}` : ''}</Hint>
        <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={goNext} className="max-sm:w-full">{nextTask ? 'Next room' : 'Back to my work'}</Button>
      </>
    )
  }
  return (
    <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
      {/* On desktop the button sits left so toasts (bottom-right) never cover it. */}
      <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface/95 p-3 shadow-lift backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pl-5 lg:flex-row-reverse lg:justify-end lg:pl-3">
        {body}
      </div>
    </div>
  )
}

function Hint({ icon: I, tone, children }: { icon: typeof Info; tone: 'muted' | 'ink' | 'ok' | 'amber'; children: ReactNode }) {
  return (
    <p className={clsx('flex items-center gap-2 text-sm max-sm:justify-center', { muted: 'text-ink-2', ink: 'text-ink', ok: 'text-ok', amber: 'text-amber' }[tone])} aria-live="polite">
      <I size={15} className="shrink-0" aria-hidden /><span className="min-w-0">{children}</span>
    </p>
  )
}

function ReadVersion({ v, person }: { v: SopVersion; person: Person }) {
  const ack = useDB((s) => s.ackEvents.find((a) => a.personId === person.id && a.kind === 'sop' && a.refId === v.id))
  const read = () => {
    useDB.getState().acknowledge(person.id, 'sop', v.id)
    toast.success('Thanks — reading confirmed', { description: `${v.code} version ${v.version}` })
  }
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex gap-3">
          <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-cell', ack?.acknowledgedAt ? 'bg-ok/10 text-ok' : 'bg-forest-50 text-forest-700')}><BookOpenCheck size={17} aria-hidden /></span>
          <div>
            <div className="text-sm font-semibold text-ink">{v.code} · version {v.version}</div>
            <div className="text-xs text-muted">{ack?.acknowledgedAt ? `You confirmed you read this version on ${fDate(ack.acknowledgedAt)}.` : 'Confirm you have read this exact version of the standard.'}</div>
          </div>
        </div>
        {ack?.acknowledgedAt ? <span className="self-start sm:self-auto"><Badge tone="success" size="md" dot>Read</Badge></span>
          : <Button variant="secondary" onClick={read} className="max-sm:h-11 max-sm:w-full">I’ve read this version</Button>}
      </div>
    </Card>
  )
}

function Suggest({ v, person, roomNumber, onReport }: { v: SopVersion; person: Person; roomNumber?: string; onReport?: () => void }) {
  const [text, setText] = useState('')
  const [stepId, setStepId] = useState('')
  const [open, setOpen] = useState(false)
  const send = () => {
    useDB.getState().addFeedback('suggestion', v.id, person.id, text.trim(), stepId ? { stepId } : undefined)
    toast.success('Suggestion sent to the SOP author', { description: `${v.code}${stepId ? ` · step ${v.steps.findIndex((s) => s.id === stepId) + 1}` : ''}` })
    setText(''); setStepId(''); setOpen(false)
  }
  return (
    <Card>
      <CardHeader icon={MessageSquareText} title="Something not right?" description={`Report a problem in room ${roomNumber ?? ''}, or suggest a correction to this standard.`} />
      <div className="space-y-3 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {onReport && <Button variant="secondary" icon={Flag} onClick={onReport} className="h-11 justify-start">Report an issue in this room</Button>}
          <Button variant="secondary" icon={MessageSquareText} onClick={() => setOpen((o) => !o)} aria-expanded={open} className="h-11 justify-start">Suggest a correction</Button>
        </div>
        {open && (
          <div className="space-y-3 rounded-cell border border-line bg-surface-2 p-3">
            <label className="block"><span className="label">Which step?</span>
              <Select value={stepId} onChange={(e) => setStepId(e.target.value)}>
                <option value="">The whole SOP</option>
                {v.steps.map((s, i) => <option key={s.id} value={s.id}>Step {i + 1} · {s.instruction.slice(0, 60)}{s.instruction.length > 60 ? '…' : ''}</option>)}
              </Select>
            </label>
            <label className="block"><span className="label">Your suggestion</span>
              <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Say “restock minibar” explicitly in step 2 — new staff skip it." />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={!text.trim()} onClick={send}>Send suggestion</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function Activity({ task }: { task: Task }) {
  const audit = useDB((s) => s.audit)
  const people = useDB((s) => s.people)
  const items = useMemo<TimelineItem[]>(() => {
    const name = (pid?: string) => byId(people, pid)?.name ?? 'Someone'
    const entries = audit.filter((e) => e.detail === task.id || e.detail.startsWith(`${task.id}:`) || e.detail.startsWith(`${task.id} `) || e.detail.endsWith(`· ${task.id}`))
    const out: TimelineItem[] = entries.map((e) => {
      const l = activityLabel(e, name)
      return { id: e.id, title: l.title, body: l.body, tone: l.tone, meta: `${fDateTime(e.at)} · ${relTime(e.at)}` }
    })
    // Older rooms predate the audit trail: fill the obvious milestones from the task itself.
    const has = (a: string) => entries.some((e) => e.action === a)
    if (task.startedAt && !has('task.started')) out.push({ id: 'syn-start', title: `${name(task.personId)} started the room`, tone: 'info', meta: `${fDateTime(task.startedAt)} · ${relTime(task.startedAt)}` })
    if (task.verifiedAt && !has('task.verified')) out.push({ id: 'syn-ver', title: `Verified by ${name(task.verifiedById)}`, tone: 'success', meta: `${fDateTime(task.verifiedAt)} · ${relTime(task.verifiedAt)}` })
    out.push({ id: 'syn-assign', title: `Assigned by ${name(task.assignedById)}`, tone: 'brand', meta: `For ${fDate(task.start)} · ${fTime(task.start)} – ${fTime(task.end)}` })
    const at = (i: TimelineItem) => (i.id === 'syn-assign' ? '' : i.id === 'syn-start' ? task.startedAt! : i.id === 'syn-ver' ? task.verifiedAt! : entries.find((e) => e.id === i.id)!.at)
    return out.sort((a, b) => at(b).localeCompare(at(a)))
  }, [audit, people, task])
  return (
    <Card>
      <CardHeader icon={History} title="Activity" description="Everything recorded on this room today." />
      <div className="p-4 sm:p-5"><Timeline items={items} /></div>
    </Card>
  )
}

function ReportSheet({ open, onClose, task, person }: { open: boolean; onClose: () => void; task: Task; person: Person }) {
  const room = useDB((s) => byId(s.rooms, task.roomId))
  const nav = useNavigate()
  const submit = (d: IssueDraft) => {
    const issue = useDB.getState().reportIssue(task.id, person.id, d.details || d.title, { category: d.category, severity: d.severity, title: d.title })
    onClose()
    toast.success('Issue reported', {
      description: `Room ${room?.number} · your supervisor sees it now. The room stays open.`,
      action: { label: 'View in Reports', onClick: () => nav(`/employee/reports?id=${issue.id}`) },
    })
  }
  return (
    <Sheet open={open} onClose={onClose} title="Report an issue" description="Your room stays open. Your supervisor sees this straight away."
      footer={<><Button variant="secondary" onClick={onClose} className="max-sm:h-11 max-sm:flex-1">Cancel</Button><Button variant="primary" type="submit" form="room-issue" icon={Flag} className="max-sm:h-11 max-sm:flex-1">Send report</Button></>}>
      {open && <IssueForm id="room-issue" fixedRoom={room} onSubmit={submit} />}
    </Sheet>
  )
}
