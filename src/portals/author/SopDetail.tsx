import clsx from 'clsx'
import {
  Archive, ArchiveRestore, ArrowLeftRight, BookOpenText, CheckCircle2, Clock, Copy, Download, FilePen, FileText, GitPullRequestArrow, History, ListChecks, MessageSquare,
  MoreHorizontal, PlayCircle, Rocket, ShieldCheck, Smartphone, Timer, Users, XCircle,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, IconButton, KeyValue, Menu, PageHeader, ProgressBar, Segmented, Select, StatCard, Tabs, Timeline, type Column, type TimelineItem,
} from '@/components/ui'
import { stats } from '@/lib/analytics'
import { useBreadcrumb } from '@/lib/crumbs'
import { downloadCsv } from '@/lib/csv'
import { byId, useDB } from '@/lib/db'
import { fDate, fDateTime, hotelDateKey, minutesBetween } from '@/lib/time'
import type { SopVersion } from '@/lib/types'
import { relTime, usePersona } from '@/shell/PortalShell'
import { ackRate, approversOf, auditFor, currentOf, departmentOf, humanAction, humanDetail, openRevisionOf, versionsOf, type RowStatus } from './actions'
import { ApprovalMeter, DiffView, PersonChip, RowStatusBadge, StaffPreview, StepDocument, VersionStatusBadge, VersionTag, useSopCommands } from './components'
import { FeedbackCard } from './Feedback'

type TabId = 'overview' | 'versions' | 'feedback' | 'activity'
const DAY = 86_400_000

