import { AlertOctagon, CheckCircle2, Clock, Flame, Link2, MessageSquarePlus, Plus, RotateCcw, UserCheck, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Avatar, Button, DataTable, Drawer, EmptyState, Field, Input, KeyValue, Modal, PageHeader, Segmented, Select, StatCard, Tabs, Textarea, Timeline, type Column,
} from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, MIN } from '@/lib/time'
import { prompt, toast } from '@/lib/toast'
import type { Issue, IssueCategory, IssueSeverity, IssueStatus, Person } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { Callout, FilterSelect, IssueStatusBadge, OccupancyChip, PersonCell, SeverityBadge, useLookups, useQueryParam } from './components'
import { CATEGORY, ISSUE_STATUS, SEVERITY, fAge, fMinutes } from './model'

/** Engineering and duty managers are offered first when assigning; anyone can take an incident. */
const SUGGESTED_ROLES = ['engineering', 'duty-manager']

function AssigneeOptions({ people, roles }: { people: Person[]; roles: { id: string; name: string }[] }) {
  const sug = people.filter((p) => SUGGESTED_ROLES.includes(p.jobRoleId))
  const rest = people.filter((p) => !SUGGESTED_ROLES.includes(p.jobRoleId))
  const label = (p: Person) => `${p.name} · ${roles.find((r) => r.id === p.jobRoleId)?.name ?? p.title}`
  return <>
    <optgroup label="Suggested — engineering & duty managers">{sug.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
    <optgroup label="Everyone else">{rest.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
  </>
}

export function Incidents() {
  const now = useNow(30_000)
  const { issues, people, rooms } = useDB()
  const L = useLookups()
  const [id, setId] = useQueryParam('id')
  const [isNew, setNew] = useQueryParam('new')
  const [, setParams] = useSearchParams()
  const closeNew = () => setParams((p) => { const n = new URLSearchParams(p); ['new', 'room', 'task'].forEach((k) => n.delete(k)); return n }, { replace: true })
  const [tab, setTab] = useState<'active' | 'resolved' | 'all'>('active')
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [assignee, setAssignee] = useState('')

  const open = issues.filter((i) => i.status !== 'resolved')
  const resolved = issues.filter((i) => i.status === 'resolved' && i.resolvedAt)
  const avgResolve = resolved.length ? Math.round(resolved.reduce((a, i) => a + (Date.parse(i.resolvedAt!) - Date.parse(i.at)) / MIN, 0) / resolved.length) : null
  const rows = issues.filter((i) => (tab === 'all' || (tab === 'active' ? i.status !== 'resolved' : i.status === 'resolved'))
    && (!category || i.category === category) && (!severity || i.severity === severity) && (!assignee || (assignee === 'none' ? !i.assignedToId : i.assignedToId === assignee)))
    .sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || b.at.localeCompare(a.at))

  const columns: Column<Issue>[] = [
    { key: 'title', header: 'Incident', sort: (i) => i.title, csv: (i) => i.title, cell: (i) => (
      <div className="min-w-0 max-w-[240px]"><div className="truncate font-medium text-ink">{i.title}</div><div className="truncate text-xs text-muted">{i.text}</div></div>) },
    { key: 'category', header: 'Category', hideOnMobile: true, sort: (i) => CATEGORY[i.category], csv: (i) => CATEGORY[i.category], cell: (i) => <span className="whitespace-nowrap text-sm text-ink-2">{CATEGORY[i.category]}</span> },
    { key: 'severity', header: 'Severity', sort: (i) => SEVERITY[i.severity].rank, csv: (i) => SEVERITY[i.severity].label, cell: (i) => <SeverityBadge severity={i.severity} /> },
    { key: 'room', header: 'Room', hideOnMobile: true, sort: (i) => L.room(i.roomId)?.number ?? '', csv: (i) => L.room(i.roomId)?.number ?? '', cell: (i) => i.roomId ? <span className="font-medium tabular">{L.room(i.roomId)?.number}</span> : <span className="whitespace-nowrap text-xs text-muted">No room</span> },
    { key: 'reporter', header: 'Reported by', hideOnMobile: true, sort: (i) => L.name(i.reportedById), csv: (i) => L.name(i.reportedById), cell: (i) => <PersonCell person={L.person(i.reportedById)} size={24} /> },
    { key: 'assignee', header: 'Assignee', hideOnMobile: true, sort: (i) => L.name(i.assignedToId), csv: (i) => (i.assignedToId ? L.name(i.assignedToId) : ''), cell: (i) => i.assignedToId ? <PersonCell person={L.person(i.assignedToId)} size={24} /> : <span className="text-xs font-medium text-amber">Unassigned</span> },
    { key: 'status', header: 'Status', sort: (i) => i.status, csv: (i) => ISSUE_STATUS[i.status].label, cell: (i) => <IssueStatusBadge status={i.status} /> },
    { key: 'age', header: 'Age', align: 'right', sort: (i) => i.at, csv: (i) => i.at, cell: (i) => <span className="whitespace-nowrap text-sm tabular text-ink-2" title={fDateTime(i.at)}>{i.status === 'resolved' && i.resolvedAt ? <span className="text-muted">took {fAge(i.at, Date.parse(i.resolvedAt))}</span> : fAge(i.at, now)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Incidents" description="Maintenance, safety, guest and supply issues raised from the floor — triage, assign and close them here."
        actions={<Button variant="primary" icon={Plus} onClick={() => setNew('1')}>Log incident</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={open.length} icon={AlertOctagon} hint={`${open.filter((i) => !i.assignedToId).length} unassigned`} />
        <StatCard label="Critical or high" value={open.filter((i) => i.severity === 'critical' || i.severity === 'high').length} icon={Flame} hint="still open" />
        <StatCard label="In progress" value={issues.filter((i) => i.status === 'in_progress').length} icon={Wrench} hint="someone is on it" />
        <StatCard label="Avg time to resolve" value={avgResolve == null ? '—' : fMinutes(avgResolve)} icon={Clock} hint={`${resolved.length} resolved`} />
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'active', label: 'Active', count: open.length }, { id: 'resolved', label: 'Resolved', count: issues.length - open.length }, { id: 'all', label: 'All', count: issues.length }]} />
      <DataTable rows={rows} columns={columns} rowKey={(i) => i.id} caption="Incidents" onRowClick={(i) => setId(i.id)} rowClassName={(i) => (i.id === id ? 'bg-forest-50/70' : undefined)}
        search={(i) => `${i.title} ${i.text} ${L.room(i.roomId)?.number ?? ''} ${L.name(i.reportedById)} ${L.name(i.assignedToId)} ${CATEGORY[i.category]}`} searchPlaceholder="Search title, room or person" exportName="incidents"
        filters={<>
          <FilterSelect label="Category" value={category} onChange={setCategory}><option value="">All categories</option>{(Object.keys(CATEGORY) as IssueCategory[]).map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}</FilterSelect>
          <FilterSelect label="Severity" value={severity} onChange={setSeverity}><option value="">Any severity</option>{(['critical', 'high', 'medium', 'low'] as IssueSeverity[]).map((s) => <option key={s} value={s}>{SEVERITY[s].label}</option>)}</FilterSelect>
          <FilterSelect label="Assignee" value={assignee} onChange={setAssignee}><option value="">Anyone</option><option value="none">Unassigned</option>{[...new Set(issues.map((i) => i.assignedToId).filter(Boolean))].map((pid) => <option key={pid} value={pid}>{L.name(pid)}</option>)}</FilterSelect>
        </>}
        empty={<EmptyState compact icon={CheckCircle2} title={tab === 'active' ? 'No open incidents' : 'No incidents match'} description={tab === 'active' ? 'Everything raised from the floor has been dealt with.' : 'Try another tab or clear the filters.'} />} />
      <IncidentDrawer issueId={id || null} onClose={() => setId(null)} people={people} />
      <LogIncident open={isNew === '1'} onClose={closeNew} onCreated={(nid) => setId(nid)} rooms={rooms} people={people} />
    </div>
  )
}

function IncidentDrawer({ issueId, onClose, people }: { issueId: string | null; onClose: () => void; people: Person[] }) {
  const { issues, tasks, jobRoles } = useDB()
  const { person: me } = usePersona('manager')
  const L = useLookups()
  const now = useNow(30_000)
  const [note, setNote] = useState('')
  useEffect(() => setNote(''), [issueId])
  const i = byId(issues, issueId)
  if (!i) return <Drawer open={!!issueId} onClose={onClose} title="Incident not found"><EmptyState title="This incident isn’t available" description="It may have been removed by a demo reset." /></Drawer>
  const actor = me?.id ?? 'elena'
  const room = L.room(i.roomId)
  const task = byId(tasks, i.taskId)
  const update = (patch: Parameters<ReturnType<typeof useDB.getState>['updateIssue']>[2], msg: string, desc?: string) => {
    useDB.getState().updateIssue(i.id, actor, patch)
    toast.success(msg, { description: desc })
  }
  const setStatus = async (s: IssueStatus) => {
    if (s === i.status) return
    if (s === 'resolved') {
      const how = await prompt({ title: 'Resolve this incident?', body: 'The reporter is told it’s been dealt with.', input: { label: 'How was it resolved?', placeholder: 'e.g. Washer replaced, tap tested for 10 minutes', required: true }, confirmLabel: 'Resolve' })
      if (!how) return
      update({ status: 'resolved', note: how }, 'Incident resolved', i.title)
    } else update({ status: s, note: s === 'open' ? 'Reopened' : 'Work started' }, s === 'open' ? 'Incident reopened' : 'Marked in progress', i.title)
  }
  return (
    <Drawer open={!!issueId} onClose={onClose} width="lg" title={i.title} description={`${CATEGORY[i.category]} · reported ${fDateTime(i.at)} · ${fAge(i.at, now)} ago`}
      footer={i.status === 'resolved'
        ? <><Button variant="secondary" icon={RotateCcw} onClick={() => setStatus('open')}>Reopen</Button><Button variant="primary" onClick={onClose}>Done</Button></>
        : <><Button variant="ghost" className="mr-auto" onClick={onClose}>Close</Button>{i.status === 'open' && <Button variant="secondary" icon={Wrench} onClick={() => setStatus('in_progress')}>Start work</Button>}<Button variant="primary" icon={CheckCircle2} onClick={() => setStatus('resolved')}>Resolve…</Button></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={i.severity} /><IssueStatusBadge status={i.status} />{!i.assignedToId && i.status !== 'resolved' && <span className="text-xs font-medium text-amber">Unassigned</span>}</div>
        <p className="whitespace-pre-line rounded-cell border border-line bg-surface-2 px-4 py-3 text-sm text-ink">{i.text}</p>
        <KeyValue columns={2} items={[
          ['Room', room ? <span key="r">Room {room.number} · {room.type}</span> : 'Public area / no room'],
          ['Guest', room ? <span key="g" className="flex flex-col">{room.guestName ?? 'No guest in residence'}<OccupancyChip occ={room.occupancy} /></span> : '—'],
          ['Reported by', <PersonCell key="p" person={L.person(i.reportedById)} sub={L.person(i.reportedById)?.title} size={24} />],
          ['Linked task', task ? <Link key="t" to={`/manager/tasks?task=${task.id}`} className="link inline-flex items-center gap-1"><Link2 size={13} />Room {L.room(task.roomId)?.number} · {L.version(task.sopVersionId)?.code}</Link> : 'None'],
          ...(i.resolvedAt ? [['Resolved', `${fDateTime(i.resolvedAt)} by ${L.name(i.resolvedById)}`] as [string, string]] : []),
        ]} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <Segmented size="sm" value={i.status} onChange={setStatus} items={(['open', 'in_progress', 'resolved'] as IssueStatus[]).map((s) => ({ id: s, label: ISSUE_STATUS[s].label }))} />
          </Field>
          <Field label="Severity" htmlFor="sev">
            <Select id="sev" value={i.severity} onChange={(e) => { const s = e.target.value as IssueSeverity; update({ severity: s, note: `Severity → ${SEVERITY[s].label.toLowerCase()}` }, `Severity set to ${SEVERITY[s].label.toLowerCase()}`) }}>
              {(['low', 'medium', 'high', 'critical'] as IssueSeverity[]).map((s) => <option key={s} value={s}>{SEVERITY[s].label}</option>)}
            </Select>
          </Field>
          <Field label="Assigned to" htmlFor="asg" className="sm:col-span-2" hint="Engineering and duty managers are suggested first; anyone can take it.">
            <Select id="asg" value={i.assignedToId ?? ''} onChange={(e) => {
              const pid = e.target.value || null
              update({ assignedToId: pid, ...(pid && i.status === 'open' ? { status: 'in_progress' as const } : {}), note: pid ? `Assigned to ${L.name(pid)}` : 'Unassigned' }, pid ? `Assigned to ${L.name(pid)}` : 'Assignee removed', pid && i.status === 'open' ? 'Status moved to in progress.' : undefined)
            }}>
              <option value="">Unassigned</option>
              <AssigneeOptions people={people} roles={jobRoles} />
            </Select>
          </Field>
        </div>

        <div>
          <Field label="Add a note" htmlFor="note" hint="Visible to the reporter and anyone working the incident.">
            <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Parts arrive at 5 PM; room stays sellable" />
          </Field>
          <div className="mt-2 flex justify-end"><Button size="sm" variant="secondary" icon={MessageSquarePlus} disabled={!note.trim()} onClick={() => { update({ note: note.trim() }, 'Note added'); setNote('') }}>Add note</Button></div>
        </div>

        <section aria-label="Updates">
          <h3 className="mb-3 text-sm font-semibold text-ink">Updates</h3>
          <Timeline items={[...i.updates].reverse().map((u, k) => ({
            id: `${k}-${u.at}`, tone: u.status === 'resolved' ? 'success' : u.status === 'in_progress' ? 'info' : u.status === 'open' ? 'danger' : 'neutral',
            icon: u.status === 'resolved' ? CheckCircle2 : u.text.startsWith('Assigned') ? UserCheck : undefined,
            title: <><b className="font-semibold">{L.name(u.byId)}</b> · {u.text}</>, meta: `${fDateTime(u.at)}${u.status ? ` · ${ISSUE_STATUS[u.status].label}` : ''}`,
          }))} />
        </section>
      </div>
    </Drawer>
  )
}

function LogIncident({ open, onClose, onCreated, rooms, people }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; rooms: ReturnType<typeof useDB.getState>['rooms']; people: Person[] }) {
  const { person: me } = usePersona('manager')
  const jobRoles = useDB((s) => s.jobRoles)
  const [roomParam] = useQueryParam('room')
  const [taskParam] = useQueryParam('task')
  const blank = { title: '', text: '', category: 'maintenance' as IssueCategory, severity: 'medium' as IssueSeverity, roomId: '', assignee: '' }
  const [f, setF] = useState(blank)
  const [tried, setTried] = useState(false)
  useEffect(() => { if (open) { setF({ ...blank, roomId: roomParam }); setTried(false) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = f.title.trim().length >= 3 && f.text.trim().length >= 3
  const floors = useMemo(() => [1, 2, 3].map((n) => ({ n, rooms: rooms.filter((r) => r.floor === n) })), [rooms])
  const submit = () => {
    setTried(true)
    if (!valid) return
    const actor = me?.id ?? 'elena'
    const task = taskParam ? useDB.getState().tasks.find((t) => t.id === taskParam && t.roomId === f.roomId) : undefined
    const issue = useDB.getState().reportIssue(task?.id ?? null, actor, f.text.trim(), { category: f.category, severity: f.severity, title: f.title.trim(), roomId: f.roomId || undefined })
    if (f.assignee) useDB.getState().updateIssue(issue.id, actor, { assignedToId: f.assignee, status: 'in_progress', note: `Assigned to ${people.find((p) => p.id === f.assignee)?.name}` })
    toast.success('Incident logged', { description: `${f.title.trim()}${f.assignee ? ` · assigned to ${people.find((p) => p.id === f.assignee)?.name}` : ''}` })
    onClose(); setTimeout(() => onCreated(issue.id), 50)
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Log an incident" description="Raise something you saw or were told about. The duty team sees it immediately."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Plus} onClick={submit}>Log incident</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="ititle" required className="sm:col-span-2" error={tried && f.title.trim().length < 3 ? 'Give it a short title.' : undefined}>
          <Input id="ititle" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Shower drain blocked" maxLength={80} invalid={tried && f.title.trim().length < 3} />
        </Field>
        <Field label="Category" htmlFor="icat">
          <Select id="icat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as IssueCategory })}>{(Object.keys(CATEGORY) as IssueCategory[]).map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}</Select>
        </Field>
        <Field label="Room" htmlFor="iroom" hint="Leave empty for public areas">
          <Select id="iroom" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            <option value="">No room / public area</option>
            {floors.map((fl) => <optgroup key={fl.n} label={`Floor ${fl.n}`}>{fl.rooms.map((r) => <option key={r.id} value={r.id}>Room {r.number}{r.guestName ? ` · ${r.guestName}` : ''}</option>)}</optgroup>)}
          </Select>
        </Field>
        <Field label="Severity" className="sm:col-span-2">
          <Segmented value={f.severity} onChange={(s) => setF({ ...f, severity: s })} items={(['low', 'medium', 'high', 'critical'] as IssueSeverity[]).map((s) => ({ id: s, label: SEVERITY[s].label }))} />
        </Field>
        {f.severity === 'critical' && <Callout tone="danger" className="sm:col-span-2" title="Critical means guest safety or a room that can’t be sold">Call the duty manager as well as logging it here.</Callout>}
        <Field label="What happened" htmlFor="itext" required className="sm:col-span-2" error={tried && f.text.trim().length < 3 ? 'Describe what happened.' : undefined}>
          <Textarea id="itext" rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="What you saw, where, and anything already done about it" invalid={tried && f.text.trim().length < 3} />
        </Field>
        <Field label="Assign to" htmlFor="iasg" className="sm:col-span-2" hint="Optional · moves it straight to in progress">
          <Select id="iasg" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
            <option value="">Decide later</option>
            <AssigneeOptions people={people} roles={jobRoles} />
          </Select>
        </Field>
      </div>
      {me && <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Avatar name={me.name} size={20} />Logged as {me.name}</p>}
    </Modal>
  )
}
