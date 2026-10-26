import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { CheckCircle2, ChevronDown, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Avatar, Button, PageHeader, Pill, SearchBox, Section } from '@/components/ui'
import { byId, priorityLabel, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, fTime, fromHotelInput, hotelDateKey, MIN, toHotelInput } from '@/lib/time'
import type { Priority, Shift } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'

const schema = z.object({
  personId: z.string().min(1, 'Choose a staff member'),
  roomId: z.string().min(1, 'Choose a room'),
  start: z.string().min(1, 'Set a start time'),
  priority: z.enum(['standard', 'high', 'urgent']),
})
type Form = z.infer<typeof schema>

export function useLiveShift(now: number, shifts: Shift[]) {
  return shifts.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end))
}

export function AssignRooms() {
  const { person: me } = usePersona('manager')
  const now = useNow()
  const { shifts, people, rooms, tasks, sops, sopVersions, attendance, cover, connection, assignTask, verifyTask } = useDB()
  const live = useLiveShift(now, shifts)
  const [shiftId, setShiftId] = useState(live?.id ?? shifts[0].id)
  const shift = byId(shifts, shiftId)!
  // Every published SOP can be turned into room tasks; each task pins the version shown here.
  const assignable = sops.filter((s) => byId(sopVersions, s.currentVersionId)?.status === 'published')
  const [sopId, setSopId] = useState(assignable.find((s) => s.id === 'hk-reset')?.id ?? assignable[0]?.id)
  const sop = byId(assignable, sopId) ?? assignable[0]
  const published = byId(sopVersions, sop?.currentVersionId)
  const [roomQ, setRoomQ] = useState('')
  const [coverOpen, setCoverOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const roster = people.filter((p) => shift.memberIds.includes(p.id) && p.jobRoleId === published?.jobRoleId)
  const unknown = shift.memberIds.filter((id) => !attendance.some((a) => a.personId === id && a.date === hotelDateKey(now))).length
  const filteredRooms = rooms.filter((r) => {
    const q = roomQ.toLowerCase(); if (!q) return true
    return r.number.includes(q) || `floor ${r.floor}`.includes(q) || r.wing.toLowerCase().includes(q) || (byId(people, r.yesterdayAttendantId)?.name.toLowerCase().includes(q) ?? false)
  })
  const deadline = Date.parse(shift.end)
  const accepting = now < deadline

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { personId: '', roomId: '', start: toHotelInput(Math.max(now, Date.parse(shift.start)) + 5 * MIN), priority: 'standard' },
  })
  const startVal = watch('start')
  const finish = startVal && published ? toHotelInput(Date.parse(fromHotelInput(startVal)) + published.timeTargetMin * MIN) : ''
  const lateFinish = finish && Date.parse(fromHotelInput(finish)) > deadline

  const onSubmit = (f: Form) => {
    if (!sop) return
    const start = fromHotelInput(f.start)
    const t = assignTask({ shiftId, personId: f.personId, roomId: f.roomId, start, end: fromHotelInput(finish), priority: f.priority as Priority, assignedById: me!.id, sopId: sop.id })
    if (t) { setDone(`Room ${byId(rooms, f.roomId)?.number} assigned to ${byId(people, f.personId)?.name}.`); reset({ ...f, roomId: '' }) }
    else setDone('That room already has open work on this shift.')
  }

  const shiftTasks = tasks.filter((t) => t.shiftId === shiftId && hotelDateKey(t.start) === hotelDateKey(now))
  const exceptions = shiftTasks.filter((t) => t.status === 'awaiting_verification' || (t.status !== 'done' && Date.parse(t.end) < now))
    .sort((a, b) => Number(b.status !== 'awaiting_verification') - Number(a.status !== 'awaiting_verification'))
  const pendingCover = cover.filter((c) => c.status === 'pending')

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager" title="Assign rooms" tagline="The right room, to the right person, on the exact standard." />

      <div className="grid gap-3 md:grid-cols-3">
        {shifts.map((s) => (
          <button key={s.id} onClick={() => setShiftId(s.id)} aria-pressed={s.id === shiftId}
            className={clsx('card p-4 text-left transition', s.id === shiftId ? 'border-gold-500/60 shadow-ring' : 'hover:border-white/20')}>
            <div className="flex items-center justify-between"><div className="font-semibold text-white">{s.name} shift</div>{s.id === live?.id && <Pill tone="ok">Live now</Pill>}</div>
            <div className="mt-1 text-sm text-sage-300">{fTime(s.start)} – {fTime(s.end)}</div>
            <div className="text-xs text-sage-300">{s.memberIds.length} rostered · {s.staffTarget} staff target</div>
          </button>
        ))}
      </div>
      <nav className="flex flex-wrap gap-4 text-sm" aria-label="Jump to">
        {[['#assign', 'Assign a room'], ['#decisions', 'Shift decisions'], ['#schedules', 'Employee schedules'], ['#status', 'Team & shift status']].map(([h, l]) => (
          <a key={h} href={h} className="text-gold-400 hover:underline">{l}</a>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Section id="status" title="Team & shift status" right={<span className="text-sm text-sage-300">{unknown} attendance unknown</span>}>
            <button onClick={() => setCoverOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl bg-forest-950/40 px-4 py-3 text-left text-sm">
              <span>Shift cover & time off · <b className="text-white">{pendingCover.length}</b> waiting</span>
              <ChevronDown size={16} className={clsx('transition', coverOpen && 'rotate-180')} />
            </button>
            <AnimatePresence>{coverOpen && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {pendingCover.slice(0, 4).map((c) => <li key={c.id} className="px-4 py-2 text-sm text-sage-300">{byId(people, c.personId)?.name} · {c.note}</li>)}
                <li className="px-4 py-2"><Link to="/manager/shift-cover" className="text-sm text-gold-400">Open shift cover & time off →</Link></li>
              </motion.ul>)}
            </AnimatePresence>
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-sage-300">Team connection</div>
              {connection.hotel === 'offline'
                ? <div className="flex items-center gap-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber"><WifiOff size={16} /> Live device status cannot be confirmed</div>
                : <div className="flex items-center gap-2 text-sm text-sage-200"><span className="h-2 w-2 rounded-full bg-ok" /> All team devices reporting</div>}
            </div>
          </Section>

          <Section id="assign" title="Assign a room">
            {!published ? <p className="mb-5 text-sm text-amber">No SOP is published yet. An author must release one before rooms can be assigned.</p> : (
              <div className="mb-5 space-y-3 rounded-xl bg-forest-950/40 p-4">
                <label className="block"><span className="label">SOP for this task</span>
                  <select className="input" value={sop?.id} onChange={(e) => { setSopId(e.target.value); setValue('personId', '') }}>
                    {assignable.map((s) => { const pv = byId(sopVersions, s.currentVersionId)!; return <option key={s.id} value={s.id}>{pv.code} · {pv.title} · {pv.timeTargetMin} min</option> })}
                  </select>
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-sage-200">Version {published.version} · {published.steps.length} steps{published.steps.some((x) => x.requireCheck) ? ' · needs independent verification' : ''}</div>
                  <Pill tone="ok"><CheckCircle2 size={12} /> You reviewed this exact version</Pill>
                </div>
              </div>
            )}
            <p className="mb-5 text-sm text-sage-300">{accepting
              ? `This shift is accepting assignments now. Set a due time before ${fDateTime(deadline)}, hotel time.`
              : 'This shift has closed for assignments.'}</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <Step n={1} title="Staff member" hint={`${roster.length} rostered for this job`} error={errors.personId?.message}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roster.map((p) => (
                    <label key={p.id} className={clsx('flex cursor-pointer items-center gap-3 rounded-xl border p-3', watch('personId') === p.id ? 'border-gold-500 bg-gold-500/10' : 'border-white/10 hover:border-white/20')}>
                      <input type="radio" value={p.id} {...register('personId')} className="sr-only" />
                      <Avatar initials={p.initials} size={32} /><div><div className="text-sm font-semibold text-white">{p.name}</div><div className="text-xs text-sage-300">{p.title}</div></div>
                    </label>
                  ))}
                </div>
              </Step>
              <Step n={2} title="Room" hint={`${rooms.length} rooms loaded`} error={errors.roomId?.message}>
                <SearchBox value={roomQ} onChange={setRoomQ} placeholder="Search room, floor, wing or yesterday's attendant" />
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {filteredRooms.map((r) => {
                    const busy = shiftTasks.some((t) => t.roomId === r.id && t.status !== 'done')
                    return (
                      <button type="button" key={r.id} disabled={busy} onClick={() => setValue('roomId', r.id, { shouldValidate: true })}
                        title={`Floor ${r.floor} · ${r.wing} · yesterday ${byId(people, r.yesterdayAttendantId)?.name}`}
                        className={clsx('rounded-xl border px-2 py-2 text-center disabled:opacity-35', watch('roomId') === r.id ? 'border-gold-500 bg-gold-500/10' : 'border-white/10 hover:border-white/25')}>
                        <div className="font-display text-lg font-bold text-white">{r.number}</div><div className="text-[10px] text-sage-300">{r.wing}</div>
                      </button>
                    )
                  })}
                </div>
              </Step>
              <Step n={3} title="Time slot · hotel time" hint={`${published?.timeTargetMin ?? 0} minutes`} error={errors.start?.message}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className="label">Start</span><input type="datetime-local" className="input" {...register('start')} /></label>
                  <label><span className="label">Finish (from SOP target)</span><input type="datetime-local" className="input" value={finish} readOnly /></label>
                </div>
                <p className="mt-2 text-xs text-sage-300">Hotel time, not this device's.</p>
                {lateFinish && <p className="mt-1 text-xs text-amber">This finishes after the shift closes.</p>}
              </Step>
              <label className="block max-w-xs"><span className="label">Priority</span>
                <select className="input" {...register('priority')}>{(['standard', 'high', 'urgent'] as Priority[]).map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}</select>
              </label>
              <div className="flex items-center gap-4">
                <Button type="submit" variant="gold" disabled={!accepting || !!lateFinish || !published}>Assign room</Button>
                <AnimatePresence>{done && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-ok">{done}</motion.span>}</AnimatePresence>
              </div>
            </form>
          </Section>

          <Section id="schedules" title="Employee schedules">
            <div className="space-y-3">
              {people.filter((p) => shift.memberIds.includes(p.id)).map((p) => {
                const pt = shiftTasks.filter((t) => t.personId === p.id)
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 truncate text-sm text-white">{p.name}</div>
                    <div className="relative h-8 flex-1 rounded-lg bg-forest-950/50">
                      {pt.map((t) => {
                        const s = Date.parse(shift.start), e = Date.parse(shift.end)
                        const l = ((Date.parse(t.start) - s) / (e - s)) * 100, w = ((Date.parse(t.end) - Date.parse(t.start)) / (e - s)) * 100
                        return <div key={t.id} title={`Room ${byId(rooms, t.roomId)?.number} · ${fTime(t.start)}`} style={{ left: `${Math.max(0, l)}%`, width: `${Math.max(2, w)}%` }}
                          className={clsx('absolute inset-y-1 rounded px-1 text-[10px] font-bold leading-6 text-forest-950', t.status === 'done' ? 'bg-ok/80' : t.status === 'awaiting_verification' ? 'bg-amber' : 'bg-gold-500')}>{byId(rooms, t.roomId)?.number}</div>
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        </div>

        <aside id="decisions" className="scroll-mt-6">
          <div className="card sticky top-6 p-5">
            <h2 className="text-lg font-semibold text-white">Shift decisions now</h2>
            <p className="mt-1 text-sm text-sage-300">Blocked work appears first. Independent checks stay visible for a clean handoff.</p>
            {exceptions.length === 0 ? <p className="mt-4 rounded-xl bg-forest-950/40 p-4 text-sm text-sage-200">No exception needs this shift right now.</p> : (
              <ul className="mt-4 space-y-2">
                {exceptions.map((t) => (
                  <li key={t.id} className="rounded-xl bg-forest-950/40 p-3 text-sm">
                    <div className="flex items-center justify-between"><b className="text-white">Room {byId(rooms, t.roomId)?.number}</b>
                      {t.status === 'awaiting_verification' ? <Pill tone="warn">Verify</Pill> : <Pill tone="danger">Overdue</Pill>}</div>
                    <div className="text-xs text-sage-300">{byId(people, t.personId)?.name} · due {fTime(t.end)}</div>
                    {t.status === 'awaiting_verification' && <Button size="sm" variant="primary" className="mt-2" onClick={() => verifyTask(t.id, me!.id)}>Record verification</Button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Step({ n, title, hint, error, children }: { n: number; title: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-3 flex w-full items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gold-500 text-sm font-bold text-forest-950">{n}</span>
        <span className="font-semibold text-white">{title}</span>
        {hint && <span className="text-xs text-sage-300">{hint}</span>}
      </legend>
      {children}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </fieldset>
  )
}
