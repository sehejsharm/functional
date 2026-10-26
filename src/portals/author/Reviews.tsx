import clsx from 'clsx'
import { ArrowLeft, ChevronDown, Lock, Rocket } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Button, Empty, PageHeader, Pill, Section } from '@/components/ui'
import { APPROVALS_REQUIRED, byId, proposeVersion, useDB } from '@/lib/db'
import { fDateTime } from '@/lib/time'
import type { SopStep, SopVersion } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'

const approvals = (v: SopVersion) => new Set(v.reviews.filter((r) => r.decision === 'approve' && !r.stepId && r.reviewerId !== v.authorId).map((r) => r.reviewerId)).size

export function ReviewsReleases() {
  const { person } = usePersona('author')
  const { sopVersions, people, audit } = useDB()
  const [hist, setHist] = useState(false)
  const queue = sopVersions.filter((v) => v.status === 'in_review' || v.status === 'changes_requested')
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Author" title="Reviews & releases" tagline="Approve or publish submitted versions." />
      <Section title="Submitted versions">
        {queue.length ? <div className="grid gap-4 md:grid-cols-2">{queue.map((v) => (
          <article key={v.id} className="card-light p-5">
            <div className="text-xs font-bold text-forest-700">{v.code} · {v.version}</div>
            <h3 className="font-display text-xl font-bold">{v.title}</h3>
            <p className="mt-2 text-sm">{v.status === 'changes_requested' ? 'Changes requested' : 'Awaiting review'} · {approvals(v)}/{APPROVALS_REQUIRED} approvals</p>
            <p className="text-sm text-muted">{v.authorId === person?.id ? 'Your version · waiting for independent review' : `By ${byId(people, v.authorId)?.name}`}</p>
            <Link to={`/author/reviews/${v.id}`}><Button size="sm" variant="primary" className="mt-4 !bg-forest-900">Open version</Button></Link>
          </article>))}</div> : <Empty title="Nothing waiting for review" body="Versions you send for review appear here." />}
      </Section>
      <div className="card">
        <button onClick={() => setHist((h) => !h)} className="flex w-full items-center justify-between p-5 text-left font-semibold text-white">Review & version history <ChevronDown size={18} className={clsx('transition', hist && 'rotate-180')} /></button>
        {hist && <ul className="border-t border-white/5 px-5 py-3 text-sm">
          {audit.filter((a) => a.action.startsWith('sop.')).map((a) => <li key={a.id} className="flex justify-between py-1.5"><span><b className="text-white">{byId(people, a.actorId)?.name}</b> · {a.action.replace('sop.', '')} · {a.detail}</span><span className="text-xs text-sage-300">{fDateTime(a.at)}</span></li>)}
        </ul>}
      </div>
    </div>
  )
}

type Diff = { kind: 'added' | 'removed' | 'reworded' | 'same'; step: SopStep; prev?: SopStep; n: number }
function diffSteps(base: SopStep[], next: SopStep[]): Diff[] {
  const out: Diff[] = next.map((s, i) => {
    const prev = base.find((b) => b.id === s.id)
    if (!prev) return { kind: 'added', step: s, n: i + 1 }
    const changed = prev.instruction !== s.instruction || prev.guestCare !== s.guestCare || prev.requireCheck !== s.requireCheck || prev.allowPhoto !== s.allowPhoto
    return { kind: changed ? 'reworded' : 'same', step: s, prev, n: i + 1 }
  })
  base.filter((b) => !next.some((s) => s.id === b.id)).forEach((b) => out.push({ kind: 'removed', step: b, n: 0 }))
  return out
}

