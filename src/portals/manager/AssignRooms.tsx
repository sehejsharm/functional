import clsx from 'clsx'
import { CheckCircle2, ClipboardList, Crown, Eye, Layers, ListChecks, Shuffle, Sparkles, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, DataTable, Drawer, EmptyState, Field, Input, PageHeader, SearchBox, Segmented, Select, Stepper, Textarea, type Column,
} from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, fTime, fromHotelInput, hotelDateKey, MIN, toHotelInput } from '@/lib/time'
import { toast } from '@/lib/toast'
import type { Person, Priority, Room, Shift, Task } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { Callout, OccupancyLegend, ShiftSwitcher, StepProgress } from './components'
import { OCCUPANCY, PRIORITY, firstName, fMinutes, isOpen, offOn } from './model'

export function useLiveShift(now: number, shifts: Shift[]) {
  return shifts.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end))
}

const BUFFER_MIN = 5
const roundUp5 = (ms: number) => Math.ceil(ms / (5 * MIN)) * 5 * MIN
const TYPE_SHORT: Record<string, string> = { 'Deluxe King': 'DK', 'Deluxe Twin': 'DT', 'Premier King': 'PK', 'Ocean Suite': 'Suite' }

/** Everything both assignment modes need for one shift + SOP. */
function useAssignContext(shiftId: string, sopId: string) {
  const now = useNow(30_000)
  const { shifts, people, rooms, tasks, sops, sopVersions, cover, attendance } = useDB()
  const shift = byId(shifts, shiftId) ?? shifts[0]
  // Every published, non-retired SOP can be assigned; each task pins the version shown here.
  const assignable = sops.filter((s) => !s.retiredAt && byId(sopVersions, s.currentVersionId)?.status === 'published')
  const sop = byId(assignable, sopId) ?? assignable[0]
  const version = byId(sopVersions, sop?.currentVersionId)
  const today = hotelDateKey(now)
  const shiftTasks = tasks.filter((t) => t.shiftId === shift.id && hotelDateKey(t.start) === hotelDateKey(shift.start) && t.status !== 'cancelled')
  const roster = people.filter((p) => shift.memberIds.includes(p.id) && p.jobRoleId === version?.jobRoleId)
  const away = (p: Person) => (p.status === 'on_leave' ? 'On leave' : offOn({ cover }, p.id, today) ? 'Time off today' : null)
  const load = (pid: string) => {
    const mine = shiftTasks.filter((t) => t.personId === pid)
    const lastEnd = mine.filter(isOpen).reduce((m, t) => Math.max(m, Date.parse(t.end)), 0)
    return { rooms: mine.length, open: mine.filter(isOpen).length, minutes: Math.round(mine.reduce((a, t) => a + (Date.parse(t.end) - Date.parse(t.start)) / MIN, 0)), lastEnd }
  }
  const checkedIn = (pid: string) => attendance.some((a) => a.personId === pid && a.date === today && a.mark !== 'pending')
  const shiftMin = Math.round((Date.parse(shift.end) - Date.parse(shift.start)) / MIN)
  const accepting = now < Date.parse(shift.end)
  const defaultStart = toHotelInput(roundUp5(Math.max(now, Date.parse(shift.start)) + 5 * MIN))
  return { now, shift, shifts, people, rooms, assignable, sop, version, roster, away, load, checkedIn, shiftMin, accepting, defaultStart, sopVersions, shiftTasks }
}
type Ctx = ReturnType<typeof useAssignContext>