export function SopDetail() {
  const { sopId = '' } = useParams()
  const db = useDB()
  const nav = useNavigate()
  const cmd = useSopCommands()
  const { person } = usePersona('author')
  const [tab, setTab] = useState<TabId>('overview')
  const [view, setView] = useState<'document' | 'staff'>('document')

  const versions = useMemo(() => versionsOf(db, sopId), [db, sopId])
  const sop = byId(db.sops, sopId)
  const current = currentOf(db, sopId)
  const open = openRevisionOf(db, sopId)
  const shown = current ?? open ?? versions[0]
  useBreadcrumb(shown?.code || null)

  const vids = useMemo(() => new Set(versions.map((v) => v.id)), [versions])
  const feedback = db.feedback.filter((f) => vids.has(f.sopVersionId))
  const activity = useMemo(() => auditFor(db, sopId), [db, sopId])

  if (!shown) return <EmptyState icon={FileText} title="SOP not found" description="It may have been a draft that was deleted." action={<Link to="/author" className="link text-sm">Back to the SOP library</Link>} />

  const retired = !!sop?.retiredAt
  const status: RowStatus = retired ? 'retired' : current ? 'published' : ((open?.status ?? (shown.status === 'rejected' ? 'rejected' : 'draft')) as RowStatus)
  const role = db.jobRoles.find((r) => r.id === shown.jobRoleId)
  const department = departmentOf(db, sopId, shown.jobRoleId)
  const mineOpen = open && open.authorId === person?.id && open.status !== 'in_review'
  const openFb = feedback.filter((f) => f.status === 'open').length

  const exportSteps = () => downloadCsv(`${shown.code}-${shown.version}-steps.csv`, [
    ['Step', 'Instruction', 'Guest care', 'Independent check', 'Photo allowed'],
    ...shown.steps.map((s, i) => [i + 1, s.instruction, s.guestCare, s.requireCheck ? 'Yes' : 'No', s.allowPhoto ? 'Yes' : 'No']),
  ])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={department} title={shown.title || 'Untitled SOP'}
        meta={<>
          <span className="font-mono text-[13px] font-semibold text-ink">{shown.code}</span>
          <RowStatusBadge status={status} />
          <VersionTag label={shown.version} draft={!current} />
          {current?.effectiveAt && <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} /> Effective {fDate(current.effectiveAt)}</span>}
          {role && <span className="inline-flex items-center gap-1"><Users size={13} /> {role.name}</span>}
          <span className="inline-flex items-center gap-1"><Timer size={13} /> {shown.timeTargetMin} min target</span>
          <span className="inline-flex items-center gap-1"><ListChecks size={13} /> {shown.steps.length} steps</span>
        </>}
        actions={<>
          <Button icon={Copy} onClick={() => cmd.duplicate(sopId)}>Duplicate</Button>
          {!retired && <Button variant="primary" icon={FilePen} onClick={() => cmd.revise(sopId)}>{mineOpen ? 'Continue revision' : 'Start revision'}</Button>}
          {retired && <Button variant="primary" icon={ArchiveRestore} onClick={() => cmd.restore(sopId)}>Restore</Button>}
          <Menu label="More actions" trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="More actions" variant="secondary" onClick={toggle} />} items={[
            { label: 'Export steps (CSV)', icon: Download, onClick: exportSteps },
            ...(open ? [{ label: open.status === 'draft' ? 'Open draft' : 'Open review', icon: GitPullRequestArrow, onClick: () => nav(open.status === 'draft' ? `/author/edit/${open.id}` : `/author/reviews/${open.id}`) }] : []),
            'separator' as const,
            retired ? { label: 'Restore', icon: ArchiveRestore, onClick: () => cmd.restore(sopId) } : { label: 'Retire SOP', icon: Archive, danger: true, disabled: !sop, onClick: () => cmd.retire(sopId) },
          ]} />
        </>}>
        <Tabs value={tab} onChange={setTab} items={[
          { id: 'overview', label: 'Overview' }, { id: 'versions', label: 'Versions', count: versions.length },
          { id: 'feedback', label: 'Feedback', count: openFb || undefined }, { id: 'activity', label: 'Activity', count: activity.length },
        ]} />
      </PageHeader>

      {retired && (
        <Banner tone="neutral" icon={Archive} title={`Retired ${fDate(sop!.retiredAt!)} by ${byId(db.people, sop!.retiredById)?.name ?? 'an author'}`}
          body="Managers can’t assign it. Its versions, results and audit history stay readable." action={<Button size="sm" icon={ArchiveRestore} onClick={() => cmd.restore(sopId)}>Restore</Button>} />
      )}
      {!retired && open && (
        <Banner tone={open.status === 'changes_requested' ? 'warning' : 'info'} icon={GitPullRequestArrow}
          title={open.status === 'in_review' ? `Revision ${open.version} is in review` : open.status === 'changes_requested' ? `Revision ${open.version} needs changes` : `${open.authorId === person?.id ? 'Your' : 'A'} draft ${open.version} is in progress`}
          body={open.status === 'in_review' ? `${approversOf(open).length} of 2 approvals so far. ${current ? `Staff keep following ${current.version} until it is released.` : 'Not visible to staff until released.'}`
            : open.status === 'changes_requested' ? `“${[...open.reviews].reverse().find((r) => r.decision === 'request_changes' && !r.stepId)?.comment ?? 'See the review for details.'}”`
              : `Last edited ${relTime(open.updatedAt)}. ${current ? `Staff keep following ${current.version}.` : 'Not visible to staff.'}`}
          action={<Button size="sm" onClick={() => nav(open.status === 'draft' || (open.status === 'changes_requested' && open.authorId === person?.id) ? `/author/edit/${open.id}` : `/author/reviews/${open.id}`)}>
            {open.status === 'in_review' ? 'Open review' : open.status === 'changes_requested' ? 'Address changes' : 'Continue editing'}</Button>} />
      )}
      {!retired && !current && !open && shown.status === 'rejected' && (
        <Banner tone="danger" icon={XCircle} title={`Version ${shown.version} was rejected`} body="Nothing from this SOP is visible to staff. Start a revision to rework it." />
      )}

      {tab === 'overview' && <Overview sopId={sopId} v={shown} current={current} view={view} setView={setView} />}
      {tab === 'versions' && <Versions versions={versions} current={current} open={open} />}
      {tab === 'feedback' && (
        feedback.length ? <ul className="space-y-3">{feedback.sort((a, b) => (a.status === b.status ? b.at.localeCompare(a.at) : a.status === 'open' ? -1 : 1)).map((f) => <FeedbackCard key={f.id} f={f} />)}</ul>
          : <Card><EmptyState icon={MessageSquare} title="No feedback on this SOP yet" description="Suggestions, ratings and manager requests about any of its versions appear here." /></Card>
      )}
      {tab === 'activity' && <Activity items={activity} />}
    </div>
  )
}

