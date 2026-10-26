import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Ban, Clock, LogOut, Megaphone, RefreshCw, WifiOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Empty, Pill, Section, ShiftEventInterstitial, Skeleton, Tabs } from '@/components/ui'
import { byId, priorityLabel, useDB } from '@/lib/db'
import { useFirstLoad, useNow } from '@/lib/hooks'
import { fDate, fLongDate, fTime, hotelDateKey, isLive, minutesBetween, shiftWindow } from '@/lib/time'
import type { Task } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'

export function useMyTasks(personId?: string) {
  const tasks = useDB((s) => s.tasks)
  const shifts = useDB((s) => s.shifts)
  const now = useNow()
  return useMemo(() => {
    const live = shifts.find((s) => isLive(s, now) && s.memberIds.includes(personId ?? '')) ??
      shifts.find((s) => s.memberIds.includes(personId ?? ''))
    const win = live ? shiftWindow(live, now) : null
    // Today's work: every job of mine in the current shift instance, plus anything still open from earlier.
    const mine = tasks.filter((t) => t.personId === personId && ((win && Date.parse(t.start) >= win.start && Date.parse(t.start) < win.end) || (t.status !== 'done' && hotelDateKey(t.start) <= hotelDateKey(now))))
      .sort((a, b) => a.start.localeCompare(b.start))
    const open = mine.filter((t) => t.status !== 'done')
    return { shift: live, win, all: mine, open, next: open[0], upNext: open.slice(1), now }
  }, [tasks, shifts, personId, now])
}

export const isGated = (t: Task, now: number) => t.status === 'scheduled' && now < Date.parse(t.start)

