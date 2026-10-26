import clsx from 'clsx'
import { Stat } from '@/components/Charts'
import { PageHeader, Pill, Section } from '@/components/ui'
import { stats } from '@/lib/analytics'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, fTime, hotelDateKey } from '@/lib/time'

/** Lead operations: property-wide, multi-shift views above the single-shift Assign rooms. */
export function PropertyBoard() {
  const now = useNow()
  const { shifts, tasks, people, sopVersions } = useDB()
  const today = tasks.filter((t) => hotelDateKey(t.start) === hotelDateKey(now))
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Lead operations" title="Property board" tagline="Every shift, at a glance." />
      <div className="grid gap-4 lg:grid-cols-3">
        {shifts.map((s) => {
          const ts = today.filter((t) => t.shiftId === s.id); const st = stats(ts, sopVersions, now)
          const live = Date.parse(s.start) <= now && now < Date.parse(s.end)
          return (
            <Section key={s.id} title={`${s.name} · ${fTime(s.start)}–${fTime(s.end)}`} right={live && <Pill tone="ok">Live</Pill>}>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-sage-300">Staff</dt><dd>{s.memberIds.length}/{s.staffTarget}</dd>
                <dt className="text-sage-300">Rooms</dt><dd>{ts.length} ({ts.filter((t) => t.status === 'done').length} done)</dd>
                <dt className="text-sage-300">To verify</dt><dd>{ts.filter((t) => t.status === 'awaiting_verification').length}</dd>
                <dt className="text-sage-300">On-time</dt><dd>{st.onTimePct}%</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1">{s.memberIds.map((id) => <Pill key={id}>{byId(people, id)?.name.split(' ')[0]}</Pill>)}</div>
            </Section>
          )
        })}
      </div>
    </div>
  )
}

export function ShiftPlanner() {
  const { shifts, people, cover } = useDB()
  const days = Array.from({ length: 7 }, (_, i) => hotelDateKey(Date.now() + i * 86_400_000))
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Lead operations" title="Shift planner" tagline="Plan the week before it plans you." />
      <Section>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead><tr><th className="py-2 text-left text-xs text-sage-300">Shift</th>{days.map((d) => <th key={d} className="text-xs font-semibold text-sage-300">{new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/5">{shifts.map((s) => (
              <tr key={s.id}><td className="py-3 font-semibold text-white">{s.name}</td>{days.map((d) => {
                const off = cover.filter((c) => c.shiftId === s.id && c.date === d && c.kind === 'time_off' && c.status !== 'declined')
                const n = s.memberIds.length - off.length
                return <td key={d} className="p-1"><div className={clsx('rounded-lg px-2 py-2 text-center text-xs', n < s.staffTarget ? 'bg-danger/15 text-danger' : 'bg-forest-950/50 text-sage-200')}
                  title={off.map((o) => `${byId(people, o.personId)?.name} off`).join(', ')}>{n}/{s.staffTarget}{off.length > 0 && ' · gap'}</div></td>
              })}</tr>))}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-sage-300">Red cells fall below staff target after approved or pending time off.</p>
      </Section>
    </div>
  )
}

export function OperationsPulse() {
  const now = useNow(5000)
  const { audit, people, tasks, connection } = useDB()
  const overdue = tasks.filter((t) => t.status !== 'done' && Date.parse(t.end) < now)
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Lead operations" title="Operations pulse" tagline="Live property-wide health and exceptions." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hotel system" value={connection.hotel === 'online' ? 'Live' : 'Offline'} />
        <Stat label="Overdue rooms" value={overdue.length} />
        <Stat label="Issues reported (24h)" value={audit.filter((a) => a.action === 'task.issue_reported' && Date.parse(a.at) > now - 86_400_000).length} />
        <Stat label="Events (24h)" value={audit.filter((a) => Date.parse(a.at) > now - 86_400_000).length} />
      </div>
      <Section title="Live feed">
        <ul className="space-y-2 text-sm">{audit.slice(0, 25).map((a) => (
          <li key={a.id} className={clsx('flex justify-between gap-3 rounded-xl px-3 py-2', a.action.includes('issue') ? 'bg-danger/10' : 'bg-forest-950/40')}>
            <span><b className="text-white">{byId(people, a.actorId)?.name ?? a.actorId}</b> · {a.action} · <span className="text-sage-300">{a.detail}</span></span>
            <span className="shrink-0 text-xs text-sage-300">{fDateTime(a.at)}</span></li>))}</ul>
      </Section>
    </div>
  )
}
