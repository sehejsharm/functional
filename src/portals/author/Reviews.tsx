import clsx from 'clsx'
import {
  ArrowRight, CheckCircle2, CircleSlash, Clock, FilePen, FileText, GitPullRequestArrow, History, Lock, MessageSquare, MessageSquarePlus, Pin, Rocket, ShieldCheck, Sparkles, UserCheck, Users, XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Avatar, Badge, Button, Card, CardHeader, DataTable, EmptyState, Modal, PageHeader, ProgressBar, Select, StatCard, Tabs, Textarea, Timeline, type Column, type TimelineItem,
} from '@/components/ui'
import { useBreadcrumb } from '@/lib/crumbs'
import { APPROVALS_REQUIRED, byId, proposeVersion, useDB } from '@/lib/db'
import { fDate, fDateTime, fTime } from '@/lib/time'
import { prompt, toast } from '@/lib/toast'
import type { ReviewDecision, SopVersion } from '@/lib/types'
import { relTime, usePersona } from '@/shell/PortalShell'
import { approvalCount, approversOf, currentOf, pinnedTasks, quorumMet, sinceDays } from './actions'
import { ApprovalMeter, DiffView, PersonChip, VersionStatusBadge, VersionTag, useSopCommands } from './components'
import type { StepDiff } from './diff'

/** Demo reviewers. In production each reviewer signs in with their own account. */
const REVIEWERS = ['marco', 'leah']
type TabId = 'awaiting' | 'changes' | 'released' | 'rejected'

const changeKind = (db: ReturnType<typeof useDB.getState>, v: SopVersion) => {
  const ref = v.status === 'published' || v.status === 'superseded' ? byId(db.sopVersions, v.baseVersionId) : currentOf(db, v.sopId)
  const against = ref && ref.id !== v.id ? ref : undefined
  if (!against) return { label: 'New SOP', tone: 'brand' as const }
  return proposeVersion(v, against).structural ? { label: 'Structural', tone: 'warning' as const } : { label: 'Wording', tone: 'neutral' as const }
}

