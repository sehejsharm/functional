import { Archive, BookOpen, CheckCircle2, ClipboardCheck, Eye, FileClock, Hourglass, Lock, MessageSquarePlus, Pin, ShieldCheck, Sparkles, ToggleLeft, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Avatar, Badge, Button, Card, CardHeader, DataTable, Drawer, EmptyState, Field, KeyValue, PageHeader, Select, Stepper, Tabs, Textarea, type Column, ButtonLink } from '@/components/ui'
import { APPROVALS_REQUIRED, byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, fDateTime, hotelDateKey } from '@/lib/time'
import { toast } from '@/lib/toast'
import type { Sop, SopVersion } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { requestSopChange } from './actions'
import { Callout, Meter, StepProgress, useQueryParam } from './components'
import { DAY, pct } from './model'

type Tab = 'published' | 'review' | 'retired'
interface Row { sop: Sop; v: SopVersion; tab: Tab; today: number; d14: number; ack: { n: number; total: number } }

export function EmployeeSops() {
  const now = useNow(60_000)
  const { sops, sopVersions, tasks, people, ackEvents, jobRoles } = useDB()
  const [sopId, setSopId] = useQueryParam('sop')
  const [tab, setTab] = useState<Tab>('published')
  const [dept, setDept] = useState('')
  const today = hotelDateKey(now)

  const rows: Row[] = sops.map((sop) => {
    const v = byId(sopVersions, sop.currentVersionId) ?? sopVersions.filter((x) => x.sopId === sop.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    // Private drafts and rejected first versions aren't staff-facing; only versions under review are listed.
    if (!v || (!sop.currentVersionId && v.status !== 'in_review' && v.status !== 'changes_requested')) return null
    const vIds = sopVersions.filter((x) => x.sopId === sop.id).map((x) => x.id)
    const mine = tasks.filter((t) => vIds.includes(t.sopVersionId))
    const staff = people.filter((p) => p.jobRoleId === v.jobRoleId)
    return {
      sop: { ...sop, department: sop.department ?? byId(jobRoles, v.jobRoleId)?.team }, v, tab: (sop.retiredAt ? 'retired' : sop.currentVersionId ? 'published' : 'review') as Tab,
      today: mine.filter((t) => hotelDateKey(t.start) === today).length, d14: mine.filter((t) => Date.parse(t.start) > now - 14 * DAY).length,
      ack: { n: staff.filter((p) => ackEvents.some((a) => a.personId === p.id && a.kind === 'sop' && a.refId === v.id && a.acknowledgedAt)).length, total: staff.length },
    }
  }).filter(Boolean) as Row[]
  const shown = rows.filter((r) => r.tab === tab && (!dept || r.sop.department === dept))
  const role = (id: string) => byId(jobRoles, id)?.name ?? id
  const count = (t: Tab) => rows.filter((r) => r.tab === t).length

  const columns: Column<Row>[] = [
    { key: 'code', header: 'Code', sort: (r) => r.v.code, csv: (r) => r.v.code, cell: (r) => <span className="whitespace-nowrap text-sm font-semibold text-ink">{r.v.code}</span> },
    { key: 'title', header: 'Title', sort: (r) => r.v.title, csv: (r) => r.v.title, cell: (r) => <div className="min-w-0 max-w-[260px]"><div className="truncate text-sm text-ink">{r.v.title}</div><div className="truncate text-xs text-muted">{r.v.steps.length} steps · {r.v.timeTargetMin} min{r.v.steps.some((s) => s.requireCheck) ? ' · verified' : ''}</div></div> },
    { key: 'dept', header: 'Department', hideOnMobile: true, sort: (r) => r.sop.department, csv: (r) => r.sop.department, cell: (r) => <span className="text-sm text-ink-2">{r.sop.department}</span> },
    { key: 'ver', header: 'Version', sort: (r) => r.v.version, csv: (r) => r.v.version, cell: (r) => <div className="whitespace-nowrap"><Badge tone={r.tab === 'published' ? 'brand' : r.tab === 'review' ? 'info' : 'neutral'}>v{r.v.version}</Badge><div className="mt-0.5 text-2xs text-muted">{r.tab === 'review' ? r.v.status.replace('_', ' ') : r.v.publishedAt ? fDate(r.v.publishedAt) : ''}</div></div> },
    { key: 'role', header: 'Role', hideOnMobile: true, sort: (r) => role(r.v.jobRoleId), csv: (r) => role(r.v.jobRoleId), cell: (r) => <span className="text-sm text-ink-2">{role(r.v.jobRoleId)}</span> },
    { key: 'use', header: 'Used today / 14d', align: 'right', hideOnMobile: true, sort: (r) => r.d14, csv: (r) => `${r.today}/${r.d14}`, cell: (r) => <span className="tabular"><b>{r.today}</b><span className="text-muted"> / {r.d14}</span></span> },
    { key: 'ack', header: 'Acknowledged', hideOnMobile: true, sort: (r) => pct(r.ack.n, r.ack.total), csv: (r) => pct(r.ack.n, r.ack.total), cell: (r) => r.tab !== 'published' ? <span className="text-xs text-muted">—</span> : !r.ack.total ? <span className="text-xs text-muted">No staff in role</span> : (
      <div className="flex min-w-[110px] items-center gap-2"><Meter value={r.ack.n} max={r.ack.total} tone={r.ack.n === r.ack.total ? 'success' : 'warning'} label={`${r.v.code}: ${r.ack.n} of ${r.ack.total} acknowledged`} /><span className="w-9 text-right text-xs tabular text-ink-2">{pct(r.ack.n, r.ack.total)}%</span></div>) },
  ]

  return (
    <div>
      <PageHeader title="Employee SOPs" description="The standards behind every task, exactly as staff see them. Managers read and request changes; authors edit."
        actions={<ButtonLink to="/manager/sop-policy" variant="secondary" icon={ClipboardCheck}>Hotel SOP policy</ButtonLink>}>
        <Tabs value={tab} onChange={setTab} items={[{ id: 'published', label: 'Published', count: count('published') }, { id: 'review', label: 'In review', count: count('review') }, { id: 'retired', label: 'Retired', count: count('retired') }]} />
      </PageHeader>
      {tab === 'review' && <Callout className="mb-4" tone="info" title="Not assignable yet">These versions need {APPROVALS_REQUIRED} independent approvals before they can be released and assigned.</Callout>}
      {tab === 'retired' && <Callout className="mb-4" tone="neutral" icon={Archive} title="Kept for history">Retired SOPs can’t be assigned. Past rooms keep the version they ran on.</Callout>}
      <DataTable rows={shown} columns={columns} rowKey={(r) => r.sop.id} caption="SOP catalogue" onRowClick={(r) => setSopId(r.sop.id)} rowClassName={(r) => (r.sop.id === sopId ? 'bg-forest-50/70' : undefined)}
        search={(r) => `${r.v.code} ${r.v.title} ${r.v.tags.join(' ')} ${role(r.v.jobRoleId)}`} searchPlaceholder="Search code, title or tag" exportName={`sops-${tab}`}
        filters={<Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 w-auto py-1.5"><option value="">All departments</option>{[...new Set(sops.map((s) => s.department).filter(Boolean))].map((d) => <option key={d} value={d}>{d}</option>)}</Select>}
        empty={<EmptyState compact icon={BookOpen} title="No SOPs here" />} />
      <SopDrawer sopId={sopId || null} onClose={() => setSopId(null)} />
    </div>
  )
}

function SopDrawer({ sopId, onClose }: { sopId: string | null; onClose: () => void }) {
  const now = useNow(60_000)
  const { sops, sopVersions, people, ackEvents, feedback, tasks, jobRoles } = useDB()
  const { person: me } = usePersona('manager')
  const [stepId, setStepId] = useState('')
  const [text, setText] = useState('')
  useEffect(() => { setStepId(''); setText('') }, [sopId])
  const sop = byId(sops, sopId)
  const v = sop && (byId(sopVersions, sop.currentVersionId) ?? sopVersions.filter((x) => x.sopId === sop.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0])
  if (!sop || !v) return <Drawer open={!!sopId} onClose={onClose} title="SOP not found"><EmptyState title="This SOP isn’t available" /></Drawer>
  const staff = people.filter((p) => p.jobRoleId === v.jobRoleId)
  const requests = feedback.filter((f) => f.lane === 'manager_request' && sopVersions.some((x) => x.sopId === sop.id && x.id === f.sopVersionId)).sort((a, b) => b.at.localeCompare(a.at))
  const approvals = v.reviews.filter((r) => r.decision === 'approve' && !r.stepId)
  const live = tasks.filter((t) => t.sopVersionId === v.id && hotelDateKey(t.start) === hotelDateKey(now) && t.status !== 'cancelled').length
  const submit = () => {
    if (text.trim().length < 5) return
    requestSopChange(me?.id ?? 'elena', v.id, text, stepId || undefined)
    toast.success('Change request sent to the authors', { description: `${v.code}${stepId ? ` · step ${v.steps.findIndex((s) => s.id === stepId) + 1}` : ''} — you’ll see it under requests below.` })
    setText(''); setStepId('')
  }
  return (
    <Drawer open={!!sopId} onClose={onClose} width="lg" title={`${v.code} · ${v.title}`} description={`${sop.department ?? byId(jobRoles, v.jobRoleId)?.team ?? 'Hotel'} · for ${byId(jobRoles, v.jobRoleId)?.name.toLowerCase()}s`}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">v{v.version}</Badge>
          {sop.retiredAt ? <Badge>Retired</Badge> : sop.currentVersionId ? <Badge tone="success" dot>Published</Badge> : <Badge tone="info" dot>{v.status === 'changes_requested' ? 'Changes requested' : 'In review'}</Badge>}
          <Badge>{v.timeTargetMin} min target</Badge>
          {v.steps.some((s) => s.requireCheck) && <Badge tone="info"><ShieldCheck size={11} aria-hidden /> Independent check</Badge>}
        </div>
        {sop.retiredAt && <Callout tone="neutral" icon={Archive} title={`Retired ${fDate(sop.retiredAt)}${sop.retiredById ? ` by ${byId(people, sop.retiredById)?.name}` : ''}`}>Readable for history; it can’t be assigned.</Callout>}
        {!sop.currentVersionId && <Callout tone="info" icon={Hourglass} title={`${approvals.length} of ${APPROVALS_REQUIRED} approvals`}>Not assignable until an author releases it after two independent approvals.</Callout>}
        <KeyValue columns={2} items={[
          ['Published', v.publishedAt ? fDateTime(v.publishedAt) : 'Not yet'],
          ['Approved by', approvals.length ? approvals.map((r) => byId(people, r.reviewerId)?.name).join(', ') : '—'],
          ['Author', byId(people, v.authorId)?.name ?? '—'],
          ['Rooms on this version today', live],
        ]} />
        <section aria-label="Steps"><h3 className="mb-2 text-sm font-semibold text-ink">Steps · exactly as staff see them</h3><StepProgress version={v} /></section>
        {sop.currentVersionId && !sop.retiredAt && staff.length > 0 && (
          <section aria-label="Acknowledgments">
            <h3 className="mb-2 text-sm font-semibold text-ink">Acknowledgments</h3>
            <ul className="divide-y divide-line rounded-cell border border-line">
              {staff.map((p) => { const a = ackEvents.find((x) => x.personId === p.id && x.kind === 'sop' && x.refId === v.id); return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2.5"><Avatar name={p.name} size={24} /><span className="truncate text-sm text-ink">{p.name}</span></span>
                  {a?.acknowledgedAt ? <Badge tone="success" dot>Acknowledged {fDate(a.acknowledgedAt)}</Badge> : a?.openedAt ? <Badge tone="warning" dot>Opened</Badge> : <Badge tone="danger" dot>Not opened</Badge>}
                </li>
              ) })}
            </ul>
          </section>
        )}
        <section aria-label="Request a change" className="card-inset p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><MessageSquarePlus size={15} className="text-forest-700" />Request a change</h3>
          <p className="mt-0.5 text-xs text-muted">Goes to the standards authors. Managers never edit an SOP directly.</p>
          <div className="mt-3 grid gap-3">
            <Field label="About" htmlFor="rstep"><Select id="rstep" value={stepId} onChange={(e) => setStepId(e.target.value)}><option value="">The whole SOP</option>{v.steps.map((s, i) => <option key={s.id} value={s.id}>Step {i + 1} · {s.instruction.slice(0, 60)}{s.instruction.length > 60 ? '…' : ''}</option>)}</Select></Field>
            <Field label="What should change, and why" htmlFor="rtext" hint="Be specific — what staff do now and what they should do instead."><Textarea id="rtext" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Add a check that the safe is left open and empty on checkout rooms" /></Field>
            <div className="flex justify-end"><Button variant="primary" icon={MessageSquarePlus} disabled={text.trim().length < 5} onClick={submit}>Send request</Button></div>
          </div>
        </section>
        {requests.length > 0 && (
          <section aria-label="Requests">
            <h3 className="mb-2 text-sm font-semibold text-ink">Manager requests on this SOP</h3>
            <ul className="space-y-2">{requests.map((f) => (
              <li key={f.id} className="rounded-cell border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-ink">{byId(people, f.fromId)?.name}</span><Badge tone={f.status === 'open' ? 'info' : 'success'}>{f.status === 'open' ? 'With authors' : 'Done'}</Badge></div>
                <p className="mt-1 text-ink-2">{f.text}</p><div className="mt-1 text-xs text-muted">{fDateTime(f.at)}{f.stepId ? ` · step ${v.steps.findIndex((s) => s.id === f.stepId) + 1}` : ''}</div>
              </li>
            ))}</ul>
          </section>
        )}
      </div>
    </Drawer>
  )
}

export function SopPolicy() {
  const rules = [
    { icon: BookOpen, title: 'Authors own SOPs', body: 'Standards authors write and edit SOPs. Managers and employees read them; managers request changes from the SOP drawer and never edit directly.' },
    { icon: Users, title: `${APPROVALS_REQUIRED} independent approvals`, body: `A version is released only after ${APPROVALS_REQUIRED} reviewers approve it. Authors can’t approve their own version, and changes requested by a reviewer send it back.` },
    { icon: Pin, title: 'Version pinning', body: 'Every task is pinned to the exact version that was live when it was assigned. A newer release mid-shift never changes a room already on someone’s list.' },
    { icon: ShieldCheck, title: 'Independent verification', body: 'Steps marked “independent check” need someone other than the person who did the room. No one verifies their own work, and sending a room back always needs a note.' },
    { icon: ToggleLeft, title: 'Guided or Standard', body: 'Guided shows every step; Standard shows milestones only. The mode changes what staff see, never what has to be verified.' },
    { icon: Eye, title: 'Reading is not accepting', body: 'Opening or replying to a notice is never task acceptance. Each person acknowledges every published SOP version for their role.' },
    { icon: Sparkles, title: 'Safety first', body: 'A time target never overrides safety or guest privacy. Staff never enter an occupied room, and “Do not enter yet” holds until the window opens.' },
    { icon: FileClock, title: 'Hotel time', body: 'All windows, due times and reports use the property clock (Colombo, UTC+5:30), not the device’s, so travelling managers never mis-schedule.' },
  ]
  return (
    <div className="space-y-6">
      <PageHeader title="Hotel SOP policy" description="How standards are written, released and followed at this property. These rules are enforced by the system, not just written down." />
      <Card>
        <CardHeader icon={ClipboardCheck} title="Lifecycle of a version" description="From first draft to retirement" />
        <div className="space-y-4 p-5">
          <Stepper steps={['Draft', 'In review', `${APPROVALS_REQUIRED} approvals`, 'Published', 'Superseded or retired']} current={3} />
          <p className="text-sm text-ink-2">Only a published version can be assigned. When a new version is published the old one becomes superseded; rooms already assigned keep running on it until they finish.</p>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((r) => (
          <Card key={r.title} className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cell bg-forest-50 text-forest-700"><r.icon size={17} aria-hidden /></span>
              <div><h2 className="text-[15px] font-semibold text-ink">{r.title}</h2><p className="mt-1 text-sm text-ink-2">{r.body}</p></div>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader icon={Lock} title="At a glance" />
        <div className="p-5">
          <KeyValue columns={3} items={[
            ['Approvals to release', APPROVALS_REQUIRED],
            ['Self-approval', 'Never allowed'],
            ['Self-verification', 'Never allowed'],
            ['Send back', 'Requires a written note'],
            ['Cancel a task', 'Requires a reason'],
            ['Version on a task', 'Pinned at assignment'],
            ['Acknowledgment', 'Per version, per role'],
            ['Clock', 'Hotel time · Asia/Colombo'],
            ['Who edits SOPs', 'Standards authors only'],
          ]} />
        </div>
      </Card>
      <p className="flex items-center gap-2 text-xs text-muted"><CheckCircle2 size={13} className="text-ok" />Questions about a rule? Request a change from any SOP in <Link to="/manager/sops" className="link">Employee SOPs</Link>.</p>
    </div>
  )
}
