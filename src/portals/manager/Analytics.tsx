import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bars, LineChart, Stat } from '@/components/Charts'
import { Avatar, Empty, PageHeader, Pill, Section, Tabs } from '@/components/ui'
import { byDay, durationHistogram, stats } from '@/lib/analytics'
import { byId, useDB } from '@/lib/db'
import { fDate } from '@/lib/time'

const RANGES = { '7': 7, '14': 14, '30': 30 } as const
type Range = keyof typeof RANGES

function useRangeTasks(range: Range) {
  const tasks = useDB((s) => s.tasks)
  return useMemo(() => tasks.filter((t) => Date.parse(t.start) > Date.now() - RANGES[range] * 86_400_000), [tasks, range])
}

export function TeamProgress() {
  const [range, setRange] = useState<Range>('14')
  const { people, sopVersions, attendance, audit } = useDB()
  const tasks = useRangeTasks(range)
  const s = stats(tasks, sopVersions)
  const crew = people.filter((p) => tasks.some((t) => t.personId === p.id))
  const days = RANGES[range]
  const att = crew.length ? Math.round((attendance.filter((a) => a.mark !== 'pending' && Date.parse(a.at) > Date.now() - days * 86400_000).length / (crew.length * days * 6 / 7)) * 100) : 0
  const trend = byDay(tasks, sopVersions, days).filter((d) => d.completed > 0).map((d) => ({ x: d.key, y: d.onTimePct }))
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Team progress" tagline="Are we hitting the time targets our standards set?"
        right={<Tabs value={range} onChange={setRange} items={[{ id: '7', label: '7 days' }, { id: '14', label: '14 days' }, { id: '30', label: '30 days' }]} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="On-time completion" value={`${s.onTimePct}%`} hint={`${s.completed} rooms completed`} />
        <Stat label="Avg vs SOP target" value={`${s.avgDelta > 0 ? '+' : ''}${s.avgDelta} min`} hint="negative is faster" />
        <Stat label="Overdue / escalated" value={s.overdue} />
        <Stat label="Attendance reliability" value={`${Math.min(100, att)}%`} />
      </div>
      <Section title="Completion rate over the last shifts">{trend.length ? <LineChart points={trend} label="On-time completion by shift" /> : <Empty title="No completed shifts in range" />}</Section>
      <Section title="By employee">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-sage-300"><tr><th className="py-2">Name</th><th>Tasks completed</th><th>On-time %</th><th>Avg vs target</th><th>Exceptions raised</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {crew.map((p) => ({ p, st: stats(tasks.filter((t) => t.personId === p.id), sopVersions), ex: audit.filter((a) => a.actorId === p.id && a.action === 'task.issue_reported').length }))
                .sort((a, b) => b.st.onTimePct - a.st.onTimePct).map(({ p, st, ex }) => (
                  <tr key={p.id}>
                    <td className="py-2.5"><Link to={`/manager/staff/${p.id}`} className="flex items-center gap-2 hover:text-gold-400"><Avatar initials={p.initials} size={28} />{p.name}</Link></td>
                    <td>{st.completed}</td><td><Pill tone={st.onTimePct >= 70 ? 'ok' : st.onTimePct >= 50 ? 'warn' : 'danger'}>{st.onTimePct}%</Pill></td>
                    <td>{st.avgDelta > 0 ? '+' : ''}{st.avgDelta} min</td><td>{ex}</td>
                  </tr>))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

export function StaffDetail() {
  const { id } = useParams()
  const { people, tasks, sopVersions, attendance, ackEvents } = useDB()
  const p = byId(people, id)
  if (!p) return <Empty title="Person not found" />
  const mine = tasks.filter((t) => t.personId === p.id)
  const s = stats(mine, sopVersions)
  const trend = byDay(mine, sopVersions, 14).filter((d) => d.completed).map((d) => ({ x: d.key, y: d.onTimePct }))
  const acks = ackEvents.filter((a) => a.personId === p.id && a.kind === 'sop')
  return (
    <div className="space-y-6">
      <Link to="/manager/team-progress" className="inline-flex items-center gap-1 text-sm text-sage-300 hover:text-white"><ArrowLeft size={14} /> Team progress</Link>
      <PageHeader title={p.name} tagline={p.title} right={<Avatar initials={p.initials} size={52} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Rooms completed" value={s.completed} /><Stat label="On-time" value={`${s.onTimePct}%`} />
        <Stat label="Avg vs target" value={`${s.avgDelta} min`} /><Stat label="Check-ins (30 days)" value={attendance.filter((a) => a.personId === p.id).length} />
      </div>
      <Section title="Performance trend">{trend.length ? <LineChart points={trend} label="On-time trend" /> : <Empty title="No history yet" />}</Section>
      <Section title="SOP acceptance record">
        <ul className="divide-y divide-white/5 text-sm">{acks.map((a) => { const v = byId(sopVersions, a.refId); return (
          <li key={a.id} className="flex justify-between py-2"><span>{v?.code} · {v?.version}</span><span className="text-sage-300">{a.acknowledgedAt ? `Accepted ${fDate(a.acknowledgedAt)}` : a.openedAt ? 'Opened, not confirmed' : 'Not opened'}</span></li>) })}
          {!acks.length && <li className="py-2 text-sage-300">No SOP events.</li>}</ul>
      </Section>
    </div>
  )
}

export function SopResults() {
  const { sopVersions, tasks, sops } = useDB()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="SOP results" tagline="How each standard performs across everyone who runs it." />
      {sops.filter((s) => s.currentVersionId).map((sop) => {
        const vIds = sopVersions.filter((v) => v.sopId === sop.id).map((v) => v.id)
        const ts = tasks.filter((t) => vIds.includes(t.sopVersionId))
        const st = stats(ts, sopVersions)
        const v = byId(sopVersions, sop.currentVersionId)!
        return (
          <Section key={sop.id} title={`${v.code} · ${v.title}`} right={<Pill tone="gold">Current {v.version}</Pill>}>
            <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-sage-300">Runs</dt><dd>{ts.length}</dd></div>
                <div className="flex justify-between"><dt className="text-sage-300">On-time</dt><dd>{st.onTimePct}%</dd></div>
                <div className="flex justify-between"><dt className="text-sage-300">Verification pass rate</dt><dd>{st.verifyPassPct}%</dd></div>
                <div className="flex justify-between"><dt className="text-sage-300">Target</dt><dd>{v.timeTargetMin} min</dd></div>
              </dl>
              <div><div className="mb-2 text-xs text-sage-300">Completion time distribution (minutes)</div><Bars data={durationHistogram(ts)} label="Completion time distribution" unit="" /></div>
            </div>
          </Section>
        )
      })}
    </div>
  )
}
