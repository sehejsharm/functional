import clsx from 'clsx'
import {
  BedDouble, BookOpen, Building2, ChevronRight, ConciergeBell, HeartHandshake, LifeBuoy, ShieldAlert, Sparkles, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, Drawer, EmptyState, PageHeader, SearchBox } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { fDate } from '@/lib/time'
import type { AckEvent, Sop, SopVersion } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { GroupLabel } from './components'
import { readableSops } from './model'
import { useMyTasks } from './Work'

export const DEPT_ICON: Record<string, LucideIcon> = {
  Housekeeping: BedDouble, 'Public areas': Building2, Safety: ShieldAlert, 'Front office': ConciergeBell,
}
export const deptIcon = (d?: string) => (d && DEPT_ICON[d]) || BookOpen

type ReadState = { kind: 'read'; at: string } | { kind: 'updated'; from: string } | { kind: 'opened' } | { kind: 'unread' }

/** Has this person confirmed the current version — or only an older one, or only opened it? */
export function readState(sop: Sop, v: SopVersion, acks: AckEvent[], versions: SopVersion[], personId: string): ReadState {
  const mine = acks.filter((a) => a.personId === personId && a.kind === 'sop')
  const cur = mine.find((a) => a.refId === v.id)
  if (cur?.acknowledgedAt) return { kind: 'read', at: cur.acknowledgedAt }
  const older = mine.filter((a) => a.acknowledgedAt).map((a) => byId(versions, a.refId)).find((x) => x?.sopId === sop.id && x.id !== v.id)
  if (older) return { kind: 'updated', from: older.version }
  if (cur?.openedAt) return { kind: 'opened' }
  return { kind: 'unread' }
}

export function ReadBadge({ state }: { state: ReadState }) {
  switch (state.kind) {
    case 'read': return <Badge tone="success" dot>Read {fDate(state.at)}</Badge>
    case 'updated': return <Badge tone="warning" dot>Updated since v{state.from}</Badge>
    case 'opened': return <Badge tone="info" dot>Opened</Badge>
    default: return <Badge tone="neutral" dot>Not read</Badge>
  }
}

// Reference-only quick tips (not authoritative task SOPs).
const TIPS: { topic: string; icon: LucideIcon; items: { title: string; body: string }[] }[] = [
  { topic: 'Room care', icon: Sparkles, items: [
    { title: 'Making a hospital-corner bed', body: 'Tuck the sheet at 45°, fold the flap down, tuck the remainder flat.' },
    { title: 'Marble and brass surfaces', body: 'Use the neutral pH cleaner only. Buff brass dry with the yellow cloth.' },
    { title: 'Minibar restock', body: 'Labels face forward, oldest dates at the front.' },
    { title: 'Bathroom amenity layout', body: 'Left to right: shampoo, conditioner, body wash, lotion.' },
  ] },
  { topic: 'Safety', icon: ShieldAlert, items: [
    { title: 'Chemical handling', body: 'Gloves on, caps locked, bottom shelf of the trolley.' },
    { title: 'Needles and sharps', body: 'Do not touch. Leave the room, call security on 222.' },
    { title: 'Lifting linen bags', body: 'Bend the knees, keep the load close, max 12 kg.' },
    { title: 'Wet floors', body: 'Sign out before mopping, in until fully dry.' },
    { title: 'Fire assembly', body: 'Stairwell B to the car park assembly point.' },
  ] },
  { topic: 'Guest care', icon: HeartHandshake, items: [
    { title: 'Do Not Disturb', body: 'Never knock on DND. After 2 PM, slide the service card.' },
    { title: 'Guest belongings', body: 'Never move, open or read guest items.' },
    { title: 'Greeting in the corridor', body: 'Pause, smile, step aside, greet by time of day.' },
    { title: 'Lost and found', body: 'Log it, bag it, hand it to the office within the hour.' },
    { title: 'Privacy first', body: 'A time target must never override safety or guest privacy.' },
  ] },
  { topic: 'Shift support', icon: LifeBuoy, items: [
    { title: 'Asking for backup', body: 'Tell your supervisor before you fall behind, not after.' },
    { title: 'Reporting maintenance', body: 'Use Report an issue inside the room so it is linked to the room.' },
  ] },
]

