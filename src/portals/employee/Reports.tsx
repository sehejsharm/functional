import clsx from 'clsx'
import { ChevronRight, CircleCheck, CircleDot, Flag, Loader, MessageSquarePlus, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, KeyValue, PageHeader, Segmented, Skeleton, Textarea, Timeline, type TimelineItem } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useFirstLoad } from '@/lib/hooks'
import { fDateTime } from '@/lib/time'
import type { Issue, Person } from '@/lib/types'
import { toast } from '@/lib/toast'
import { relTime, usePersona } from '@/shell/PortalShell'
import { CATEGORY_ICON, IssueForm, Sheet, type IssueDraft } from './components'
import { CATEGORY, ISSUE_STATUS, SEVERITY } from './model'

type Filter = 'open' | 'resolved' | 'all'

export function EmployeeReports() {
  const { person } = usePersona('employee')
  const issues = useDB((s) => s.issues)
  const rooms = useDB((s) => s.rooms)
  const [params, setParams] = useSearchParams()
  const loading = useFirstLoad()
  const [filter, setFilter] = useState<Filter>('open')

  const mine = useMemo(() => issues.filter((i) => i.reportedById === person?.id).sort((a, b) => b.at.localeCompare(a.at)), [issues, person?.id])
  const counts = { open: mine.filter((i) => i.status !== 'resolved').length, resolved: mine.filter((i) => i.status === 'resolved').length, all: mine.length }
  const list = filter === 'all' ? mine : mine.filter((i) => (filter === 'open' ? i.status !== 'resolved' : i.status === 'resolved'))

  const creating = params.get('new') === '1'
  const selectedId = params.get('id')
  const selected = mine.find((i) => i.id === selectedId) ?? issues.find((i) => i.id === selectedId)
  const setParam = (k: string, val: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (val) n.set(k, val); else n.delete(k); return n }, { replace: true })

  // Opening a report from a notification lands on the right filter.
  useEffect(() => { if (selected && selected.status === 'resolved' && filter === 'open') setFilter('all') }, [selected, filter])

  if (!person) return null
  const submit = (d: IssueDraft) => {
    const issue = useDB.getState().reportIssue(null, person.id, d.details || d.title, { category: d.category, severity: d.severity, title: d.title, roomId: d.roomId || undefined })
    if (!issue) return
    setParams((p) => { const n = new URLSearchParams(p); n.delete('new'); n.set('id', issue.id); return n }, { replace: true })
    setFilter('open')
    toast.success('Issue reported', { description: `${issue.title} · your supervisor sees it now.` })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" description="Issues you’ve raised and what has happened since."
        actions={<Button variant="gold" size="lg" icon={Plus} onClick={() => setParam('new', '1')} className="max-sm:w-full">Report an issue</Button>} />

      <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented value={filter} onChange={setFilter} className="max-sm:[&>button]:min-h-10"
          items={[{ id: 'open', label: 'Open', count: counts.open }, { id: 'resolved', label: 'Resolved', count: counts.resolved }, { id: 'all', label: 'All', count: counts.all }]} />
      </div>

      {loading ? <Skeleton className="h-64" /> : (
        <Card className="overflow-hidden">
          {list.length ? (
            <ul className="divide-y divide-line" aria-label="Your reports">
              {list.map((i) => <IssueRow key={i.id} issue={i} roomNumber={byId(rooms, i.roomId)?.number} onOpen={() => setParam('id', i.id)} />)}
            </ul>
          ) : (
            <EmptyState icon={Flag}
              title={mine.length ? (filter === 'open' ? 'Nothing open' : 'Nothing resolved yet') : 'You haven’t reported anything'}
              description={mine.length ? 'Switch the filter to see the rest of your reports.' : 'Spot a leak, a missing supply or a safety risk? Report it here or from inside a room — your supervisor sees it straight away.'}
              action={!mine.length && <Button variant="secondary" icon={Plus} onClick={() => setParam('new', '1')} className="h-11">Report an issue</Button>} />
          )}
        </Card>
      )}

      <p className="px-1 text-xs text-muted">Reporting from inside a room links the issue to that room automatically. For anything urgent, also tell your supervisor in person.</p>

      <Sheet open={creating} onClose={() => setParam('new', null)} title="Report an issue" description="For anything not tied to the room you are working in."
        footer={<><Button variant="secondary" onClick={() => setParam('new', null)} className="max-sm:h-11 max-sm:flex-1">Cancel</Button><Button variant="primary" type="submit" form="free-issue" icon={Flag} className="max-sm:h-11 max-sm:flex-1">Send report</Button></>}>
        {creating && <IssueForm id="free-issue" rooms={rooms} onSubmit={submit} />}
      </Sheet>

      <IssueDrawer issue={selected} person={person} onClose={() => setParam('id', null)} />
    </div>
  )
}