function Banner({ tone, icon: I, title, body, action }: { tone: 'info' | 'warning' | 'neutral' | 'danger'; icon: typeof Archive; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-3 rounded-card border px-4 py-3', {
      info: 'border-info/25 bg-info/[0.06]', warning: 'border-amber/30 bg-amber/[0.07]', neutral: 'border-line-strong bg-surface-2', danger: 'border-danger/25 bg-danger/[0.05]',
    }[tone])}>
      <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-full', { info: 'bg-info/10 text-info', warning: 'bg-amber/10 text-amber', neutral: 'bg-ink/[0.06] text-ink-2', danger: 'bg-danger/10 text-danger' }[tone])}><I size={16} /></span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-ink">{title}</div>{body && <div className="mt-0.5 text-sm text-ink-2">{body}</div>}</div>
      {action}
    </div>
  )
}

function Overview({ sopId, v, current, view, setView }: { sopId: string; v: SopVersion; current?: SopVersion; view: 'document' | 'staff'; setView: (x: 'document' | 'staff') => void }) {
  const db = useDB()
  const versions = versionsOf(db, sopId)
  const vids = new Set(versions.map((x) => x.id))
  const now = Date.now()
  const recent = db.tasks.filter((t) => vids.has(t.sopVersionId) && t.status !== 'cancelled' && Date.parse(t.start) > now - 14 * DAY && Date.parse(t.start) <= now)
  const st = stats(recent, db.sopVersions, now)
  const done = recent.filter((t) => t.status === 'done' && t.startedAt && t.completedAt)
  const avgMin = done.length ? Math.round((done.reduce((a, t) => a + minutesBetween(t.startedAt!, t.completedAt!), 0) / done.length) * 10) / 10 : null
  const perDay = Array.from({ length: 14 }, (_, i) => { const k = hotelDateKey(now - (13 - i) * DAY); return recent.filter((t) => hotelDateKey(t.start) === k).length })
  const ack = ackRate(db, current)
  const role = db.jobRoles.find((r) => r.id === v.jobRoleId)
  const audience = db.people.filter((p) => p.jobRoleId === v.jobRoleId && p.status !== 'inactive')
  const approvers = approversOf(v).map((id) => byId(db.people, id)?.name).filter(Boolean)
  const checks = v.steps.filter((s) => s.requireCheck).length

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader icon={BookOpenText} title={`Steps · v${v.version}`} description={`${v.steps.length} steps · ${checks} independent check${checks === 1 ? '' : 's'} · ${v.steps.filter((s) => s.allowPhoto).length} with photo`}
            actions={<Segmented size="sm" value={view} onChange={setView} items={[{ id: 'document', label: <span className="inline-flex items-center gap-1"><FileText size={13} /> Document</span> }, { id: 'staff', label: <span className="inline-flex items-center gap-1"><Smartphone size={13} /> As staff see it</span> }]} />} />
          <div className="p-5">
            {view === 'document' ? <StepDocument steps={v.steps} /> : <div className="py-2"><StaffPreview steps={v.steps} version={v.version} title={v.title} minutes={v.timeTargetMin} roleName={role?.name} /></div>}
          </div>
        </Card>
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Tasks · 14 days" value={recent.length} icon={PlayCircle} trend={perDay} />
          <StatCard label="On time" value={done.length ? st.onTimePct : '—'} unit={done.length ? '%' : undefined} icon={Clock} hint={done.length ? `${done.length} finished` : 'no finished tasks'} />
          <StatCard label="Avg duration" value={avgMin ?? '—'} unit={avgMin != null ? 'min' : undefined} icon={Timer} hint={`target ${v.timeTargetMin} min`} />
          <StatCard label="Acknowledged" value={ack.pct ?? '—'} unit={ack.pct != null ? '%' : undefined} icon={ShieldCheck} hint={current ? `${ack.acked} of ${ack.audience} staff` : 'not published'} />
        </div>
        <Card>
          <CardHeader title="Key facts" />
          <div className="p-5">
            <KeyValue columns={2} items={[
              ['Code', <span className="font-mono">{v.code}</span>],
              ['Department', departmentOf(db, sopId, v.jobRoleId)],
              ['Who it is for', role?.name ?? '—'],
              ['Language', v.language],
              ['Time target', `${v.timeTargetMin} minutes`],
              ['Author', byId(db.people, v.authorId)?.name ?? '—'],
              ['Approved by', approvers.length ? approvers.join(', ') : '—'],
              ['Effective', v.effectiveAt ? fDateTime(v.effectiveAt) : 'Not released'],
            ]} />
            {v.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{v.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</div>}
          </div>
        </Card>
        {current && (
          <Card>
            <CardHeader title="Acknowledgment" description={`Who has confirmed they read ${current.version}`} />
            <div className="space-y-3 p-5">
              <ProgressBar value={ack.acked} max={Math.max(1, ack.audience)} tone={(ack.pct ?? 0) >= 80 ? 'success' : (ack.pct ?? 0) >= 50 ? 'warning' : 'danger'} label={`${ack.acked} of ${ack.audience} acknowledged`} showValue />
              <ul className="divide-y divide-line">
                {audience.map((p) => {
                  const ev = db.ackEvents.find((a) => a.kind === 'sop' && a.refId === current.id && a.personId === p.id)
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <PersonChip id={p.id} size={24} sub={p.status === 'on_leave' ? 'On leave' : undefined} />
                      {ev?.acknowledgedAt ? <Badge tone="success" dot>Acknowledged {fDate(ev.acknowledgedAt)}</Badge> : ev?.openedAt ? <Badge tone="warning" dot>Opened, not confirmed</Badge> : <Badge dot>Not opened</Badge>}
                    </li>
                  )
                })}
              </ul>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function Versions({ versions, current, open }: { versions: SopVersion[]; current?: SopVersion; open?: SopVersion }) {
  const db = useDB()
  const nav = useNavigate()
  const released = versions.filter((v) => v.status === 'published' || v.status === 'superseded')
  const defTo = open ?? current ?? versions[0]
  const defFrom = (open && current) ? current : released.find((v) => v.id !== defTo?.id)
  const [fromId, setFromId] = useState(defFrom?.id ?? '')
  const [toId, setToId] = useState(defTo?.id ?? '')
  const from = byId(versions, fromId), to = byId(versions, toId)

  const columns: Column<SopVersion>[] = [
    { key: 'version', header: 'Version', sort: (v) => v.createdAt, cell: (v) => <span className="inline-flex items-center gap-2"><VersionTag label={v.version} draft={v.status === 'draft' || v.status === 'changes_requested'} />{v.id === current?.id && <Badge tone="brand">Current</Badge>}</span>, csv: (v) => v.version },
    { key: 'status', header: 'Status', sort: (v) => v.status, cell: (v) => <VersionStatusBadge status={v.status} /> },
    { key: 'author', header: 'Author', hideOnMobile: true, cell: (v) => <PersonChip id={v.authorId} size={22} />, csv: (v) => byId(db.people, v.authorId)?.name },
    { key: 'submitted', header: 'Submitted', hideOnMobile: true, sort: (v) => v.submittedAt, csv: (v) => (v.submittedAt ? fDateTime(v.submittedAt) : ''), cell: (v) => (v.submittedAt ? <span title={fDateTime(v.submittedAt)}>{fDate(v.submittedAt)}</span> : <span className="text-muted">—</span>) },
    { key: 'approvals', header: 'Approvals', hideOnMobile: true, csv: (v) => approversOf(v).map((id) => byId(db.people, id)?.name).join('; '), cell: (v) => (v.status === 'draft' ? <span className="text-muted">—</span> : <ApprovalMeter v={v} />) },
    { key: 'published', header: 'Published', sort: (v) => v.publishedAt, csv: (v) => (v.publishedAt ? fDateTime(v.publishedAt) : ''), cell: (v) => (v.publishedAt ? <span title={fDateTime(v.publishedAt)}>{fDate(v.publishedAt)}</span> : <span className="text-muted">—</span>) },
    { key: 'open', header: <span className="relative block w-px"><span className="sr-only">Open</span></span>, align: 'right', cell: (v) => (
      v.status === 'draft' ? <Button size="xs" onClick={() => nav(`/author/edit/${v.id}`)}>Edit</Button>
        : v.status === 'in_review' || v.status === 'changes_requested' || v.status === 'rejected' ? <Button size="xs" onClick={() => nav(`/author/reviews/${v.id}`)}>Review</Button>
          : <Button size="xs" variant="ghost" icon={ArrowLeftRight} onClick={() => { setToId(v.id); const prev = released.find((x) => x.createdAt < v.createdAt); if (prev) setFromId(prev.id); document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' }) }}>Compare</Button>
    ) },
  ]

  return (
    <div className="space-y-6">
      <DataTable rows={versions} columns={columns} rowKey={(v) => v.id} initialSort={{ key: 'version', dir: 'desc' }} exportName={`${versions[0]?.code ?? 'sop'}-versions`} caption="Version history" />
      <Card id="compare">
        <CardHeader icon={History} title="Compare versions" description="Pick any two versions to see exactly what changed, step by step."
          actions={<div className="hidden items-center gap-2 md:flex">
            <VersionSelect label="From" value={fromId} onChange={setFromId} versions={versions} />
            <IconButton icon={ArrowLeftRight} label="Swap versions" size="sm" variant="secondary" onClick={() => { setFromId(toId); setToId(fromId) }} />
            <VersionSelect label="To" value={toId} onChange={setToId} versions={versions} />
          </div>} />
        <div className="flex items-center gap-2 border-b border-line px-5 py-3 md:hidden">
          <VersionSelect label="From" value={fromId} onChange={setFromId} versions={versions} />
          <IconButton icon={ArrowLeftRight} label="Swap versions" size="sm" variant="secondary" onClick={() => { setFromId(toId); setToId(fromId) }} />
          <VersionSelect label="To" value={toId} onChange={setToId} versions={versions} />
        </div>
        <div className="p-5">
          {to ? (from?.id === to.id ? <p className="text-sm text-muted">Choose two different versions.</p>
            : <DiffView key={`${fromId}-${toId}`} base={from} next={to} />) : <p className="text-sm text-muted">Choose a version to compare.</p>}
        </div>
      </Card>
    </div>
  )
}

const VersionSelect = ({ label, value, onChange, versions }: { label: string; value: string; onChange: (v: string) => void; versions: SopVersion[] }) => (
  <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted md:flex-none">
    <span className="shrink-0">{label}</span>
    <Select aria-label={`${label} version`} className="h-8 py-1 text-xs md:w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      {label === 'From' && <option value="">Nothing (all new)</option>}
      {versions.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.status.replace('_', ' ')}</option>)}
    </Select>
  </label>
)

const ACT_ICON: Record<string, typeof Rocket> = { released: Rocket, approve: CheckCircle2, request_changes: MessageSquare, reject: XCircle, submitted: GitPullRequestArrow, retired: Archive, restored: ArchiveRestore }
function Activity({ items }: { items: ReturnType<typeof auditFor> }) {
  const db = useDB()
  const tl: TimelineItem[] = items.map((a) => {
    const key = a.action.split('.').pop() ?? ''
    return {
      id: a.id, icon: ACT_ICON[key] ?? FilePen,
      tone: key === 'released' || key === 'approve' ? 'success' : key === 'reject' ? 'danger' : key === 'request_changes' ? 'warning' : key === 'retired' ? 'neutral' : 'brand',
      title: <><b className="font-semibold">{byId(db.people, a.actorId)?.name ?? a.actorId}</b> · {humanAction(a.action).toLowerCase()}</>,
      meta: <span title={fDateTime(a.at)}>{fDateTime(a.at)} · {relTime(a.at)}</span>,
      body: <span className="text-ink-2">{humanDetail(db, a)} <code className="ml-1 rounded bg-ink/[0.05] px-1 py-px font-mono text-[11px] text-muted">{a.action}</code></span>,
    }
  })
  return <Card><CardHeader icon={History} title="Activity" description="Every recorded change to this SOP, newest first. This is the audit trail." /><div className="p-5"><Timeline items={tl} empty="No recorded activity yet." /></div></Card>
}
