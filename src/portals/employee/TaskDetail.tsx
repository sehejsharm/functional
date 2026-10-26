import { AlertOctagon, ArrowLeft, Ban, Flag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SopSteps } from '@/components/SopSteps'
import { Button, Drawer, Empty, Pill } from '@/components/ui'
import { byId, priorityLabel, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, fTime, minutesBetween } from '@/lib/time'
import { usePersona } from '@/shell/PortalShell'
import { isGated } from './Work'

const STATUS: Record<string, { label: string; tone: 'neutral' | 'gold' | 'ok' | 'warn' }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' }, ready: { label: 'Ready to start', tone: 'gold' },
  in_progress: { label: 'In progress', tone: 'gold' }, awaiting_verification: { label: 'Awaiting verification', tone: 'warn' }, done: { label: 'Done', tone: 'ok' },
}

export function TaskDetail() {
  const { id } = useParams()
  const { person } = usePersona('employee')
  const task = useDB((s) => byId(s.tasks, id))
  const room = useDB((s) => byId(s.rooms, task?.roomId))
  const v = useDB((s) => byId(s.sopVersions, task?.sopVersionId))
  const current = useDB((s) => s.sops.find((x) => x.id === v?.sopId)?.currentVersionId)
  const { startTask, toggleStep, attachPhoto, requestVerification, openRef, acknowledge, reportIssue, addFeedback } = useDB.getState()
  const ack = useDB((s) => s.ackEvents.find((a) => a.personId === person?.id && a.kind === 'sop' && a.refId === v?.id))
  const now = useNow(5000)
  const [issue, setIssue] = useState(false)
  const [issueText, setIssueText] = useState('')
  const [suggest, setSuggest] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  useEffect(() => { if (person && v) openRef(person.id, 'sop', v.id) }, [person, v, openRef])

  if (!task || !v || !person) return <Empty title="Room not found" action={<Link to="/employee" className="text-gold-400">Back to work</Link>} />
  const gated = isGated(task, now)
  const blocked = task.status === 'scheduled' && now > Date.parse(task.end) + 60 * 60_000
  const status = gated ? STATUS.scheduled : task.status === 'scheduled' ? STATUS.ready : STATUS[task.status]
  const interactive = task.status === 'in_progress'
  const checkSteps = v.steps.filter((s) => s.requireCheck)
  const required = task.mode === 'standard' ? v.steps.filter((s, i) => s.requireCheck || i === v.steps.length - 1) : v.steps
  const allDone = required.every((s) => task.doneStepIds.includes(s.id))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/employee" className="inline-flex items-center gap-1 text-sm text-sage-300 hover:text-white"><ArrowLeft size={16} /> Work</Link>
        <button onClick={() => setIssue(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-gold-400 hover:underline"><Flag size={14} /> Report Issue</button>
      </div>

      <header className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-6xl font-bold text-white">{room?.number}</div>
            <div className="text-sage-300">{v.title} · <span className="text-sage-200">{v.code}</span></div>
          </div>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div><dt className="text-xs text-sage-300">Target</dt><dd className="font-semibold text-white">{v.timeTargetMin} min</dd></div>
          <div><dt className="text-xs text-sage-300">Window</dt><dd className="font-semibold text-white">{fDate(task.start)} {fTime(task.start)}–{fTime(task.end)}</dd></div>
          <div><dt className="text-xs text-sage-300">Priority</dt><dd className="font-semibold text-white">{priorityLabel[task.priority]}</dd></div>
        </dl>
        {current && current !== v.id && <p className="mt-3 text-xs text-sage-300">This room stays on version {v.version}, the version it was assigned with. A newer version applies to new rooms.</p>}
      </header>

      {blocked ? (
        <div className="flex items-center gap-2 rounded-card bg-danger/15 p-4 font-semibold text-danger"><AlertOctagon size={18} /> Do not enter — contact supervisor</div>
      ) : gated ? (
        <div className="flex items-center gap-2 rounded-card bg-amber/15 p-4 font-semibold text-amber"><Ban size={18} /> Do not enter yet · this room opens at {fTime(task.start)} hotel time</div>
      ) : null}

      <SopSteps steps={v.steps} version={v.version} done={task.doneStepIds} photos={task.photoStepIds} interactive={interactive} mode={task.mode}
        onToggle={(sid) => toggleStep(task.id, sid)} onPhoto={(sid) => attachPhoto(task.id, sid)} />

      <div className="sticky bottom-24 z-10 lg:bottom-4">
        {task.status === 'scheduled' && <Button variant="gold" size="lg" className="w-full shadow-lift" disabled={gated || blocked} onClick={() => startTask(task.id)}>Start room</Button>}
        {task.status === 'in_progress' && (
          <Button variant="gold" size="lg" className="w-full shadow-lift" disabled={!allDone} onClick={() => requestVerification(task.id)}>
            {checkSteps.length ? 'Request independent verification' : 'Finish room'}
          </Button>
        )}
        {task.status === 'awaiting_verification' && <div className="card p-4 text-center text-sm text-sage-200">Waiting for a supervisor to verify. You can move to your next room.</div>}
        {task.status === 'done' && <div className="card p-4 text-center text-sm text-ok">Room complete and verified.</div>}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div><div className="font-semibold text-white">This SOP, version {v.version}</div><div className="text-xs text-sage-300">{ack?.acknowledgedAt ? `You confirmed you read this version on ${fDate(ack.acknowledgedAt)}.` : 'Confirm you have read this exact version.'}</div></div>
          {!ack?.acknowledgedAt && <Button size="sm" variant="primary" onClick={() => acknowledge(person.id, 'sop', v.id)}>I've read it</Button>}
        </div>
        <div className="mt-4 flex gap-2">
          <input className="input" placeholder="Suggest a correction to this SOP" value={suggest} onChange={(e) => setSuggest(e.target.value)} />
          <Button size="sm" variant="ghost" disabled={!suggest} onClick={() => { addFeedback('suggestion', v.id, person.id, suggest); setSuggest(''); setSent('Suggestion sent to the SOP author.') }}>Send</Button>
        </div>
        {sent && <p className="mt-2 text-xs text-ok">{sent}</p>}
        <p className="mt-2 text-[11px] text-sage-300/70">{minutesBetween(task.start, task.end)} min slot · a time target must never override safety or guest privacy.</p>
      </div>

      <Drawer open={issue} onClose={() => setIssue(false)} title={`Report an issue · Room ${room?.number}`} side="bottom">
        <p className="mb-3 text-sm text-sage-300">Your room stays open. Your supervisor sees this straight away.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {['Guest inside', 'Maintenance needed', 'Missing supplies', 'Safety concern'].map((q) => <button key={q} onClick={() => setIssueText(q)} className="rounded-pill border border-white/15 px-3 py-1 text-sm text-sage-200 hover:border-gold-500">{q}</button>)}
        </div>
        <textarea className="input min-h-24" value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder="What happened?" />
        <Button variant="gold" className="mt-3 w-full" disabled={!issueText} onClick={() => { reportIssue(task.id, person.id, issueText); setIssue(false); setIssueText(''); setSent('Issue reported to your supervisor.') }}>Send report</Button>
      </Drawer>
    </div>
  )
}