export function EmployeeWork() {
  const { person } = usePersona('employee')
  const { shift, win, all, next, upNext, now } = useMyTasks(person?.id)
  const conn = useDB((s) => s.connection)
  const retryConnection = useDB((s) => s.retryConnection)
  const checkIn = useDB((s) => s.checkIn)
  const attendance = useDB((s) => s.attendance.find((a) => a.personId === person?.id && a.date === hotelDateKey(now)))
  const urgentEnded = useDB((s) => s.tasks.find((t) => t.personId === person?.id && t.urgentEnded && !t.urgentEnded.seen))
  const markSeen = useDB((s) => s.markUrgentSeen)
  const rooms = useDB((s) => s.rooms)
  const versions = useDB((s) => s.sopVersions)
  const inProgress = all.find((t) => t.status === 'in_progress')
  const [view, setView] = useState<'current' | 'full'>('current')
  const loading = useFirstLoad()

  if (!person) return null
  const start = win?.start ?? now
  const end = win?.end ?? now
  const pct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
  const offline = conn.hotel === 'offline'

  return (
    <div className="space-y-5">
      <ShiftEventInterstitial
        open={!!urgentEnded}
        title="Priority changed"
        lead="This urgent request has ended. Nothing changed. Carry on with your work; your manager can see it ended."
        details={urgentEnded && (<>
          <div className="font-display text-3xl font-bold">Room {byId(rooms, urgentEnded.roomId)?.number}</div>
          <div className="mt-1 text-muted">Reason: {urgentEnded.urgentEnded!.reason}</div>
          <div className="mt-2">{byId(versions, urgentEnded.sopVersionId)?.title} · {minutesBetween(urgentEnded.start, urgentEnded.end)} min</div>
        </>)}
        actionLabel="Carry on"
        onAction={() => urgentEnded && markSeen(urgentEnded.id)}
        footer={inProgress ? `Room ${byId(rooms, inProgress.roomId)?.number} in progress · Going now pauses nothing` : 'No room in progress · Going now pauses nothing'}
      />

      <Tabs value={view} onChange={setView} items={[{ id: 'current', label: 'Current work' }, { id: 'full', label: 'Full shift' }]} />

      {/* Two independent degraded states: check-in confirmation vs. the wider hotel system. */}
      <AnimatePresence initial={false}>
        {conn.checkin === 'attention' && (
          <motion.div key="ci" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="rounded-card border border-amber/40 bg-amber/10 p-4">
            <div className="flex items-center gap-2 font-semibold text-amber"><AlertTriangle size={16} /> Check-in needs attention</div>
            <p className="mt-1 text-sm text-sage-200">The server has not confirmed your check-in yet. It is saved on this phone and will be sent automatically.</p>
            <div className="mt-3 flex items-center gap-4">
              <Button size="sm" variant="primary" disabled={offline} onClick={retryConnection}><RefreshCw size={14} /> Refresh check-in</Button>
              <Link to="/employee/me" className="text-sm text-gold-400 hover:underline">View check-in log</Link>
            </div>
          </motion.div>
        )}
        {offline && (
          <motion.div key="hs" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="card p-4">
            <div className="flex items-center gap-2 font-semibold text-white"><WifiOff size={16} /> Hotel system is offline</div>
            <p className="mt-1 text-sm text-sage-300">Keep working from what is on this phone. Ticks and check-ins are saved here and sync in order when the hotel system answers.</p>
            <Button size="sm" variant="light" className="mt-3" onClick={retryConnection}>Try again</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (<><Skeleton className="h-36" /><Skeleton className="h-64" /></>) : view === 'current' ? (
        <>
          <Section title={<span>Today <span className="ml-2 hidden text-sm font-normal text-sage-300 sm:inline">{fLongDate(now)}</span></span>}
            right={shift && <span className="text-sm text-sage-300">{shift.name} · {fTime(start)}–{fTime(end)}</span>}>
            <div className="mb-1 flex justify-between text-xs text-sage-300"><span>{fTime(start)}</span><span className="text-gold-400">Now {fTime(now)}</span><span>{fTime(end)}</span></div>
            <div className="h-2.5 overflow-hidden rounded-pill bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-label="Shift progress">
              <motion.div className="h-full rounded-pill bg-gradient-to-r from-forest-600 to-ok" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm text-sage-300">{attendance ? `Checked in at ${fTime(attendance.at)}` : 'Not checked in yet'}</span>
              {!attendance && <Button variant="gold" size="lg" onClick={() => checkIn(person.id)}>Check in</Button>}
            </div>
          </Section>

          <NoticesFeed personId={person.id} />

          {next ? <NextCard task={next} now={now} /> : <Empty title="All caught up" body="Nothing is due right now. New rooms appear here the moment your manager assigns them." />}

          <Section title="Up next">
            {upNext.length ? (
              <ul className="space-y-2">{upNext.map((t) => <TaskRow key={t.id} task={t} />)}</ul>
            ) : <p className="text-sm text-sage-300">Nothing else queued.</p>}
          </Section>
        </>
      ) : (
        <FullShift tasks={all} personId={person.id} />
      )}
    </div>
  )
}

function NextCard({ task, now }: { task: Task; now: number }) {
  const room = useDB((s) => byId(s.rooms, task.roomId))
  const v = useDB((s) => byId(s.sopVersions, task.sopVersionId))
  const gated = isGated(task, now)
  const nav = useNavigate()
  return (
    <motion.section layoutId={`task-${task.id}`} className="card-light overflow-hidden">
      <div className="p-5">
        <div className="eyebrow !text-forest-700">Next to do</div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-7xl font-bold leading-none">{room?.number}</div>
            <div className="mt-2 text-muted">{v?.title}</div>
          </div>
          <span className="rounded-pill bg-forest-900 px-3 py-1 text-sm font-bold text-gold-400">{minutesBetween(task.start, task.end)} min</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 text-muted"><Clock size={14} /> {fDate(task.start)} · {fTime(task.start)}–{fTime(task.end)}</span>
          {task.priority !== 'standard' && <span className="rounded-pill bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">{priorityLabel[task.priority]}</span>}
        </div>
      </div>
      {gated && (
        <div className="flex items-center gap-2 bg-amber/20 px-5 py-3 text-sm font-semibold text-ink"><Ban size={16} /> Do not enter yet · opens at {fTime(task.start)}</div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-sage-200 p-4">
        <Link to={`/employee/tasks/${task.id}`} className="text-sm font-semibold text-forest-700 hover:underline">See all room steps</Link>
        <Button variant="primary" className="!bg-forest-900" onClick={() => nav(`/employee/tasks/${task.id}`)}>Open room</Button>
      </div>
    </motion.section>
  )
}

function TaskRow({ task }: { task: Task }) {
  const room = useDB((s) => byId(s.rooms, task.roomId))
  const v = useDB((s) => byId(s.sopVersions, task.sopVersionId))
  return (
    <li>
      <Link to={`/employee/tasks/${task.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-forest-950/40 px-4 py-3 hover:bg-forest-950/70">
        <div className="flex items-center gap-4">
          <span className="font-display text-2xl font-bold text-white">{room?.number}</span>
          <div><div className="text-sm text-white">{v?.title}</div><div className="text-xs text-sage-300">{fTime(task.start)} · {v?.steps[0]?.instruction.slice(0, 48)}…</div></div>
        </div>
        <div className="flex items-center gap-2">
          {task.status === 'done' ? <Pill tone="ok">Done</Pill> : task.status === 'awaiting_verification' ? <Pill tone="warn">Awaiting check</Pill> : task.status === 'in_progress' ? <Pill tone="gold">In progress</Pill> : null}
          <Pill>{minutesBetween(task.start, task.end)} min</Pill>
        </div>
      </Link>
    </li>
  )
}

function FullShift({ tasks, personId }: { tasks: Task[]; personId: string }) {
  const endShift = useDB((s) => s.endShift)
  const [ended, setEnded] = useState<null | 'ended' | 'early'>(null)
  const open = tasks.filter((t) => t.status !== 'done').length
  return (
    <div className="space-y-4">
      <Section title={`Full shift · ${tasks.length} jobs`}>
        {tasks.length ? <ul className="space-y-2">{tasks.map((t) => <TaskRow key={t.id} task={t} />)}</ul> : <Empty title="No jobs on this shift" />}
      </Section>
      <Section title="Finish">
        {ended ? (
          <p className="text-sage-200">{ended === 'early' ? 'Your manager has been told you went early. Thank you.' : 'Shift ended. Rest well.'}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button variant="gold" disabled={open > 0} onClick={() => { endShift(personId, false); setEnded('ended') }}><LogOut size={16} /> End shift</Button>
            <Button variant="ghost" onClick={() => { endShift(personId, true); setEnded('early') }}>Go early</Button>
            {open > 0 && <p className="w-full text-xs text-sage-300">{open} job{open > 1 ? 's' : ''} still open. Use "Go early" if you must leave — your manager reviews it.</p>}
          </div>
        )}
      </Section>
    </div>
  )
}

function NoticesFeed({ personId }: { personId: string }) {
  const notices = useDB((s) => s.notices.filter((n) => n.sentAt && n.recipientIds.includes(personId)))
  const acks = useDB((s) => s.ackEvents.filter((a) => a.personId === personId && a.kind === 'notice'))
  const openRef = useDB((s) => s.openRef)
  const ack = useDB((s) => s.acknowledge)
  const [reply, setReply] = useState<Record<string, string>>({})
  const [hidden, setHidden] = useState<string[]>([])
  const visible = notices.filter((n) => !hidden.includes(n.id))
  if (!visible.length) return null
  return (
    <Section title={<span className="flex items-center gap-2"><Megaphone size={16} className="text-gold-400" /> Notices</span>}>
      <ul className="space-y-3">
        {visible.map((n) => {
          const a = acks.find((x) => x.refId === n.id)
          return (
            <li key={n.id} className="rounded-xl bg-forest-950/40 p-4" onMouseEnter={() => openRef(personId, 'notice', n.id)} onFocus={() => openRef(personId, 'notice', n.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-white">{n.title}</div>
                {n.replyNeeded ? (a?.repliedAt ? <Pill tone="ok">Replied</Pill> : <Pill tone="gold">Reply needed</Pill>) : null}
              </div>
              <p className="mt-1 text-sm text-sage-300">{n.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {n.replyNeeded && !a?.repliedAt && (<>
                  <input className="input !w-auto flex-1 !py-1.5" placeholder="Reply" value={reply[n.id] ?? ''} onChange={(e) => setReply({ ...reply, [n.id]: e.target.value })} />
                  <Button size="sm" variant="gold" disabled={!reply[n.id]} onClick={() => ack(personId, 'notice', n.id, reply[n.id])}>Send</Button>
                </>)}
                {(!n.replyNeeded || a?.repliedAt) && <Button size="sm" variant="ghost" onClick={() => { ack(personId, 'notice', n.id); setHidden([...hidden, n.id]) }}>Dismiss</Button>}
              </div>
              <p className="mt-2 text-[11px] text-sage-300/70">Opening or replying is never task acceptance.</p>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