export function VersionReview() {
  const { id } = useParams()
  const { person } = usePersona('author')
  const { sopVersions, sops, people, review, release } = useDB()
  const v = byId(sopVersions, id)
  const reviewerId = person?.id ?? ''
  const [comment, setComment] = useState('')
  const [stepComment, setStepComment] = useState<Record<string, string>>({})
  const [released, setReleased] = useState<string | null>(null)
  if (!v) return <Empty title="Version not found" />
  const current = byId(sopVersions, sops.find((s) => s.id === v.sopId)?.currentVersionId)
  const d = diffSteps(current?.steps ?? [], v.steps)
  const n = approvals(v)
  const open = v.status === 'in_review' || v.status === 'changes_requested'
  const self = reviewerId === v.authorId
  const next = proposeVersion(v, current)

  return (
    <div className="space-y-6">
      <Link to="/author/reviews" className="inline-flex items-center gap-1 text-sm text-sage-300 hover:text-white"><ArrowLeft size={14} /> Reviews & releases</Link>
      <PageHeader eyebrow={`${v.code} · ${v.version}`} title={v.title} tagline={`${n}/${APPROVALS_REQUIRED} approvals · ${v.status.replace('_', ' ')}`}
        right={released ? <Pill tone="ok">Released as {released}</Pill> : n >= APPROVALS_REQUIRED && v.status === 'in_review'
          ? <Button variant="gold" onClick={() => setReleased(release(v.id, person!.id))}><Rocket size={16} /> Release as {next.label}</Button>
          : <span title={v.status === 'in_review' ? `Needs ${APPROVALS_REQUIRED} approvals · ${n} so far` : `Cannot release while ${v.status.replace('_', ' ')}`}
              className="inline-flex cursor-not-allowed select-none items-center gap-2 rounded-xl border border-dashed border-white/25 px-4 py-2.5 text-sm font-semibold text-sage-300" aria-disabled="true">
              <Lock size={14} /> Release · {v.status === 'in_review' ? `needs ${APPROVALS_REQUIRED - n} more approval${APPROVALS_REQUIRED - n === 1 ? '' : 's'}` : v.status.replace('_', ' ')}
            </span>} />
      {released && <p className="rounded-xl bg-ok/10 p-3 text-sm text-ok">Published and effective now. Rooms already in progress stay on the version they started; new assignments use {released}.</p>}

      <Section title={current ? `Changes against current ${current.version}` : 'New SOP — no published version yet'}>
        <dl className="mb-4 flex flex-wrap gap-6 text-sm">
          <div><dt className="text-xs text-sage-300">Time target</dt><dd className={clsx(current && current.timeTargetMin !== v.timeTargetMin && 'text-amber')}>{current && current.timeTargetMin !== v.timeTargetMin ? `${current.timeTargetMin} → ` : ''}{v.timeTargetMin} min</dd></div>
          <div><dt className="text-xs text-sage-300">Steps</dt><dd>{current ? `${current.steps.length} → ` : ''}{v.steps.length}</dd></div>
          <div><dt className="text-xs text-sage-300">Release type</dt><dd>{next.structural ? 'Structural (major)' : 'Wording (minor)'}</dd></div>
        </dl>
        <ol className="space-y-2">{d.map((x) => {
          const threads = v.reviews.filter((r) => r.stepId === x.step.id)
          return (
            <li key={x.step.id + x.kind} className={clsx('rounded-xl border p-3 text-sm', { added: 'border-ok/40 bg-ok/5', removed: 'border-danger/40 bg-danger/5', reworded: 'border-amber/40 bg-amber/5', same: 'border-white/10' }[x.kind])}>
              <div className="flex items-start justify-between gap-2">
                <div>{x.kind === 'removed' ? <s className="text-sage-300">{x.step.instruction}</s> : <span className="text-white">{x.n}. {x.step.instruction}</span>}
                  {x.kind === 'reworded' && x.prev && x.prev.instruction !== x.step.instruction && <div className="mt-1 text-xs text-sage-300">was: {x.prev.instruction}</div>}</div>
                {x.kind !== 'same' && <Pill tone={x.kind === 'added' ? 'ok' : x.kind === 'removed' ? 'danger' : 'warn'}>{x.kind}</Pill>}
              </div>
              {threads.map((t) => <div key={t.id} className="mt-2 flex gap-2 text-xs"><b className="text-gold-400">{byId(people, t.reviewerId)?.name}:</b><span className="text-sage-200">{t.comment}</span></div>)}
              {open && x.kind !== 'removed' && !self && <div className="mt-2 flex gap-2">
                <input className="input !py-1 !text-xs" placeholder="Comment on this step" value={stepComment[x.step.id] ?? ''} onChange={(e) => setStepComment({ ...stepComment, [x.step.id]: e.target.value })} />
                <Button size="sm" variant="ghost" disabled={!stepComment[x.step.id]} onClick={() => { review(v.id, { reviewerId, decision: 'request_changes', comment: stepComment[x.step.id], stepId: x.step.id }); setStepComment({ ...stepComment, [x.step.id]: '' }) }}>Post</Button>
              </div>}
            </li>
          )
        })}</ol>
      </Section>

      <Section title="Decisions">
        <ul className="mb-4 space-y-2">{v.reviews.filter((r) => !r.stepId).map((r) => (
          <li key={r.id} className="flex items-center gap-3 text-sm"><Avatar initials={byId(people, r.reviewerId)?.initials ?? '?'} size={28} /><b className="text-white">{byId(people, r.reviewerId)?.name}</b>
            <Pill tone={r.decision === 'approve' ? 'ok' : r.decision === 'reject' ? 'danger' : 'warn'}>{r.decision.replace('_', ' ')}</Pill><span className="text-sage-300">{r.comment}</span></li>))}
          {!v.reviews.some((r) => !r.stepId) && <li className="text-sm text-sage-300">No decisions yet.</li>}</ul>
        {open && <>
          {self ? <p className="text-sm text-amber">This is your version. Two other authors must review it independently.</p> : (<>
            <input className="input max-w-xl" placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="mt-3 flex gap-2">
              <Button variant="gold" onClick={() => { review(v.id, { reviewerId, decision: 'approve', comment }); setComment('') }}>Approve</Button>
              <Button variant="ghost" onClick={() => { review(v.id, { reviewerId, decision: 'request_changes', comment }); setComment('') }}>Request changes</Button>
              <Button variant="danger" onClick={() => { review(v.id, { reviewerId, decision: 'reject', comment }); setComment('') }}>Reject</Button>
            </div></>)}
        </>}
        {v.status === 'changes_requested' && v.authorId === person?.id && <Link to={`/author/edit/${v.id}`} className="mt-4 inline-block text-sm text-gold-400">Edit and resubmit →</Link>}
      </Section>
    </div>
  )
}