function IssueRow({ issue, roomNumber, onOpen }: { issue: Issue; roomNumber?: string; onOpen: () => void }) {
  const I = CATEGORY_ICON[issue.category]
  const st = ISSUE_STATUS[issue.status]
  const sev = SEVERITY[issue.severity]
  const last = issue.updates[issue.updates.length - 1]
  return (
    <li>
      <button type="button" onClick={onOpen} className="group flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5">
        <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-cell', issue.status === 'resolved' ? 'bg-surface-2 text-muted ring-1 ring-inset ring-line' : 'bg-forest-50 text-forest-700')}><I size={18} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{issue.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {roomNumber ? `Room ${roomNumber}` : 'No room'} · {CATEGORY[issue.category].label} · {relTime(issue.at)}
          </span>
          {issue.updates.length > 1 && <span className="mt-0.5 block truncate text-xs text-ink-2">Latest: {last.text}</span>}
          <span className="mt-1.5 flex gap-1.5 sm:hidden"><Badge tone={st.tone} dot>{st.label}</Badge><Badge tone={sev.tone}>{sev.label}</Badge></span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5 max-sm:hidden">
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <Badge tone={sev.tone}>{sev.label}</Badge>
        </span>
        <ChevronRight size={16} className="shrink-0 text-line-strong transition group-hover:text-ink-2" aria-hidden />
      </button>
    </li>
  )
}

function IssueDrawer({ issue, person, onClose }: { issue?: Issue; person: Person; onClose: () => void }) {
  const people = useDB((s) => s.people)
  const room = useDB((s) => byId(s.rooms, issue?.roomId))
  const task = useDB((s) => byId(s.tasks, issue?.taskId))
  const [note, setNote] = useState('')
  useEffect(() => setNote(''), [issue?.id])
  const name = (id?: string) => (id === person.id ? 'You' : byId(people, id)?.name ?? 'Someone')
  const items: TimelineItem[] = issue ? [...issue.updates].reverse().map((u, i) => ({
    id: `${u.at}-${i}`, title: <><span className="font-medium">{name(u.byId)}</span>{u.status && u.text !== 'Reported' ? <span className="text-muted"> · {ISSUE_STATUS[u.status].label}</span> : null}</>,
    body: u.text === 'Reported' ? 'Reported the issue' : u.text, meta: `${fDateTime(u.at)} · ${relTime(u.at)}`,
    icon: u.status === 'resolved' ? CircleCheck : u.status === 'in_progress' ? Loader : u.text === 'Reported' ? Flag : CircleDot,
    tone: u.status === 'resolved' ? 'success' : u.status === 'in_progress' ? 'info' : u.text === 'Reported' ? 'warning' : 'neutral',
  })) : []
  const addNote = () => {
    if (!issue) return
    useDB.getState().updateIssue(issue.id, person.id, { note: note.trim() })
    toast.success('Update added', { description: 'Your supervisor can see it on the incident.' })
    setNote('')
  }
  const mine = issue?.reportedById === person.id
  return (
    <Sheet open={!!issue} onClose={onClose} title={issue?.title ?? ''} description={issue ? `Reported ${fDateTime(issue.at)}` : undefined}>
      {issue && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={ISSUE_STATUS[issue.status].tone} dot size="md">{ISSUE_STATUS[issue.status].label}</Badge>
            <Badge tone={SEVERITY[issue.severity].tone} size="md">{SEVERITY[issue.severity].label} severity</Badge>
            <Badge size="md">{CATEGORY[issue.category].label}</Badge>
          </div>
          <KeyValue columns={2} items={[
            ['Room', room ? (task ? <Link to={`/employee/tasks/${task.id}`} className="link">Room {room.number}</Link> : `Room ${room.number}`) : 'No specific room'],
            ['Assigned to', issue.assignedToId ? name(issue.assignedToId) : 'Not assigned yet'],
            ['Reported by', name(issue.reportedById)],
            [issue.status === 'resolved' ? 'Resolved' : 'Last update', issue.status === 'resolved' && issue.resolvedAt ? `${fDateTime(issue.resolvedAt)} by ${name(issue.resolvedById)}` : relTime(issue.updates[issue.updates.length - 1].at)],
          ]} />
          {issue.text && issue.text !== issue.title && (
            <div><div className="label">Details</div><p className="card-inset px-3 py-2.5 text-sm text-ink">{issue.text}</p></div>
          )}
          <div>
            <div className="label mb-3">Updates</div>
            <Timeline items={items} />
          </div>
          {mine && issue.status !== 'resolved' && (
            <div className="space-y-2 border-t border-line pt-4">
              <label className="block"><span className="label">Add an update</span>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Guest has left the room — it’s free for maintenance now." /></label>
              <div className="flex justify-end"><Button variant="primary" icon={MessageSquarePlus} disabled={!note.trim()} onClick={addNote} className="max-sm:h-11 max-sm:w-full">Add update</Button></div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