export function ReviewsReleases() {
  const db = useDB()
  const nav = useNavigate()
  const [tab, setTab] = useState<TabId>('awaiting')
  const awaiting = db.sopVersions.filter((v) => v.status === 'in_review')
  const changes = db.sopVersions.filter((v) => v.status === 'changes_requested')
  const released = db.sopVersions.filter((v) => (v.status === 'published' || v.status === 'superseded') && sinceDays(v.publishedAt, 30))
  const rejected = db.sopVersions.filter((v) => v.status === 'rejected')
  const ready = awaiting.filter(quorumMet)
  const rows = { awaiting, changes, released, rejected }[tab]

  const when = (v: SopVersion) => (tab === 'released' ? v.publishedAt : v.submittedAt ?? v.updatedAt) ?? v.updatedAt
  const columns: Column<SopVersion>[] = [
    { key: 'sop', header: 'SOP', sort: (v) => v.code, csv: (v) => `${v.code} — ${v.title}`,
      cell: (v) => <div className="min-w-[180px]"><div className="font-mono text-[13px] font-semibold text-ink">{v.code}</div><div className="text-sm text-ink-2">{v.title}</div></div> },
    { key: 'version', header: 'Version', sort: (v) => v.version, csv: (v) => v.version,
      cell: (v) => { const k = changeKind(db, v); return <span className="inline-flex flex-wrap items-center gap-1.5"><VersionTag label={v.version} /><Badge tone={k.tone}>{k.label}</Badge></span> } },
    { key: 'author', header: 'Author', hideOnMobile: true, sort: (v) => byId(db.people, v.authorId)?.name, csv: (v) => byId(db.people, v.authorId)?.name, cell: (v) => <PersonChip id={v.authorId} size={22} /> },
    { key: 'when', header: tab === 'released' ? 'Released' : 'Submitted', sort: when, csv: (v) => fDateTime(when(v)), hideOnMobile: true,
      cell: (v) => <span className="whitespace-nowrap text-ink-2" title={fDateTime(when(v))}>{relTime(when(v))}</span> },
    { key: 'approvals', header: 'Approvals', sort: (v) => approvalCount(v), csv: (v) => `${approvalCount(v)}/${APPROVALS_REQUIRED}`, cell: (v) => <ApprovalMeter v={v} /> },
    { key: 'next', header: 'Next step', hideOnMobile: true, cell: (v) => {
      if (v.status === 'in_review') return quorumMet(v) ? <Badge tone="gold" dot>Ready to release</Badge> : <Badge tone="info" dot>Needs {APPROVALS_REQUIRED - approvalCount(v)} more approval{APPROVALS_REQUIRED - approvalCount(v) === 1 ? '' : 's'}</Badge>
      if (v.status === 'changes_requested') return <Badge tone="warning" dot>With the author</Badge>
      if (v.status === 'rejected') return <Badge tone="danger" dot>Closed</Badge>
      return <Badge tone="success" dot>{v.status === 'published' ? 'Live' : 'Superseded'}</Badge>
    } },
    { key: 'open', header: <span className="relative block w-px"><span className="sr-only">Open</span></span>, align: 'right',
      cell: (v) => <Button size="xs" variant={v.status === 'in_review' && quorumMet(v) ? 'gold' : 'secondary'} onClick={(e) => { e.stopPropagation(); nav(`/author/reviews/${v.id}`) }}>
        {v.status === 'in_review' ? (quorumMet(v) ? 'Release' : 'Review') : 'Open'}</Button> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Hotel standards" title="Reviews & releases"
        description={`A version reaches staff only after ${APPROVALS_REQUIRED} independent approvals and an explicit release. Authors can never approve their own work.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Awaiting review" value={awaiting.length} icon={GitPullRequestArrow} hint={awaiting.length ? `oldest ${relTime([...awaiting].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))[0].submittedAt ?? awaiting[0].updatedAt)}` : 'queue is clear'} />
        <StatCard label="Ready to release" value={ready.length} icon={Rocket} hint={ready.length ? 'quorum met' : 'none yet'} />
        <StatCard label="Changes requested" value={changes.length} icon={FilePen} hint="with the author" />
        <StatCard label="Released · 30 days" value={released.length} icon={CheckCircle2} hint={released[0] ? `latest ${fDate([...released].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0].publishedAt!)}` : undefined} />
      </div>
      <div>
        <Tabs value={tab} onChange={setTab} className="mb-4" items={[
          { id: 'awaiting', label: 'Awaiting review', count: awaiting.length }, { id: 'changes', label: 'Changes requested', count: changes.length },
          { id: 'released', label: 'Released recently', count: released.length }, { id: 'rejected', label: 'Rejected', count: rejected.length },
        ]} />
        <DataTable key={tab} rows={rows} columns={columns} rowKey={(v) => v.id} onRowClick={(v) => nav(`/author/reviews/${v.id}`)} search={(v) => `${v.code} ${v.title} ${v.version}`}
          searchPlaceholder="Search code or title" initialSort={{ key: 'when', dir: 'desc' }} exportName={`mise-reviews-${tab}`} caption="Versions"
          empty={<EmptyState compact icon={tab === 'awaiting' ? Sparkles : History} title={{ awaiting: 'Nothing waiting for review', changes: 'No versions are waiting on their author', released: 'Nothing released in the last 30 days', rejected: 'No rejected versions' }[tab]}
            description={tab === 'awaiting' ? 'Versions sent for review appear here with their approval progress.' : undefined} />} />
      </div>
    </div>
  )
}

export function VersionReview() {
  const { id } = useParams()
  const db = useDB()
  const nav = useNavigate()
  const cmd = useSopCommands()
  const { person } = usePersona('author')
  const me = person?.id ?? 'amina'
  const v = byId(db.sopVersions, id)
  useBreadcrumb(v ? `${v.code} ${v.version}` : null)
  const firstPending = v ? REVIEWERS.find((r) => !v.reviews.some((x) => x.reviewerId === r && !x.stepId && x.decision === 'approve')) : undefined
  const [reviewer, setReviewer] = useState(firstPending ?? REVIEWERS[0])
  const [comment, setComment] = useState('')
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releasedAs, setReleasedAs] = useState<string | null>(null)
  const [commentFor, setCommentFor] = useState<string | null>(null)
  const [stepText, setStepText] = useState('')

  const timeline = useMemo(() => (v ? buildTimeline(v, db) : []), [v, db])
  if (!v) return <EmptyState icon={FileText} title="Version not found" description="It may have been a draft that was deleted." action={<Link to="/author/reviews" className="link text-sm">Back to reviews</Link>} />

  const current = currentOf(db, v.sopId)
  const live = current && current.id !== v.id ? current : undefined
  const base = v.status === 'published' || v.status === 'superseded' ? byId(db.sopVersions, v.baseVersionId) : live
  const n = approvalCount(v), need = Math.max(0, APPROVALS_REQUIRED - n)
  const open = v.status === 'in_review' || v.status === 'changes_requested'
  const isAuthor = reviewer === v.authorId
  const next = proposeVersion(v, live)
  const pinned = pinnedTasks(db, live?.id)
  const inProgress = pinned.filter((t) => t.status !== 'scheduled').length
  const role = db.jobRoles.find((r) => r.id === v.jobRoleId)
  const audience = db.people.filter((p) => p.jobRoleId === v.jobRoleId && p.status !== 'inactive').length
  const name = (pid?: string) => byId(db.people, pid)?.name ?? 'Someone'
  const decisionOf = (pid: string) => [...v.reviews].reverse().find((r) => r.reviewerId === pid && !r.stepId)
  const mine = decisionOf(reviewer)

  const decide = async (decision: ReviewDecision['decision']) => {
    if (isAuthor || !open) return
    let text = comment.trim()
    if (decision !== 'approve') {
      const r = await prompt({
        title: decision === 'reject' ? `Reject ${v.code} ${v.version}?` : 'Request changes',
        body: decision === 'reject' ? 'A rejected version can never be released. The author can start a new revision.' : 'The version goes back to the author to edit and resubmit. Approvals so far are cleared on resubmission.',
        input: { label: decision === 'reject' ? 'Reason for rejecting' : 'What needs to change?', required: true, placeholder: decision === 'reject' ? 'e.g. This duplicates FO-CHECKIN; merge it there instead.' : 'e.g. Add the grout check before the supervisor inspection.' },
        confirmLabel: decision === 'reject' ? 'Reject version' : 'Request changes', tone: decision === 'reject' ? 'danger' : 'primary',
      })
      if (r == null) return
      text = r
    }
    db.review(v.id, { reviewerId: reviewer, decision, comment: text || 'Approved.' })
    setComment('')
    const after = byId(useDB.getState().sopVersions, v.id)!
    if (decision === 'approve') {
      const c = approvalCount(after)
      toast.success(`Approved by ${name(reviewer)}`, { description: c >= APPROVALS_REQUIRED ? 'Both approvals are in — this version is ready to release.' : `${c} of ${APPROVALS_REQUIRED} approvals. One more independent reviewer is needed.` })
      const other = REVIEWERS.find((r) => r !== reviewer && !decisionOf(r))
      if (other && c < APPROVALS_REQUIRED) setReviewer(other)
    } else if (decision === 'request_changes') toast.warning('Changes requested', { description: `${v.code} ${v.version} is back with ${name(v.authorId)}.` })
    else toast.error(`${v.code} ${v.version} rejected`, { description: 'It can’t be released. The author can start a new revision.' })
  }
  const postStep = (stepId: string) => {
    if (!stepText.trim()) return
    db.review(v.id, { reviewerId: reviewer, decision: 'request_changes', comment: stepText.trim(), stepId })
    setStepText(''); setCommentFor(null)
    toast.success('Comment added', { description: `${name(reviewer)} on step ${v.steps.findIndex((s) => s.id === stepId) + 1}` })
  }
  const doRelease = () => {
    const label = db.release(v.id, me)
    setReleaseOpen(false)
    if (!label) { toast.error('Could not release', { description: `It needs ${APPROVALS_REQUIRED} independent approvals and must still be in review.` }); return }
    setReleasedAs(label)
    toast.success(`${v.code} ${label} released`, { description: live ? `Effective now. ${pinned.length} assigned room${pinned.length === 1 ? '' : 's'} stay on ${live.version}.` : 'Effective now. Managers can assign it.' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const stepExtra = (d: StepDiff) => {
    if (d.kind === 'removed') return null
    const threads = v.reviews.filter((r) => r.stepId === d.step.id)
    const canComment = open && !isAuthor
    if (!threads.length && !canComment) return null
    return (
      <div className={clsx('ml-10 space-y-2', threads.length ? 'mt-3 border-t border-line pt-2.5' : 'mt-2')}>
        {threads.map((t) => (
          <div key={t.id} className="flex items-start gap-2 text-sm">
            <Avatar name={name(t.reviewerId)} size={22} />
            <div className="min-w-0"><span className="font-semibold text-ink">{name(t.reviewerId)}</span> <span className="text-xs text-muted">{relTime(t.at)}</span><p className="text-ink-2">{t.comment}</p></div>
          </div>
        ))}
        {canComment && (commentFor === d.step.id ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea rows={2} autoFocus aria-label={`Comment on step ${d.n}`} value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder={`Comment on step ${d.n} as ${name(reviewer)}`} className="text-sm" />
            <div className="flex gap-1.5"><Button size="sm" variant="primary" disabled={!stepText.trim()} onClick={() => postStep(d.step.id)}>Post</Button><Button size="sm" variant="ghost" onClick={() => { setCommentFor(null); setStepText('') }}>Cancel</Button></div>
          </div>
        ) : <button type="button" onClick={() => { setCommentFor(d.step.id); setStepText('') }} className="inline-flex items-center gap-1.5 text-xs font-medium text-forest-700 hover:underline"><MessageSquarePlus size={13} /> Comment on this step</button>)}
      </div>
    )
  }

  const released = releasedAs ?? (v.status === 'published' ? v.version : null)
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Review · ${v.code}`} title={v.title}
        back={{ to: '/author/reviews', label: 'Reviews & releases' }}
        meta={<>
          <VersionStatusBadge status={v.status} />
          <VersionTag label={v.version} />
          <span className="inline-flex items-center gap-1"><Users size={13} /> by {name(v.authorId)}</span>
          {v.submittedAt && <span className="inline-flex items-center gap-1" title={fDateTime(v.submittedAt)}><Clock size={13} /> submitted {relTime(v.submittedAt)}</span>}
          <span>{v.steps.length} steps · {v.timeTargetMin} min · {role?.name}</span>
        </>}
        actions={<ReleaseControl v={v} need={need} label={next.label} released={released} onRelease={() => setReleaseOpen(true)} onOpenSop={() => nav(`/author/sops/${v.sopId}`)} />} />

      {released && (
        <div className="flex flex-wrap items-center gap-4 rounded-card border border-ok/30 bg-ok/[0.06] p-4 sm:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok/15 text-ok"><CheckCircle2 size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-ink">{releasedAs ? `Released as v${released} · effective now` : `Published v${released}${v.publishedAt ? ` · ${fDateTime(v.publishedAt)}` : ''}`}</div>
            <p className="mt-0.5 text-sm text-ink-2">New assignments use v{released}. Rooms that were already assigned keep the version they were given until they finish. {role ? `${audience} staff (${role.name}) are asked to acknowledge it.` : ''}</p>
          </div>
          <div className="flex gap-2"><Button onClick={() => nav('/author/reviews')}>Back to reviews</Button><Button variant="primary" iconRight={ArrowRight} onClick={() => nav(`/author/sops/${v.sopId}`)}>Open SOP</Button></div>
        </div>
      )}
      {v.status === 'changes_requested' && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-amber/30 bg-amber/[0.07] px-4 py-3">
          <MessageSquare size={18} className="text-amber" />
          <div className="min-w-0 flex-1 text-sm"><b className="text-ink">Changes requested</b> <span className="text-ink-2">— “{[...v.reviews].reverse().find((r) => r.decision === 'request_changes' && !r.stepId)?.comment}”</span></div>
          {v.authorId === me && <Button size="sm" variant="primary" icon={FilePen} onClick={() => nav(`/author/edit/${v.id}`)}>Edit and resubmit</Button>}
        </div>
      )}
      {v.status === 'rejected' && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3">
          <XCircle size={18} className="text-danger" />
          <div className="min-w-0 flex-1 text-sm"><b className="text-ink">Rejected</b> <span className="text-ink-2">— “{[...v.reviews].reverse().find((r) => r.decision === 'reject')?.comment}”</span></div>
          <Button size="sm" onClick={() => cmd.revise(v.sopId)}>Start a new revision</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader icon={GitPullRequestArrow} title={base ? `Changes against v${base.version}${base.id === current?.id ? ' (published)' : ''}` : 'New SOP — nothing published to compare against'}
            description={base ? `Releases as v${released ?? next.label} · ${next.structural || !live ? 'structural (major)' : 'wording (minor)'} change` : 'Every step below is new. Read each one as staff would.'} />
          <div className="p-4 sm:p-5"><DiffView base={base} next={v} baseLabel={base ? `v${base.version}` : undefined} nextLabel={`v${v.version}`} extra={stepExtra} defaultScope={base ? undefined : 'all'} /></div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={UserCheck} title="Approvals" description={`${n} of ${APPROVALS_REQUIRED} independent approvals`} />
            <div className="space-y-4 p-5">
              <ProgressBar value={n} max={APPROVALS_REQUIRED} tone={n >= APPROVALS_REQUIRED ? 'success' : 'brand'} />
              <ul className="space-y-3">
                {REVIEWERS.map((rid) => {
                  const d = decisionOf(rid)
                  return (
                    <li key={rid} className="flex items-start gap-3">
                      <Avatar name={name(rid)} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-ink">{name(rid)}</span>
                          {d ? <Badge tone={d.decision === 'approve' ? 'success' : d.decision === 'reject' ? 'danger' : 'warning'} dot>{d.decision === 'approve' ? 'Approved' : d.decision === 'reject' ? 'Rejected' : 'Requested changes'}</Badge> : <Badge dot>Waiting</Badge>}</div>
                        <div className="text-xs text-muted">{byId(db.people, rid)?.title}{d ? ` · ${relTime(d.at)}` : ''}</div>
                        {d?.comment && <p className="mt-1 text-sm text-ink-2">“{d.comment}”</p>}
                      </div>
                    </li>
                  )
                })}
                <li className="flex items-start gap-3 rounded-cell bg-surface-2 p-2.5">
                  <Avatar name={name(v.authorId)} size={30} />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium text-ink">{name(v.authorId)}</span><Badge>Author</Badge></div>
                    <div className="text-xs text-muted">Wrote this version — their approval never counts toward the {APPROVALS_REQUIRED}.</div></div>
                </li>
              </ul>
            </div>
          </Card>

          {open && (
            <Card>
              <CardHeader icon={ShieldCheck} title="Your decision" description="Demo: choose who is reviewing. In production each reviewer signs in as themselves." />
              <div className="space-y-4 p-5">
                <label className="block"><span className="label">Review as</span>
                  <Select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
                    {REVIEWERS.map((rid) => <option key={rid} value={rid}>{name(rid)} · {byId(db.people, rid)?.title}</option>)}
                    <option value={v.authorId}>{name(v.authorId)} · author of this version</option>
                  </Select></label>
                {isAuthor ? (
                  <div role="note" className="flex gap-2.5 rounded-cell border border-amber/30 bg-amber/[0.07] p-3 text-sm text-ink">
                    <CircleSlash size={16} className="mt-0.5 shrink-0 text-amber" />
                    <span><b>{name(v.authorId)} wrote this version, so their approval doesn’t count.</b> Two people other than the author must approve before it can be released.</span>
                  </div>
                ) : <>
                  {mine && <p className="text-xs text-muted">{name(reviewer)} already {mine.decision === 'approve' ? 'approved' : mine.decision === 'reject' ? 'rejected' : 'requested changes'} {relTime(mine.at)}. A new decision replaces it.</p>}
                  <label className="block"><span className="label">Comment <span className="font-normal text-muted">(optional when approving)</span></span>
                    <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Clear and practical; the check is in the right place." /></label>
                </>}
                <div className="grid gap-2">
                  <Button variant="primary" icon={CheckCircle2} disabled={isAuthor || (mine?.decision === 'approve')} onClick={() => decide('approve')}>{mine?.decision === 'approve' ? `Approved by ${name(reviewer).split(' ')[0]}` : 'Approve'}</Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button icon={MessageSquare} disabled={isAuthor} onClick={() => decide('request_changes')}>Request changes</Button>
                    <Button icon={XCircle} disabled={isAuthor} onClick={() => decide('reject')} className="text-danger hover:!border-danger/40">Reject</Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader icon={History} title="Review history" />
            <div className="p-5"><Timeline items={timeline} /></div>
          </Card>
        </div>
      </div>

      <Modal open={releaseOpen} onClose={() => setReleaseOpen(false)} size="md" title={`Release ${v.code} v${next.label}?`}
        description={`Effective immediately — ${fTime(Date.now())} hotel time. This is recorded in the audit log.`}
        footer={<><Button onClick={() => setReleaseOpen(false)}>Cancel</Button><Button variant="gold" icon={Rocket} onClick={doRelease}>Release v{next.label}</Button></>}>
        <ul className="space-y-3 text-sm">
          {live && <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-info/10 text-info"><Pin size={15} /></span>
            <span><b className="text-ink">{pinned.length ? `${pinned.length} room${pinned.length === 1 ? '' : 's'} stay on v${live.version}` : `No rooms are assigned on v${live.version} right now`}</b><br />
              <span className="text-ink-2">{pinned.length ? `${inProgress} in progress and ${pinned.length - inProgress} scheduled were assigned on v${live.version}. They stay pinned to it until they finish — nobody’s checklist changes mid-room.` : 'Nothing in flight is affected.'}</span></span></li>}
          {!live && <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-info/10 text-info"><Pin size={15} /></span>
            <span><b className="text-ink">Nothing in flight to migrate</b><br /><span className="text-ink-2">This is the first version, so no rooms are pinned to an older one.</span></span></li>}
          <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ok/10 text-ok"><ArrowRight size={15} /></span>
            <span><b className="text-ink">New assignments use v{next.label}</b><br /><span className="text-ink-2">From the moment you release, managers assign this version.{live ? ` v${live.version} becomes superseded and stays readable in history.` : ''}</span></span></li>
          <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-50 text-gold-700"><Users size={15} /></span>
            <span><b className="text-ink">{audience} staff{role ? ` (${role.name})` : ''} asked to acknowledge</b><br /><span className="text-ink-2">Acknowledgment is tracked per version, so everyone confirms they have read v{next.label}.</span></span></li>
        </ul>
        <div className="mt-4 rounded-cell bg-surface-2 p-3 text-xs text-ink-2">
          <span className="font-semibold text-ink">Approved by </span>{approversOf(v).map(name).join(' and ')} · {next.structural || !live ? 'structural' : 'wording'} change · {v.steps.length} steps
        </div>
      </Modal>
    </div>
  )
}

function ReleaseControl({ v, need, label, released, onRelease, onOpenSop }: { v: SopVersion; need: number; label: string; released: string | null; onRelease: () => void; onOpenSop: () => void }) {
  if (released) return <Button variant="primary" iconRight={ArrowRight} onClick={onOpenSop}>Open SOP</Button>
  if (v.status === 'in_review' && need === 0) return <Button variant="gold" size="lg" icon={Rocket} onClick={onRelease}>Release as v{label}</Button>
  const why = v.status === 'in_review' ? `needs ${need} more approval${need === 1 ? '' : 's'}` : v.status === 'changes_requested' ? 'changes requested' : v.status === 'rejected' ? 'rejected' : v.status === 'superseded' ? 'superseded' : v.status.replace('_', ' ')
  return (
    <span role="button" aria-disabled="true" tabIndex={0} title={v.status === 'in_review' ? `Release unlocks after ${APPROVALS_REQUIRED} independent approvals` : `A version that is ${why} can’t be released`}
      className={clsx('inline-flex h-11 cursor-not-allowed select-none items-center gap-2 rounded-cell border border-dashed border-line-strong bg-surface-2 px-4 text-sm font-semibold text-muted')}>
      <Lock size={15} /> Release · {why}
    </span>
  )
}

function buildTimeline(v: SopVersion, db: ReturnType<typeof useDB.getState>): TimelineItem[] {
  const name = (pid?: string) => byId(db.people, pid)?.name ?? 'Someone'
  const items: (TimelineItem & { at: string })[] = [
    { id: 'created', at: v.createdAt, icon: FilePen, tone: 'neutral', title: <><b className="font-semibold">{name(v.authorId)}</b> started this version</>, meta: fDateTime(v.createdAt) },
  ]
  if (v.submittedAt) items.push({ id: 'submitted', at: v.submittedAt, icon: GitPullRequestArrow, tone: 'info', title: <><b className="font-semibold">{name(v.authorId)}</b> sent it for review</>, meta: fDateTime(v.submittedAt) })
  v.reviews.forEach((r) => items.push({
    id: r.id, at: r.at, icon: r.stepId ? MessageSquare : r.decision === 'approve' ? CheckCircle2 : r.decision === 'reject' ? XCircle : MessageSquare,
    tone: r.stepId ? 'neutral' : r.decision === 'approve' ? 'success' : r.decision === 'reject' ? 'danger' : 'warning',
    title: <><b className="font-semibold">{name(r.reviewerId)}</b> {r.stepId ? `commented on step ${v.steps.findIndex((s) => s.id === r.stepId) + 1}` : r.decision === 'approve' ? 'approved' : r.decision === 'reject' ? 'rejected it' : 'requested changes'}</>,
    meta: fDateTime(r.at), body: r.comment ? `“${r.comment}”` : undefined,
  }))
  if (v.publishedAt) items.push({ id: 'published', at: v.publishedAt, icon: Rocket, tone: 'success', title: <>Released as <b className="font-semibold">v{v.version}</b></>, meta: fDateTime(v.publishedAt) })
  return items.sort((a, b) => b.at.localeCompare(a.at))
}
