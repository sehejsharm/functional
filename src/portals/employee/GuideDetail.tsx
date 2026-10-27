import clsx from 'clsx'
import { ArrowLeft, Archive, BookOpenCheck, BookX, ChevronRight, History, MessageSquareText, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Card, CardHeader, EmptyState, Select, Textarea } from '@/components/ui'
import { useBreadcrumb } from '@/lib/crumbs'
import { byId, useDB } from '@/lib/db'
import { fDate, fTime } from '@/lib/time'
import type { Person, SopVersion } from '@/lib/types'
import { toast } from '@/lib/toast'
import { usePersona } from '@/shell/PortalShell'
import { PhaseBadge, StarRating, StepList } from './components'
import { ReadBadge, deptIcon, readState } from './Guides'
import { useMyTasks } from './Work'

export function EmployeeGuideDetail() {
  const { sopId } = useParams()
  const { person } = usePersona('employee')
  const sop = useDB((s) => s.sops.find((x) => x.id === sopId))
  const v = useDB((s) => byId(s.sopVersions, sop?.currentVersionId))
  const versions = useDB((s) => s.sopVersions)
  const acks = useDB((s) => s.ackEvents)
  const role = useDB((s) => byId(s.jobRoles, v?.jobRoleId))
  const retiredBy = useDB((s) => byId(s.people, sop?.retiredById))
  const readable = !!sop && !sop.retiredAt && v?.status === 'published'
  useBreadcrumb(v?.code ?? sop?.code ?? null)

  const openedAt = acks.find((a) => a.personId === person?.id && a.kind === 'sop' && a.refId === v?.id)?.openedAt
  useEffect(() => { if (readable && person && v && !openedAt) useDB.getState().openRef(person.id, 'sop', v.id) }, [readable, person, v, openedAt])

  const back = (
    <Link to="/employee/guides" className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-cell px-2 text-sm font-medium text-ink-2 hover:bg-ink/5 hover:text-ink">
      <ArrowLeft size={16} aria-hidden /> Guides
    </Link>
  )

  if (!sop || !v || !readable || !person) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          {sop?.retiredAt ? (
            <EmptyState icon={Archive} title={`${sop.code} has been retired`}
              description={`${retiredBy?.name ?? 'The standards team'} retired this guide on ${fDate(sop.retiredAt)}. It is kept for history but is no longer used for work.`}
              action={<Link to="/employee/guides" className="link">Browse current guides</Link>} />
          ) : (
            <EmptyState icon={BookX} title="This guide isn’t available"
              description={sop ? 'It has no published version yet. It appears here once the standards team releases it.' : 'The link may be out of date, or the guide was removed.'}
              action={<Link to="/employee/guides" className="link">Browse current guides</Link>} />
          )}
        </Card>
      </div>
    )
  }

  const state = readState(sop, v, acks, versions, person.id)
  const I = deptIcon(sop.department)
  return (
    <div className="space-y-4 sm:space-y-5">
      {back}

      <section className="card overflow-hidden" aria-labelledby="guide-title">
        <div className="flex items-start gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-cell bg-forest-50 text-forest-700"><I size={22} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{sop.department ?? 'Hotel standard'}</div>
            <h1 id="guide-title" className="mt-1 text-[22px] font-semibold leading-tight text-ink sm:text-2xl">{v.title}</h1>
            <div className="mt-2"><ReadBadge state={state} /></div>
          </div>
        </div>
        <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
          {([
            ['Code', v.code], ['Version', `v${v.version}`],
            ['Effective', v.effectiveAt ? fDate(v.effectiveAt) : '—'], ['Time target', `${v.timeTargetMin} min`],
            ['Role', role?.name ?? '—'], ['Steps', `${v.steps.length} (${v.steps.filter((s) => s.requireCheck).length} checked)`],
            ['Language', v.language], ['Department', sop.department ?? '—'],
          ] as const).map(([k, val], i) => (
            <div key={k} className={clsx('min-w-0 border-line px-5 py-3', i % 2 === 1 && 'border-l', i >= 2 && 'border-t', 'sm:border-l-0 sm:border-t-0', i % 4 !== 0 && 'sm:border-l', i >= 4 && 'sm:border-t')}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-ink">{val}</dd>
            </div>
          ))}
        </dl>
      </section>

      <TodayRooms sopId={sop.id} personId={person.id} />
      <StepList steps={v.steps} version={v.version} reader title="Steps" />
      <Acknowledge v={v} person={person} state={state} />

      <Rate v={v} person={person} />
      <SuggestCorrection v={v} person={person} />
      <VersionHistory sopId={sop.id} currentId={v.id} />
    </div>
  )
}