export function EmployeeGuides() {
  const { person } = usePersona('employee')
  const { all } = useMyTasks(person?.id)
  const sops = useDB((s) => s.sops)
  const versions = useDB((s) => s.sopVersions)
  const acks = useDB((s) => s.ackEvents)
  const role = useDB((s) => byId(s.jobRoles, person?.jobRoleId))
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('all')
  const [tip, setTip] = useState<string | null>(null)

  const library = useMemo(() => readableSops(sops, versions), [sops, versions])
  const todaysSops = useMemo(() => new Set(all.map((t) => byId(versions, t.sopVersionId)?.sopId)), [all, versions])
  const departments = useMemo(() => [...new Set(library.map((x) => x.sop.department ?? 'Other'))].sort(), [library])

  const rows = useMemo(() => library.map(({ sop, v }) => ({
    sop, v,
    forRole: v.jobRoleId === person?.jobRoleId || todaysSops.has(sop.id),
    state: person ? readState(sop, v, acks, versions, person.id) : ({ kind: 'unread' } as ReadState),
  })), [library, person, todaysSops, acks, versions])

  const needle = q.trim().toLowerCase()
  const filtered = rows.filter(({ sop, v }) =>
    (dept === 'all' || (sop.department ?? 'Other') === dept) &&
    (!needle || [v.title, v.code, sop.department, ...v.tags, ...v.steps.map((s) => s.instruction)].join(' ').toLowerCase().includes(needle)))
  const required = filtered.filter((r) => r.forRole && r.state.kind !== 'read')
  const forRole = filtered.filter((r) => r.forRole)
  const others = filtered.filter((r) => !r.forRole)
  const tipHits = needle ? TIPS.flatMap((g) => g.items.filter((i) => (i.title + i.body).toLowerCase().includes(needle)).map((i) => ({ ...i, topic: g.topic }))) : []
  const openTip = TIPS.find((g) => g.topic === tip)

  if (!person) return null
  return (
    <div className="space-y-5">
      <PageHeader title="Guides" description="The hotel standards you work to — always the current published version." />

      <div className="space-y-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search guides, codes or steps" className="[&_input]:h-11" />
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Department">
          {['all', ...departments].map((d) => {
            const on = dept === d
            const I = d === 'all' ? BookOpen : deptIcon(d)
            const n = d === 'all' ? rows.length : rows.filter((r) => (r.sop.department ?? 'Other') === d).length
            return (
              <button key={d} type="button" role="tab" aria-selected={on} onClick={() => setDept(d)}
                className={clsx('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-medium transition',
                  on ? 'border-forest-900 bg-forest-900 text-white' : 'border-line-strong bg-surface text-ink-2 hover:text-ink')}>
                <I size={14} aria-hidden className={on ? 'text-gold-400' : 'text-muted'} />{d === 'all' ? 'All' : d}
                <span className={clsx('rounded-pill px-1.5 text-2xs font-semibold tabular', on ? 'bg-white/15' : 'bg-ink/[0.06]')}>{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {required.length > 0 && (
        <section aria-label="Required reading">
          <GroupLabel count={required.length}>Required reading</GroupLabel>
          <Card className="overflow-hidden border-amber/30">
            <div className="flex items-start gap-2.5 border-b border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-ink-2 sm:px-5">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />
              <span>Read these and confirm with <b className="font-semibold text-ink">“I’ve read this version”</b>. Your manager can see what is still open.</span>
            </div>
            <ul className="divide-y divide-line">{required.map((r) => <GuideRow key={r.sop.id} {...r} />)}</ul>
          </Card>
        </section>
      )}

      <section aria-label="For your role">
        <GroupLabel count={forRole.length}>For your role{role ? ` · ${role.name}` : ''}</GroupLabel>
        <Card className="overflow-hidden">
          {forRole.length ? <ul className="divide-y divide-line">{forRole.map((r) => <GuideRow key={r.sop.id} {...r} />)}</ul>
            : <EmptyState compact icon={BookOpen} title={needle || dept !== 'all' ? 'No guides for your role match' : 'No guides published for your role yet'}
              description={needle || dept !== 'all' ? 'Try another word or department.' : 'Your manager will share them here. Meanwhile, the hotel-wide standards below apply to everyone.'} />}
        </Card>
      </section>

      {others.length > 0 && (
        <section aria-label="Other hotel guides">
          <GroupLabel count={others.length}>Other hotel guides</GroupLabel>
          <Card className="overflow-hidden"><ul className="divide-y divide-line">{others.map((r) => <GuideRow key={r.sop.id} {...r} />)}</ul></Card>
        </section>
      )}

      {needle && !filtered.length && !tipHits.length && (
        <Card><EmptyState icon={BookOpen} title={`Nothing matches “${q}”`} description="Search by room task, SOP code or a word from a step." /></Card>
      )}

      <section aria-label="Quick reference">
        <GroupLabel>Quick reference</GroupLabel>
        <Card className="overflow-hidden">
          {needle ? (
            tipHits.length ? (
              <ul className="divide-y divide-line">{tipHits.map((h) => (
                <li key={h.title} className="px-4 py-3 sm:px-5"><div className="text-sm font-semibold text-ink">{h.title}</div><div className="mt-0.5 text-sm text-ink-2"><span className="text-muted">{h.topic} · </span>{h.body}</div></li>
              ))}</ul>
            ) : <p className="px-5 py-4 text-sm text-muted">No quick tips match.</p>
          ) : (
            <ul className="grid sm:grid-cols-2">
              {TIPS.map((g, i) => (
                <li key={g.topic} className={clsx('border-line', i > 0 && 'border-t', i === 1 && 'sm:border-t-0', i % 2 === 1 && 'sm:border-l')}>
                  <button type="button" onClick={() => setTip(g.topic)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 sm:px-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cell bg-gold-50 text-gold-700"><g.icon size={17} aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{g.topic}</span><span className="block text-xs text-muted">{g.items.length} tips · reference only</span></span>
                    <ChevronRight size={16} className="text-line-strong" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Drawer open={!!openTip} onClose={() => setTip(null)} title={openTip?.topic ?? ''} description="Reference only. The room’s SOP is always the standard for a task.">
        <ul className="space-y-3">{openTip?.items.map((i) => <li key={i.title} className="card-inset p-4"><div className="text-sm font-semibold text-ink">{i.title}</div><p className="mt-1 text-sm text-ink-2">{i.body}</p></li>)}</ul>
      </Drawer>
    </div>
  )
}

function GuideRow({ sop, v, state, forRole }: { sop: Sop; v: SopVersion; state: ReadState; forRole: boolean }) {
  const I = deptIcon(sop.department)
  return (
    <li>
      <Link to={`/employee/guides/${sop.id}`} className="group flex min-h-[68px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
        <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-cell', forRole ? 'bg-forest-50 text-forest-700' : 'bg-surface-2 text-muted ring-1 ring-inset ring-line')}><I size={18} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{v.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <span className="font-medium text-ink-2">{v.code}</span><span aria-hidden>·</span><span>v{v.version}</span><span aria-hidden>·</span>
            <span className="tabular">{v.timeTargetMin} min</span><span aria-hidden>·</span><span>{v.steps.length} step{v.steps.length === 1 ? '' : 's'}</span>
          </span>
          <span className="mt-1.5 block sm:hidden"><ReadBadge state={state} /></span>
        </span>
        <span className="max-sm:hidden"><ReadBadge state={state} /></span>
        <ChevronRight size={16} className="shrink-0 text-line-strong transition group-hover:text-ink-2" aria-hidden />
      </Link>
    </li>
  )
}