export function AssignRooms() {
  const now = useNow(30_000)
  const [params] = useSearchParams()
  const { shifts, people, sops, sopVersions } = useDB()
  const live = useLiveShift(now, shifts)
  const pre = byId(people, params.get('staff'))
  const preSop = pre && sops.find((s) => !s.retiredAt && byId(sopVersions, s.currentVersionId)?.status === 'published' && byId(sopVersions, s.currentVersionId)?.jobRoleId === pre.jobRoleId)
  const firstOpen = shifts.find((s) => Date.parse(s.end) > now)
  const [mode, setMode] = useState<'single' | 'bulk'>(params.get('mode') === 'bulk' ? 'bulk' : 'single')
  const [shiftId, setShiftId] = useState(pre ? shifts.find((s) => s.memberIds.includes(pre.id))?.id ?? live?.id ?? shifts[0].id : live?.id ?? firstOpen?.id ?? shifts[0].id)
  const [sopId, setSopId] = useState(preSop?.id ?? 'hk-reset')
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const ctx = useAssignContext(shiftId, sopId)

  return (
    <div>
      <PageHeader title="Assign work" description="The right room, to the right person, on the exact version of the standard."
        meta={<><span>Hotel time · {fDateTime(now)}</span><span>{live ? `${live.name} shift live` : 'Between shifts'}</span></>}
        actions={<>
          <ShiftSwitcher shifts={shifts} value={ctx.shift.id} onChange={setShiftId} liveId={live?.id} size="sm" />
          <Segmented value={mode} onChange={setMode} items={[{ id: 'single', label: 'Single room' }, { id: 'bulk', label: 'Bulk assign' }]} />
        </>} />

      {!ctx.accepting && <Callout tone="neutral" className="mb-5" title={`The ${ctx.shift.name.toLowerCase()} shift has closed for assignments`}>It ended at {fTime(ctx.shift.end)}. Pick a later shift above.</Callout>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {mode === 'single'
          ? <SingleAssign ctx={ctx} sopId={ctx.sop?.id ?? ''} setSopId={setSopId} reviewed={reviewed} setReviewed={setReviewed} preRoom={params.get('room')} prePerson={pre?.id} />
          : <BulkAssign ctx={ctx} sopId={ctx.sop?.id ?? ''} setSopId={setSopId} reviewed={reviewed} setReviewed={setReviewed} />}
      </div>
    </div>
  )
}

// ── Shared pieces ──────────────────────────────────────────────────────────

function StepCard({ n, title, hint, done, children, actions }: { n: number; title: string; hint?: ReactNode; done?: boolean; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', done ? 'bg-forest-700 text-white' : 'bg-forest-50 text-forest-800 ring-1 ring-forest-700/20')}>
          {done ? <CheckCircle2 size={15} aria-label="Done" /> : n}
        </span>
        <div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold text-ink">{title}</h2>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

function SopStep({ ctx, sopId, setSopId, reviewed, setReviewed }: { ctx: Ctx; sopId: string; setSopId: (id: string) => void; reviewed: Set<string>; setReviewed: (s: Set<string>) => void }) {
  const [preview, setPreview] = useState(false)
  const v = ctx.version
  const ok = !!v && reviewed.has(v.id)
  const depts = [...new Set(ctx.assignable.map((s) => s.department ?? 'Other'))]
  const role = useDB((s) => s.jobRoles.find((r) => r.id === v?.jobRoleId))
  return (
    <StepCard n={1} title="Standard" hint="Every published SOP can be assigned. The task pins the exact version below." done={ok}>
      {!v ? <Callout tone="warning" title="No SOP is published yet">An author has to release one before work can be assigned.</Callout> : (
        <div className="space-y-4">
          <Field label="SOP for this work" htmlFor="sop">
            <Select id="sop" value={sopId} onChange={(e) => setSopId(e.target.value)}>
              {depts.map((d) => (
                <optgroup key={d} label={d}>
                  {ctx.assignable.filter((s) => (s.department ?? 'Other') === d).map((s) => { const pv = byId(ctx.sopVersions, s.currentVersionId)!; return <option key={s.id} value={s.id}>{pv.code} · {pv.title} · {pv.timeTargetMin} min</option> })}
                </optgroup>
              ))}
            </Select>
          </Field>
          <div className="card-inset flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
            <span className="font-semibold text-ink">{v.code} v{v.version}</span>
            <span className="text-ink-2">{v.steps.length} steps · {v.timeTargetMin} min target</span>
            <span className="text-ink-2">For {role?.name.toLowerCase()}s</span>
            {v.steps.some((s) => s.requireCheck) ? <Badge tone="info">Needs independent verification</Badge> : <Badge>No check needed</Badge>}
            <Button size="xs" variant="ghost" icon={Eye} className="ml-auto" onClick={() => setPreview(true)}>Preview steps</Button>
          </div>
          <Checkbox checked={ok} onChange={(c) => { const n = new Set(reviewed); if (c) n.add(v.id); else n.delete(v.id); setReviewed(n) }}
            label={<>You reviewed this exact version <b>v{v.version}</b></>} description={`Published ${v.publishedAt ? fDateTime(v.publishedAt) : ''}. Rooms assigned now keep v${v.version} even if a newer version is released mid-shift.`} />
        </div>
      )}
      <Drawer open={preview} onClose={() => setPreview(false)} title={v ? `${v.code} v${v.version}` : 'Steps'} description={v?.title} width="md"
        footer={v && <Button variant="primary" onClick={() => { const n = new Set(reviewed); n.add(v.id); setReviewed(n); setPreview(false) }}>I’ve reviewed this version</Button>}>
        {v && <StepProgress version={v} />}
      </Drawer>
    </StepCard>
  )
}

function useRoomFilter(rooms: Room[]) {
  const [q, setQ] = useState('')
  const [floor, setFloor] = useState('all')
  const people = useDB((s) => s.people)
  const shown = rooms.filter((r) => {
    if (floor !== 'all' && String(r.floor) !== floor) return false
    const s = q.trim().toLowerCase(); if (!s) return true
    return r.number.includes(s) || (r.type ?? '').toLowerCase().includes(s) || (r.guestName ?? '').toLowerCase().includes(s) || r.wing.toLowerCase().includes(s)
      || OCCUPANCY[r.occupancy ?? 'vacant_clean'].label.toLowerCase().includes(s) || (byId(people, r.yesterdayAttendantId)?.name.toLowerCase().includes(s) ?? false)
  })
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox value={q} onChange={setQ} placeholder="Room, guest, type, status or yesterday’s attendant" className="w-full sm:w-80" />
      <Segmented size="sm" value={floor} onChange={setFloor} items={[{ id: 'all', label: 'All floors' }, { id: '1', label: 'Floor 1' }, { id: '2', label: 'Floor 2' }, { id: '3', label: 'Floor 3' }]} />
    </div>
  )
  return { shown, toolbar, setFloor }
}

function RoomPick({ room, selected, blocker, onClick, onBlocked, multi }: { room: Room; selected: boolean; blocker: string | null; onClick: () => void; onBlocked: (why: string) => void; multi?: boolean }) {
  const o = OCCUPANCY[room.occupancy ?? 'vacant_clean']
  // Blocked rooms stay focusable (aria-disabled) so the reason is reachable by hover, keyboard and touch.
  return (
    <button type="button" aria-disabled={!!blocker || undefined} onClick={() => (blocker ? onBlocked(blocker) : onClick())} aria-pressed={selected} title={blocker ?? `Room ${room.number} · ${room.type} · ${o.label}${room.guestName ? ` · ${room.guestName}` : ''}`}
      aria-label={`Room ${room.number}, ${room.type}, ${o.label}${room.vip ? ', VIP' : ''}${room.guestName ? `, ${room.guestName}` : ''}${blocker ? ` — unavailable: ${blocker}` : ''}`}
      className={clsx('relative w-full rounded-cell border px-1.5 pb-1.5 pt-2 text-center transition', o.tile,
        selected ? 'ring-2 ring-forest-700 ring-offset-1' : 'hover:-translate-y-px hover:shadow-pop',
        blocker && 'cursor-not-allowed opacity-45 saturate-50 hover:translate-y-0 hover:shadow-none')}>
      {room.vip && <Crown size={11} className="absolute left-1 top-1 text-gold-700" aria-hidden />}
      {multi && selected && <CheckCircle2 size={13} className="absolute right-1 top-1 text-forest-700" aria-hidden />}
      <div className="text-[15px] font-bold leading-none tabular text-ink">{room.number}</div>
      <div className="mt-1 text-[10px] font-semibold text-ink-2">{o.short} · {TYPE_SHORT[room.type ?? ''] ?? room.type}</div>
    </button>
  )
}

function WorkloadPanel({ ctx, extra = {} }: { ctx: Ctx; extra?: Record<string, number> }) {
  const members = ctx.people.filter((p) => ctx.shift.memberIds.includes(p.id))
  return (
    <Card>
      <CardHeader icon={Users} title="Workload" description={`${ctx.shift.name} · ${fTime(ctx.shift.start)} – ${fTime(ctx.shift.end)} · ${fMinutes(ctx.shiftMin)} shift`} />
      <ul className="divide-y divide-line">
        {members.map((p) => {
          const l = ctx.load(p.id)
          const add = extra[p.id] ?? 0
          const eligible = ctx.roster.some((r) => r.id === p.id)
          const over = l.minutes + add > ctx.shiftMin
          return (
            <li key={p.id} className={clsx('px-5 py-3', !eligible && 'opacity-60')}>
              <div className="flex items-center gap-2.5">
                <Avatar name={p.name} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                    <span className={clsx('shrink-0 text-xs tabular', over ? 'font-semibold text-danger' : 'text-ink-2')}>{l.rooms}{add ? `+${Math.round(add / ((ctx.version?.timeTargetMin ?? 1)))}` : ''} rooms · {fMinutes(l.minutes + add)}</span>
                  </div>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-pill bg-ink/[0.07]" role="img" aria-label={`${fMinutes(l.minutes)} booked${add ? ` plus ${fMinutes(add)} planned` : ''} of ${fMinutes(ctx.shiftMin)}`}>
                    <div className={clsx('h-full', over ? 'bg-danger' : 'bg-forest-700')} style={{ width: `${Math.min(100, (l.minutes / ctx.shiftMin) * 100)}%` }} />
                    {add > 0 && <div className="h-full bg-gold-500" style={{ width: `${Math.min(100, (add / ctx.shiftMin) * 100)}%` }} />}
                  </div>
                  <div className="mt-1 text-2xs text-muted">{p.title}{!ctx.checkedIn(p.id) && ' · not checked in'}{ctx.away(p) && ` · ${ctx.away(p)}`}</div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex gap-4 border-t border-line px-5 py-2.5 text-2xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-pill bg-forest-700" />Booked</span>
        {Object.keys(extra).length > 0 && <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-pill bg-gold-500" />This plan</span>}
        <span>Faded: not this SOP’s job role</span>
      </div>
    </Card>
  )
}

function ShiftTimeline({ ctx }: { ctx: Ctx }) {
  const members = ctx.people.filter((p) => ctx.shift.memberIds.includes(p.id))
  const s = Date.parse(ctx.shift.start), e = Date.parse(ctx.shift.end)
  const hours = Array.from({ length: Math.round((e - s) / 3600000) + 1 }, (_, i) => s + i * 3600000)
  const rooms = ctx.rooms
  const nowPct = ((ctx.now - s) / (e - s)) * 100
  return (
    <Card>
      <CardHeader icon={Layers} title="Shift timeline" description="Booked rooms per person across the shift. Gaps are free time." />
      <div className="overflow-x-auto p-5">
        <div className="min-w-[640px]">
          <div className="relative ml-36 mb-1 h-4 text-2xs text-muted">
            {hours.map((h, i) => <span key={h} className={clsx('absolute whitespace-nowrap', i === 0 ? '' : i === hours.length - 1 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${(i / (hours.length - 1)) * 100}%` }}>{fTime(h).replace(':00', '').replace(/^0/, '')}</span>)}
          </div>
          <div className="space-y-1.5">
            {members.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-[8.25rem] shrink-0 truncate text-xs font-medium text-ink">{p.name}</div>
                <div className="relative h-7 flex-1 rounded-md bg-surface-2 ring-1 ring-inset ring-line">
                  {nowPct > 0 && nowPct < 100 && <span className="absolute inset-y-0 w-px bg-danger/60" style={{ left: `${nowPct}%` }} aria-hidden />}
                  {ctx.shiftTasks.filter((t) => t.personId === p.id).map((t) => {
                    const l = Math.max(0, ((Date.parse(t.start) - s) / (e - s)) * 100), r = Math.min(100, ((Date.parse(t.end) - s) / (e - s)) * 100)
                    if (r <= 0 || l >= 100) return null
                    const w = r - l
                    return (
                      <Link key={t.id} to={`/manager/tasks?task=${t.id}`} title={`Room ${byId(rooms, t.roomId)?.number} · ${fTime(t.start)}–${fTime(t.end)} · ${t.status.replace('_', ' ')}`}
                        style={{ left: `${l}%`, width: `${Math.max(2.5, w)}%` }}
                        className={clsx('absolute inset-y-1 overflow-hidden rounded px-1 text-[10px] font-bold leading-5 tabular',
                          t.status === 'done' ? 'bg-ok/20 text-ok' : t.status === 'awaiting_verification' ? 'bg-amber/20 text-amber' : t.status === 'in_progress' ? 'bg-info/20 text-info' : 'bg-forest-100 text-forest-800')}>
                        {byId(rooms, t.roomId)?.number}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── Single room ────────────────────────────────────────────────────────────

function SingleAssign({ ctx, sopId, setSopId, reviewed, setReviewed, preRoom, prePerson }: {
  ctx: Ctx; sopId: string; setSopId: (id: string) => void; reviewed: Set<string>; setReviewed: (s: Set<string>) => void; preRoom: string | null; prePerson?: string
}) {
  const nav = useNavigate()
  const { person: me } = usePersona('manager')
  const assignBlocker = useDB((s) => s.assignBlocker)
  const [personId, setPersonId] = useState(prePerson ?? '')
  const [roomId, setRoomId] = useState(preRoom ?? '')
  const [start, setStart] = useState(ctx.defaultStart)
  const [priority, setPriority] = useState<Priority>('standard')
  const [notes, setNotes] = useState('')
  const rf = useRoomFilter(ctx.rooms)
  const [why, setWhy] = useState<string | null>(null)
  const v = ctx.version
  useEffect(() => { setStart(ctx.defaultStart); setPersonId((p) => (ctx.roster.some((r) => r.id === p) ? p : '')) }, [ctx.shift.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPersonId((p) => (ctx.roster.some((r) => r.id === p) ? p : '')) }, [sopId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const r = byId(ctx.rooms, preRoom); if (r) rf.setFloor(String(r.floor)) }, [preRoom]) // eslint-disable-line react-hooks/exhaustive-deps

  const startIso = start ? fromHotelInput(start) : ''
  const endIso = startIso && v ? new Date(Date.parse(startIso) + v.timeTargetMin * MIN).toISOString() : ''
  const late = !!endIso && Date.parse(endIso) > Date.parse(ctx.shift.end)
  const early = !!startIso && Date.parse(startIso) < Date.parse(ctx.shift.start)
  const past = !!startIso && Date.parse(startIso) < ctx.now - 2 * MIN
  const blockerOf = (r: Room) => (v && sopId ? assignBlocker({ sopId, roomId: r.id, shiftId: ctx.shift.id, start: startIso || ctx.shift.start }) : 'Choose an SOP first')
  const room = byId(ctx.rooms, roomId)
  const roomBlock = room ? blockerOf(room) : null
  const person = byId(ctx.people, personId)
  const steps = [!!v && reviewed.has(v.id), !!person, !!room && !roomBlock, !!startIso && !late && !early]
  const current = steps.findIndex((x) => !x)
  const missing = [!steps[0] && 'Confirm you reviewed the SOP version', !steps[1] && 'Choose a staff member', !room ? 'Choose a room' : roomBlock, !startIso ? 'Set a start time' : late ? 'Finish is after the shift closes' : early ? 'Start is before the shift begins' : null].filter(Boolean) as string[]
  const canSubmit = ctx.accepting && !missing.length

  const submit = () => {
    if (!canSubmit || !v || !room || !person) return
    const t = useDB.getState().assignTask({ shiftId: ctx.shift.id, personId, roomId, start: startIso, end: endIso, priority, assignedById: me?.id ?? 'elena', sopId, notes: notes.trim() || undefined })
    if (!t) { toast.error(`Room ${room.number} wasn’t assigned`, { description: assignBlocker({ sopId, roomId, shiftId: ctx.shift.id, start: startIso }) ?? 'Something changed. Try again.' }); return }
    toast.success(`Room ${room.number} assigned to ${person.name}`, { description: `${v.code} v${v.version} · ${fTime(startIso)} – ${fTime(endIso)}${priority !== 'standard' ? ` · ${PRIORITY[priority].label} priority` : ''}`, action: { label: 'View task', onClick: () => nav(`/manager/tasks?task=${t.id}`) } })
    setRoomId(''); setNotes(''); setPriority('standard')
    setStart(toHotelInput(Date.parse(endIso) + BUFFER_MIN * MIN)) // ready for the same person's next room
  }

  return (
    <>
      <div className="min-w-0 space-y-4">
        <Card className="hidden px-5 py-4 sm:block"><Stepper steps={['Standard', 'Staff member', 'Room', 'Time & priority']} current={current === -1 ? 4 : current} /></Card>
        <SopStep ctx={ctx} sopId={sopId} setSopId={setSopId} reviewed={reviewed} setReviewed={setReviewed} />

        <StepCard n={2} title="Staff member" done={steps[1]} hint={v ? `${ctx.roster.length} on the ${ctx.shift.name.toLowerCase()} shift do this job` : undefined}>
          {!ctx.roster.length ? (
            <Callout tone="warning" title={`No one on the ${ctx.shift.name.toLowerCase()} shift does this job`} action={<Link to="/manager/shift-cover" className="link text-sm">Arrange cover</Link>}>
              Pick another shift or SOP, or approve a backup with the right role.
            </Callout>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3" role="radiogroup" aria-label="Staff member">
              {ctx.roster.map((p) => {
                const l = ctx.load(p.id), away = ctx.away(p)
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={personId === p.id} disabled={!!away} onClick={() => setPersonId(p.id)}
                    className={clsx('flex items-center gap-3 rounded-cell border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                      personId === p.id ? 'border-forest-700 bg-forest-50 ring-1 ring-forest-700' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2')}>
                    <Avatar name={p.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                      <span className="block truncate text-xs text-muted">{away ?? `${l.open} open · ${fMinutes(l.minutes)} booked`}{!away && !ctx.checkedIn(p.id) && ' · not checked in'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </StepCard>

        <StepCard n={3} title="Room" done={steps[2]} hint={`${ctx.rooms.length} rooms · busy and out-of-order rooms are greyed out — hover or tap one to see why`}>
          <div className="space-y-3">
            {rf.toolbar}
            <OccupancyLegend />
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10">
              {rf.shown.map((r) => <RoomPick key={r.id} room={r} selected={roomId === r.id} blocker={blockerOf(r)} onClick={() => { setRoomId(r.id); setWhy(null) }} onBlocked={setWhy} />)}
            </div>
            {!rf.shown.length && <EmptyState compact title="No rooms match" description="Try another floor or search." />}
            {why && <Callout tone="neutral" title="That room isn’t available" action={<button type="button" className="text-xs font-medium text-muted hover:text-ink" onClick={() => setWhy(null)}>Dismiss</button>}>{why}</Callout>}
            {room && roomBlock && <Callout tone="warning" title={`Room ${room.number} can’t take this`}>{roomBlock}</Callout>}
          </div>
        </StepCard>

        <StepCard n={4} title="Time & priority" done={steps[3]} hint="Hotel time (Colombo), not this device’s clock">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start" htmlFor="start" required error={early ? `The shift starts at ${fTime(ctx.shift.start)}.` : undefined} hint={past && !early ? 'This start is in the past — the room will show as overdue.' : undefined}>
              <Input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} invalid={early} />
            </Field>
            <Field label="Finish" htmlFor="finish" hint={v ? `Start + ${v.timeTargetMin} min SOP target` : undefined} error={late ? `Ends after the shift closes at ${fTime(ctx.shift.end)}.` : undefined}>
              <Input id="finish" type="datetime-local" value={endIso ? toHotelInput(endIso) : ''} readOnly className="bg-surface-2" invalid={late} />
            </Field>
            <Field label="Priority">
              <Segmented value={priority} onChange={setPriority} items={(['standard', 'high', 'urgent'] as Priority[]).map((p) => ({ id: p, label: PRIORITY[p].label }))} />
            </Field>
            <Field label="Note for the employee" htmlFor="notes" hint="Optional · shown on their room card" className="sm:col-span-2">
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. VIP arrival at 4 PM — fresh flowers on the desk" maxLength={200} />
            </Field>
          </div>
        </StepCard>
        <ShiftTimeline ctx={ctx} />
      </div>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader icon={ClipboardList} title="Summary" />
          <dl className="divide-y divide-line text-sm">
            {([
              ['SOP', v ? <><b className="font-semibold">{v.code}</b> v{v.version}<div className="text-xs text-muted">{v.title}</div></> : '—'],
              ['Staff', person ? <span className="flex items-center gap-2"><Avatar name={person.name} size={22} />{person.name}</span> : <span className="text-muted">Not chosen</span>],
              ['Room', room ? <>Room <b className="font-semibold">{room.number}</b>{room.vip && <Crown size={12} className="ml-1 inline text-gold-700" aria-label="VIP" />}<div className="text-xs text-muted">{room.type} · {OCCUPANCY[room.occupancy ?? 'vacant_clean'].label}{room.guestName ? ` · ${room.guestName}` : ''}</div></> : <span className="text-muted">Not chosen</span>],
              ['Window', startIso && endIso ? `${fTime(startIso)} – ${fTime(endIso)}` : '—'],
              ['Priority', PRIORITY[priority].label],
            ] as [string, ReactNode][]).map(([k, val]) => (
              <div key={k} className="flex gap-3 px-5 py-2.5"><dt className="w-16 shrink-0 text-xs text-muted">{k}</dt><dd className="min-w-0 flex-1 text-ink">{val}</dd></div>
            ))}
          </dl>
          <div className="space-y-3 border-t border-line px-5 py-4">
            {missing.length > 0 && <ul className="space-y-1 text-xs text-muted">{missing.map((m) => <li key={m} className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-muted" />{m}</li>)}</ul>}
            <Button variant="gold" size="lg" block icon={CheckCircle2} disabled={!canSubmit} onClick={submit}>Assign room</Button>
            {person && <p className="text-center text-xs text-muted">{firstName(person)} sees it on their phone straight away.</p>}
          </div>
        </Card>
        <WorkloadPanel ctx={ctx} extra={person && v && steps[3] ? { [person.id]: v.timeTargetMin } : {}} />
      </aside>
    </>
  )
}

// ── Bulk assign ────────────────────────────────────────────────────────────

interface PlanRow { roomId: string; personId: string; start: string; end: string; problem: string | null }

function BulkAssign({ ctx, sopId, setSopId, reviewed, setReviewed }: { ctx: Ctx; sopId: string; setSopId: (id: string) => void; reviewed: Set<string>; setReviewed: (s: Set<string>) => void }) {
  const nav = useNavigate()
  const { person: me } = usePersona('manager')
  const assignBlocker = useDB((s) => s.assignBlocker)
  const [staff, setStaff] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [start, setStart] = useState(ctx.defaultStart)
  const [priority, setPriority] = useState<Priority>('standard')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<{ created: Task[]; skipped: { roomId: string; reason: string }[] } | null>(null)
  const rf = useRoomFilter(ctx.rooms)
  const [why, setWhy] = useState<string | null>(null)
  const v = ctx.version
  useEffect(() => { setStart(ctx.defaultStart); setStaff([]); setPicked([]) }, [ctx.shift.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setStaff((s) => s.filter((id) => ctx.roster.some((r) => r.id === id))) }, [sopId]) // eslint-disable-line react-hooks/exhaustive-deps

  const startIso = start ? fromHotelInput(start) : ''
  const blockerOf = (r: Room) => (v ? assignBlocker({ sopId, roomId: r.id, shiftId: ctx.shift.id, start: startIso || ctx.shift.start }) : 'Choose an SOP first')
  const available = rf.shown.filter((r) => !blockerOf(r))
  const toggleRoom = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  // Round-robin over the chosen staff; each person's rooms run back to back with a 5-minute buffer,
  // starting after whatever they already have booked.
  const plan = useMemo<PlanRow[]>(() => {
    if (!v || !staff.length || !startIso) return []
    const order = picked.map((id) => byId(ctx.rooms, id)!).filter(Boolean).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    const cursor: Record<string, number> = {}
    staff.forEach((pid) => { cursor[pid] = Math.max(Date.parse(startIso), ctx.load(pid).lastEnd ? ctx.load(pid).lastEnd + BUFFER_MIN * MIN : 0) })
    return order.map((r, i) => {
      const pid = staff[i % staff.length]
      const s = roundUp5(cursor[pid]), e = s + v.timeTargetMin * MIN
      cursor[pid] = e + BUFFER_MIN * MIN
      const block = assignBlocker({ sopId, roomId: r.id, shiftId: ctx.shift.id, start: new Date(s).toISOString() })
      return { roomId: r.id, personId: pid, start: new Date(s).toISOString(), end: new Date(e).toISOString(), problem: block ?? (e > Date.parse(ctx.shift.end) ? 'Would finish after the shift closes' : null) }
    })
  }, [v, staff, picked, startIso, ctx, sopId, assignBlocker])

  const ready = plan.filter((p) => !p.problem)
  const extra = ready.reduce<Record<string, number>>((m, p) => ({ ...m, [p.personId]: (m[p.personId] ?? 0) + (v?.timeTargetMin ?? 0) }), {})
  const ok = !!v && reviewed.has(v.id)
  const missing = [!ok && 'Confirm you reviewed the SOP version', !staff.length && 'Choose at least one person', !picked.length && 'Choose rooms', picked.length > 0 && staff.length > 0 && !ready.length && 'Every room in the plan has a problem'].filter(Boolean) as string[]

  const submit = () => {
    if (!v || !ok || !ready.length || !ctx.accepting) return
    const r = useDB.getState().bulkAssign(ready.map((p) => ({ shiftId: ctx.shift.id, personId: p.personId, roomId: p.roomId, start: p.start, end: p.end, priority, assignedById: me?.id ?? 'elena', sopId, notes: notes.trim() || undefined })))
    const skipped = [...plan.filter((p) => p.problem).map((p) => ({ roomId: p.roomId, reason: p.problem! })), ...r.skipped]
    const num = (id: string) => byId(ctx.rooms, id)?.number
    const summary = skipped.slice(0, 3).map((s) => `${num(s.roomId)}: ${s.reason.replace(/^Room \d+ /, '')}`).join(' · ')
    if (r.created.length) toast.success(`${r.created.length} assigned, ${skipped.length} skipped`, { description: skipped.length ? `${summary}${skipped.length > 3 ? ` · +${skipped.length - 3} more` : ''}` : `${v.code} v${v.version} across ${staff.length} ${staff.length === 1 ? 'person' : 'people'}.`, action: { label: 'View tasks', onClick: () => nav('/manager/tasks') } })
    else toast.error('Nothing was assigned', { description: summary })
    setResult({ created: r.created, skipped }); setPicked([])
  }

  const columns: Column<PlanRow>[] = [
    { key: 'room', header: 'Room', sort: (p) => byId(ctx.rooms, p.roomId)?.number, cell: (p) => { const r = byId(ctx.rooms, p.roomId); return <span className="font-semibold tabular">{r?.number}<span className="ml-2 text-xs font-normal text-muted">{OCCUPANCY[r?.occupancy ?? 'vacant_clean'].label}</span></span> } },
    { key: 'staff', header: 'Staff', sort: (p) => byId(ctx.people, p.personId)?.name, cell: (p) => <span className="flex items-center gap-2"><Avatar name={byId(ctx.people, p.personId)?.name} size={22} />{byId(ctx.people, p.personId)?.name}</span> },
    { key: 'window', header: 'Window', sort: (p) => p.start, cell: (p) => <span className="tabular text-ink-2">{fTime(p.start)} – {fTime(p.end)}</span> },
    { key: 'status', header: 'Check', cell: (p) => p.problem ? <Badge tone="warning">{p.problem.replace(/^Room \d+ /, '')}</Badge> : <Badge tone="success" dot>Ready</Badge> },
  ]

  return (
    <>
      <div className="min-w-0 space-y-4">
        <SopStep ctx={ctx} sopId={sopId} setSopId={setSopId} reviewed={reviewed} setReviewed={setReviewed} />
        <StepCard n={2} title="Staff" done={staff.length > 0} hint="Rooms are shared out round-robin in room-number order"
          actions={ctx.roster.length > 1 && <Button size="xs" variant="ghost" onClick={() => setStaff(staff.length === ctx.roster.filter((p) => !ctx.away(p)).length ? [] : ctx.roster.filter((p) => !ctx.away(p)).map((p) => p.id))}>{staff.length ? 'Clear' : 'Select all'}</Button>}>
          {!ctx.roster.length ? <Callout tone="warning" title={`No one on the ${ctx.shift.name.toLowerCase()} shift does this job`}>Pick another shift or SOP.</Callout> : (
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {ctx.roster.map((p) => {
                const on = staff.includes(p.id), away = ctx.away(p), l = ctx.load(p.id)
                return (
                  <div key={p.id} className={clsx('rounded-cell border p-3 transition', on ? 'border-forest-700 bg-forest-50' : 'border-line')}>
                    <Checkbox checked={on} disabled={!!away} onChange={() => setStaff((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                      label={<span className="font-semibold">{p.name}</span>} description={away ?? `${l.open} open · ${fMinutes(l.minutes)} booked`} />
                  </div>
                )
              })}
            </div>
          )}
        </StepCard>
        <StepCard n={3} title="Rooms" done={picked.length > 0} hint={`${picked.length} selected`}
          actions={<div className="flex gap-1">
            <Button size="xs" variant="ghost" icon={Sparkles} onClick={() => setPicked((p) => [...new Set([...p, ...available.filter((r) => r.occupancy === 'vacant_dirty' || r.occupancy === 'due_out').map((r) => r.id)])])}>Add dirty & due out</Button>
            <Button size="xs" variant="ghost" onClick={() => setPicked((p) => [...new Set([...p, ...available.map((r) => r.id)])])}>Add all shown</Button>
            {picked.length > 0 && <Button size="xs" variant="ghost" onClick={() => setPicked([])}>Clear</Button>}
          </div>}>
          <div className="space-y-3">
            {rf.toolbar}
            <OccupancyLegend />
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-10">
              {rf.shown.map((r) => <RoomPick key={r.id} multi room={r} selected={picked.includes(r.id)} blocker={blockerOf(r)} onClick={() => { toggleRoom(r.id); setWhy(null) }} onBlocked={setWhy} />)}
            </div>
            {why && <Callout tone="neutral" title="That room isn’t available" action={<button type="button" className="text-xs font-medium text-muted hover:text-ink" onClick={() => setWhy(null)}>Dismiss</button>}>{why}</Callout>}
          </div>
        </StepCard>
        <StepCard n={4} title="Timing & priority" done={!!startIso} hint={`Each room gets the ${v?.timeTargetMin ?? '—'} min SOP target plus a ${BUFFER_MIN} min buffer`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First start" htmlFor="bstart" hint="Hotel time. People with rooms already booked start after their last one.">
              <Input id="bstart" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Priority for all"><Segmented value={priority} onChange={setPriority} items={(['standard', 'high', 'urgent'] as Priority[]).map((p) => ({ id: p, label: PRIORITY[p].label }))} /></Field>
            <Field label="Note for every room" htmlFor="bnotes" hint="Optional" className="sm:col-span-2"><Textarea id="bnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Floor 3 VIP block — verified by 1:30 PM" maxLength={200} /></Field>
          </div>
        </StepCard>

        <Card>
          <CardHeader icon={Shuffle} title="Preview" description={plan.length ? `${ready.length} ready · ${plan.length - ready.length} with a problem` : 'Choose staff and rooms to see the plan.'} />
          {plan.length ? <DataTable bare dense rows={plan} columns={columns} rowKey={(p) => p.roomId} pageSize={12} caption="Assignment preview" />
            : <EmptyState compact icon={ListChecks} title="No plan yet" description="Pick at least one person and one room." />}
        </Card>

      </div>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader icon={ClipboardList} title="Bulk summary" />
          <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
            {[['Rooms', picked.length], ['People', staff.length], ['Ready', ready.length]].map(([k, n]) => (
              <div key={k} className="px-2 py-3"><div className="text-xl font-semibold tabular text-ink">{n}</div><div className="text-2xs text-muted">{k}</div></div>
            ))}
          </div>
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm text-ink-2">{v ? <><b className="text-ink">{v.code} v{v.version}</b> · {plan.length ? `last room finishes ${fTime(plan.reduce((m, p) => (p.end > m ? p.end : m), plan[0].end))}` : `${v.timeTargetMin} min per room`}</> : 'Choose an SOP'}</p>
            {missing.length > 0 && <ul className="space-y-1 text-xs text-muted">{missing.map((m) => <li key={m} className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-muted" />{m}</li>)}</ul>}
            <Button variant="gold" size="lg" block icon={CheckCircle2} disabled={!!missing.length || !ctx.accepting} onClick={submit}>Assign {ready.length || ''} room{ready.length === 1 ? '' : 's'}</Button>
          </div>
        </Card>
        {result && (
          <Callout tone={result.skipped.length ? 'warning' : 'success'} title={`${result.created.length} assigned, ${result.skipped.length} skipped`}
            action={<Link to="/manager/tasks" className="link text-sm">Open Live tasks</Link>}>
            {result.skipped.length > 0 && <ul className="mt-1 list-inside list-disc space-y-0.5">{result.skipped.map((s) => <li key={s.roomId}>Room {byId(ctx.rooms, s.roomId)?.number}: {s.reason.replace(/^Room \d+ /, '')}</li>)}</ul>}
          </Callout>
        )}
        <WorkloadPanel ctx={ctx} extra={extra} />
      </aside>
    </>
  )
}