function Acknowledge({ v, person, state }: { v: SopVersion; person: Person; state: ReturnType<typeof readState> }) {
  const read = () => {
    useDB.getState().acknowledge(person.id, 'sop', v.id)
    toast.success('Thanks — reading confirmed', { description: `${v.code} version ${v.version}` })
  }
  const done = state.kind === 'read'
  return (
    <div className={clsx('flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5', done ? 'border-ok/25 bg-ok/[0.05]' : 'border-forest-700/15 bg-forest-50')}>
      <div className="flex gap-3">
        <BookOpenCheck size={20} className={clsx('mt-0.5 shrink-0', done ? 'text-ok' : 'text-forest-700')} aria-hidden />
        <div>
          <div className="text-sm font-semibold text-ink">{done ? 'You’ve read this version' : state.kind === 'updated' ? `Updated since you read v${state.from}` : 'Confirm you’ve read it'}</div>
          <div className="text-xs text-ink-2">{done ? `Confirmed on ${fDate(state.at)} at ${fTime(state.at)}.` : 'Read every step, then confirm. Your confirmation is recorded against this exact version.'}</div>
        </div>
      </div>
      {!done && <Button variant="primary" icon={BookOpenCheck} onClick={read} className="max-sm:h-11 max-sm:w-full">I’ve read this version</Button>}
    </div>
  )
}

