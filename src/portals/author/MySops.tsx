import { Archive, ArchiveRestore, BookCheck, ClipboardPen, Copy, ExternalLink, FilePen, FileUp, GitPullRequestArrow, MoreHorizontal, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Button, Card, CardHeader, DataTable, IconButton, Menu, PageHeader, ProgressBar, Select, Skeleton, StatCard, Tabs, type Column } from '@/components/ui'
import { useDB } from '@/lib/db'
import { useFirstLoad } from '@/lib/hooks'
import { fDateTime } from '@/lib/time'
import { confirm, toast } from '@/lib/toast'
import { relTime, usePersona } from '@/shell/PortalShell'
import { deleteSopDraft, quorumMet, sopRows, type SopRow } from './actions'
import { RowStatusBadge, VersionStatusBadge, VersionTag, useSopCommands } from './components'

type TabId = 'all' | 'published' | 'review' | 'drafts' | 'retired'

export function MySops() {
  const db = useDB()
  const nav = useNavigate()
  const loading = useFirstLoad()
  const { person } = usePersona('author')
  const cmd = useSopCommands()
  const [tab, setTab] = useState<TabId>('all')
  const [dept, setDept] = useState('all')

  const rows = useMemo(() => sopRows(db), [db])
  const mine = db.sopVersions.filter((v) => v.authorId === person?.id && (v.status === 'draft' || v.status === 'changes_requested'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const counts = {
    all: rows.length,
    published: rows.filter((r) => r.flags.published).length,
    review: rows.filter((r) => r.flags.inReview && !r.flags.retired).length,
    drafts: rows.filter((r) => r.flags.draft && !r.flags.retired).length,
    retired: rows.filter((r) => r.flags.retired).length,
  }
  const inReview = db.sopVersions.filter((v) => v.status === 'in_review')
  const ready = inReview.filter(quorumMet).length
  const changes = db.sopVersions.filter((v) => v.status === 'changes_requested').length
  const drafts = db.sopVersions.filter((v) => v.status === 'draft').length
  const live = rows.filter((r) => r.flags.published && r.ack.pct != null)
  const avgAck = live.length ? Math.round(live.reduce((a, r) => a + (r.ack.pct ?? 0), 0) / live.length) : 0
  const departments = [...new Set(rows.map((r) => r.department))].sort()

  const visible = rows.filter((r) => (dept === 'all' || r.department === dept) && (
    tab === 'all' ? true : tab === 'published' ? r.flags.published : tab === 'review' ? r.flags.inReview && !r.flags.retired
      : tab === 'drafts' ? r.flags.draft && !r.flags.retired : r.flags.retired))

  const removeDraft = async (id: string, label: string) => {
    if (!await confirm({ title: `Delete draft ${label}?`, body: 'The draft and its unsent changes are deleted. Published versions are not affected.', tone: 'danger', confirmLabel: 'Delete draft' })) return
    if (deleteSopDraft(id, cmd.me)) toast.success('Draft deleted', { description: label })
  }

  const columns: Column<SopRow>[] = [
    { key: 'sop', header: 'SOP', sort: (r) => r.code, csv: (r) => `${r.code} — ${r.title}`,
      cell: (r) => (
        <div className="min-w-[160px] max-w-[280px]">
          <div className="font-mono text-xs font-semibold text-forest-800">{r.code}</div>
          <div className="truncate font-medium text-ink" title={r.title}>{r.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden"><VersionTag label={r.version} draft={!r.current && r.status !== 'retired' && r.status !== 'rejected'} /><RowStatusBadge status={r.status} /></div>
        </div>
      ) },
    { key: 'department', header: 'Department', sort: (r) => r.department, hideOnMobile: true,
      cell: (r) => <div className="leading-tight"><div className="text-ink-2">{r.department}</div><div className="mt-0.5 text-xs text-muted">{db.jobRoles.find((j) => j.id === r.roleId)?.name}</div></div> },
    { key: 'version', header: 'Version', sort: (r) => Number(r.version) || 0, csv: (r) => r.version, hideOnMobile: true,
      cell: (r) => <VersionTag label={r.version} draft={!r.current && r.status !== 'retired' && r.status !== 'rejected'} /> },
    { key: 'status', header: 'Status', sort: (r) => r.status, csv: (r) => r.status, hideOnMobile: true,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <RowStatusBadge status={r.status} />
          {r.current && r.open && !r.flags.retired && <span className="whitespace-nowrap text-2xs text-muted">{r.open.version} {r.open.status === 'in_review' ? 'in review' : r.open.status === 'changes_requested' ? 'needs changes' : 'drafting'}</span>}
        </div>
      ) },
    { key: 'author', header: 'Author', sort: (r) => db.people.find((p) => p.id === r.authorId)?.name, hideOnMobile: true, csv: (r) => db.people.find((p) => p.id === r.authorId)?.name,
      cell: (r) => { const n = db.people.find((p) => p.id === r.authorId)?.name; return n ? <span role="img" aria-label={n} className="inline-flex"><Avatar name={n} size={26} /></span> : '—' } },
    { key: 'updated', header: 'Updated', sort: (r) => r.updatedAt, csv: (r) => fDateTime(r.updatedAt), hideOnMobile: true,
      cell: (r) => <span className="whitespace-nowrap text-ink-2" title={fDateTime(r.updatedAt)}>{relTime(r.updatedAt)}</span> },
    { key: 'tasks', header: 'Tasks 14d', sort: (r) => r.tasks14, width: '96px', align: 'right', hideOnMobile: true, cell: (r) => r.tasks14 || <span className="text-muted">—</span> },
    { key: 'ack', header: 'Ack', sort: (r) => r.ack.pct ?? -1, csv: (r) => (r.ack.pct == null ? '' : `${r.ack.pct}%`), align: 'right', hideOnMobile: true,
      cell: (r) => r.ack.pct == null || r.flags.retired ? <span className="text-muted">—</span> : (
        <div className="ml-auto flex w-16 flex-col items-end gap-1" title={`${r.ack.acked} of ${r.ack.audience} staff acknowledged ${r.current?.version}`}>
          <span className="text-sm font-medium tabular">{r.ack.pct}%</span>
          <ProgressBar size="sm" value={r.ack.pct} tone={r.ack.pct >= 80 ? 'success' : r.ack.pct >= 50 ? 'warning' : 'danger'} />
        </div>
      ) },
    { key: 'menu', header: <span className="relative block w-px"><span className="sr-only">Actions</span></span>, align: 'right', width: '52px',
      cell: (r) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Menu label={`Actions for ${r.code}`} trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label={`Actions for ${r.code}`} size="sm" onClick={toggle} />}
            items={[
              { label: 'Open', icon: ExternalLink, onClick: () => nav(`/author/sops/${r.sopId}`) },
              { label: r.open && r.open.authorId === person?.id && r.open.status !== 'in_review' ? 'Continue revision' : 'Start revision', icon: FilePen, disabled: r.flags.retired, hint: r.flags.retired ? 'Restore first' : undefined, onClick: () => cmd.revise(r.sopId) },
              { label: 'Duplicate as new SOP', icon: Copy, onClick: () => cmd.duplicate(r.sopId) },
              'separator',
              r.flags.retired ? { label: 'Restore', icon: ArchiveRestore, onClick: () => cmd.restore(r.sopId) }
                : { label: 'Retire', icon: Archive, danger: true, disabled: !r.sop, onClick: () => cmd.retire(r.sopId) },
            ]} />
        </span>
      ) },
  ]

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Hotel standards" title="SOP library"
        description="Every standard operating procedure at the property — what staff follow today, what is in review, and what has been retired."
        actions={<>
          <Button icon={FileUp} onClick={() => nav('/author/new?import=1')}>Import PDF</Button>
          <Button variant="primary" icon={Plus} onClick={() => nav('/author/new')}>Create SOP</Button>
        </>} />

      {mine.length > 0 && (
        <Card>
          <CardHeader icon={ClipboardPen} title="Your drafts" description="Saved work that staff can’t see yet. Pick up where you left off." />
          <ul className="divide-y divide-line">
            {mine.map((d) => {
              const lastNote = d.status === 'changes_requested' ? [...d.reviews].reverse().find((r) => r.decision === 'request_changes' && !r.stepId) : undefined
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-ink">{d.code || 'No code'}</span>
                      <VersionTag label={d.version} draft />
                      <VersionStatusBadge status={d.status} />
                    </div>
                    <div className="mt-0.5 truncate text-sm text-ink-2">{d.title || 'Untitled SOP'} <span className="text-muted">· {d.steps.length} step{d.steps.length === 1 ? '' : 's'} · edited {relTime(d.updatedAt)}</span></div>
                    {lastNote && <p className="mt-1 truncate text-xs text-amber">“{lastNote.comment}” — {db.people.find((p) => p.id === lastNote.reviewerId)?.name}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="primary" onClick={() => nav(`/author/edit/${d.id}`)}>{d.status === 'changes_requested' ? 'Address changes' : 'Continue editing'}</Button>
                    {d.status === 'draft' && <IconButton icon={Trash2} size="sm" label={`Delete draft ${d.code || d.title}`} onClick={() => removeDraft(d.id, `${d.code || 'Untitled'} ${d.version}`)} />}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {loading ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-card" />) : <>
          <StatCard label="Published" value={counts.published} icon={BookCheck} hint={`${rows.filter((r) => r.flags.published && r.open).length} with a revision open`} />
          <StatCard label="In review" value={inReview.length} icon={GitPullRequestArrow} hint={ready ? `${ready} ready to release` : 'awaiting approvals'} to="/author/reviews" />
          <StatCard label="Changes requested · drafts" value={`${changes} · ${drafts}`} icon={FilePen} hint="not visible to staff" />
          <StatCard label="Retired" value={counts.retired} icon={Archive} hint="kept for history" />
          <div className="col-span-2 lg:col-span-1"><StatCard label="Avg acknowledgment" value={avgAck} unit="%" icon={ShieldCheck} hint={`across ${live.length} live SOPs`} /></div>
        </>}
      </div>

      <div>
        <Tabs value={tab} onChange={setTab} className="mb-4" items={[
          { id: 'all', label: 'All', count: counts.all }, { id: 'published', label: 'Published', count: counts.published },
          { id: 'review', label: 'In review', count: counts.review }, { id: 'drafts', label: 'Drafts', count: counts.drafts }, { id: 'retired', label: 'Retired', count: counts.retired },
        ]} />
        {loading ? <Skeleton className="h-96 rounded-card" /> : (
          <DataTable rows={visible} columns={columns} rowKey={(r) => r.sopId} onRowClick={(r) => nav(`/author/sops/${r.sopId}`)}
            search={(r) => `${r.code} ${r.title} ${r.department} ${r.version}`} searchPlaceholder="Search code, title or department"
            filters={<Select aria-label="Department" className="h-9 w-full py-1.5 sm:w-48" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">All departments</option>{departments.map((d) => <option key={d}>{d}</option>)}
            </Select>}
            exportName="mise-sop-library" initialSort={{ key: 'sop', dir: 'asc' }} pageSize={12} caption="SOP library"
            rowClassName={(r) => (r.flags.retired ? 'opacity-70' : undefined)}
            empty={<div className="px-6 py-12 text-center text-sm text-muted">No SOPs in this view{dept !== 'all' ? ` for ${dept}` : ''}.</div>} />
        )}
      </div>
    </div>
  )
}