function TodayRooms({ sopId, personId }: { sopId: string; personId: string }) {
  const { all, now } = useMyTasks(personId)
  const versions = useDB((s) => s.sopVersions)
  const rooms = useDB((s) => s.rooms)
  const mine = all.filter((t) => byId(versions, t.sopVersionId)?.sopId === sopId)
  if (!mine.length) return null
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink sm:px-5">Your rooms today using this guide</div>
      <ul className="divide-y divide-line">
        {mine.map((t) => (
          <li key={t.id}>
            <Link to={`/employee/tasks/${t.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
              <span className="text-sm font-semibold text-ink tabular">Room {byId(rooms, t.roomId)?.number}</span>
              <span className="text-xs text-muted tabular">{fTime(t.start)} – {fTime(t.end)} · v{byId(versions, t.sopVersionId)?.version}</span>
              <span className="ml-auto"><PhaseBadge task={t} now={now} /></span>
              <ChevronRight size={16} className="text-line-strong" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Rate({ v, person }: { v: SopVersion; person: Person }) {
  const feedback = useDB((s) => s.feedback)
  const ratings = feedback.filter((f) => f.lane === 'rating' && f.sopVersionId === v.id && f.rating)
  const mine = ratings.filter((f) => f.fromId === person.id).sort((a, b) => b.at.localeCompare(a.at))[0]
  const avg = ratings.length ? ratings.reduce((a, f) => a + (f.rating ?? 0), 0) / ratings.length : 0
  const [value, setValue] = useState(0)
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState(false)
  const send = () => {
    // One rating per person per version: a new rating replaces the old one.
    useDB.setState((s) => ({ feedback: s.feedback.filter((f) => !(f.lane === 'rating' && f.sopVersionId === v.id && f.fromId === person.id)) }))
    useDB.getState().addFeedback('rating', v.id, person.id, comment.trim(), { rating: value })
    toast.success('Rating sent', { description: `${value} out of 5 for ${v.code} v${v.version}. Thank you.` })
    setValue(0); setComment(''); setEditing(false)
  }
  const showForm = !mine || editing
  return (
    <Card>
      <CardHeader icon={Star} title="How clear is this guide?" description={ratings.length ? `${avg.toFixed(1)} average from ${ratings.length} rating${ratings.length === 1 ? '' : 's'} on this version` : 'No ratings on this version yet'} />
      <div className="space-y-3 p-4 sm:p-5">
        {showForm ? (
          <>
            <StarRating value={value} onChange={setValue} />
            {value > 0 && (
              <>
                <label className="block"><span className="label">Anything to add? <span className="font-normal text-muted">(optional)</span></span>
                  <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={value <= 3 ? 'What made it hard to follow?' : 'What works well?'} /></label>
                <div className="flex justify-end gap-2">
                  {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
                  <Button variant="primary" onClick={send} className="max-sm:h-11">Send rating</Button>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StarRating value={mine.rating ?? 0} size={20} />
              <span className="text-sm text-ink-2">You rated this {mine.rating}/5 on {fDate(mine.at)}{mine.text ? ` — “${mine.text}”` : ''}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(true); setValue(mine.rating ?? 0) }}>Change</Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function SuggestCorrection({ v, person }: { v: SopVersion; person: Person }) {
  const feedback = useDB((s) => s.feedback)
  const versions = useDB((s) => s.sopVersions)
  const mine = useMemo(() => feedback.filter((f) => f.lane === 'suggestion' && f.fromId === person.id && byId(versions, f.sopVersionId)?.sopId === v.sopId), [feedback, versions, person.id, v.sopId])
  const [text, setText] = useState('')
  const [stepId, setStepId] = useState('')
  const send = () => {
    useDB.getState().addFeedback('suggestion', v.id, person.id, text.trim(), stepId ? { stepId } : undefined)
    toast.success('Suggestion sent to the SOP author', { description: `${v.code}${stepId ? ` · step ${v.steps.findIndex((s) => s.id === stepId) + 1}` : ''}` })
    setText(''); setStepId('')
  }
  return (
    <Card>
      <CardHeader icon={MessageSquareText} title="Suggest a correction" description="Spotted something out of date or unclear? The author reviews every suggestion." />
      <div className="space-y-3 p-4 sm:p-5">
        <label className="block"><span className="label">Which step?</span>
          <Select value={stepId} onChange={(e) => setStepId(e.target.value)} className="max-sm:h-11">
            <option value="">The whole guide</option>
            {v.steps.map((s, i) => <option key={s.id} value={s.id}>Step {i + 1} · {s.instruction.slice(0, 60)}{s.instruction.length > 60 ? '…' : ''}</option>)}
          </Select>
        </label>
        <label className="block"><span className="label">Your suggestion</span>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say what should change and why." /></label>
        <div className="flex justify-end"><Button variant="primary" disabled={!text.trim()} onClick={send} className="max-sm:h-11 max-sm:w-full">Send suggestion</Button></div>
        {mine.length > 0 && (
          <div className="border-t border-line pt-3">
            <div className="mb-2 text-xs font-medium text-muted">Your suggestions</div>
            <ul className="space-y-2">
              {mine.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 text-ink-2">“{f.text}” <span className="text-xs text-muted">· v{byId(versions, f.sopVersionId)?.version} · {fDate(f.at)}</span></span>
                  <Badge tone={f.status === 'done' ? 'success' : 'neutral'}>{f.status === 'done' ? 'Addressed' : 'With the author'}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

function VersionHistory({ sopId, currentId }: { sopId: string; currentId: string }) {
  const history = useDB((s) => s.sopVersions).filter((x) => x.sopId === sopId && (x.status === 'published' || x.status === 'superseded'))
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
  if (history.length < 2) return null
  return (
    <Card>
      <CardHeader icon={History} title="Version history" description="Rooms already assigned stay on the version they were given." />
      <ul className="divide-y divide-line">
        {history.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
            <span><span className="font-semibold text-ink">v{h.version}</span><span className="ml-2 text-muted">{h.steps.length} steps · {h.timeTargetMin} min</span></span>
            <span className="flex items-center gap-2 text-xs text-muted">{h.effectiveAt && `Effective ${fDate(h.effectiveAt)}`}<Badge tone={h.id === currentId ? 'success' : 'neutral'}>{h.id === currentId ? 'Current' : 'Superseded'}</Badge></span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
