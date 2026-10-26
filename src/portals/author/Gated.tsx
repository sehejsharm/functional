import { useState } from 'react'
import { Stat } from '@/components/Charts'
import { Button, PageHeader, Pill, Section } from '@/components/ui'
import { stats } from '@/lib/analytics'
import { useDB } from '@/lib/db'

export function UseResults() {
  const { sopVersions, tasks, ackEvents, feedback } = useDB()
  const pub = sopVersions.filter((v) => v.status === 'published' || v.status === 'superseded')
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Author" title="Use & results" tagline="Is this SOP actually working?" />
      {pub.map((v) => {
        const ts = tasks.filter((t) => t.sopVersionId === v.id); const st = stats(ts, sopVersions)
        return (
          <Section key={v.id} title={`${v.code} · ${v.version} · ${v.title}`} right={<Pill tone={v.status === 'published' ? 'ok' : 'neutral'}>{v.status}</Pill>}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Used in tasks" value={ts.length} />
              <Stat label="Reads (opened)" value={ackEvents.filter((a) => a.refId === v.id && a.openedAt).length} />
              <Stat label="On-time" value={`${st.onTimePct}%`} hint={`target ${v.timeTargetMin} min`} />
              <Stat label="Verification pass" value={`${st.verifyPassPct}%`} />
              <Stat label="Open feedback" value={feedback.filter((f) => f.sopVersionId === v.id && f.status === 'open').length} />
            </div>
          </Section>
        )
      })}
    </div>
  )
}

export function PlatformFoundation() {
  const { jobRoles, properties } = useDB()
  const reset = useDB((s) => s.reset)
  const [scheme, setScheme] = useState('{TEAM}-{NUMBER}')
  const [defTarget, setDefTarget] = useState(15)
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Platform foundation" tagline="How Mise is set up for this property." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Properties">{properties.map((p) => <div key={p.id} className="flex justify-between text-sm"><span className="text-white">{p.name}</span><span className="text-sage-300">{p.city} · {p.id}</span></div>)}</Section>
        <Section title="Role definitions"><ul className="space-y-1 text-sm">{jobRoles.map((r) => <li key={r.id} className="flex justify-between"><span className="text-white">{r.name}</span><span className="text-sage-300">{r.team}</span></li>)}</ul>
          <p className="mt-3 text-xs text-sage-300">Access tiers: Shift manager → Senior manager → Property admin.</p></Section>
        <Section title="SOP code numbering"><input className="input" value={scheme} onChange={(e) => setScheme(e.target.value)} /><p className="mt-2 text-xs text-sage-300">Example: HK-102</p></Section>
        <Section title="Default time-target policy"><input type="number" className="input" value={defTarget} onChange={(e) => setDefTarget(Number(e.target.value))} />
          <p className="mt-2 text-xs text-sage-300">A time target must never override safety or guest privacy.</p></Section>
        <Section title="Demo data"><Button variant="danger" onClick={() => { if (confirm('Reset all shared demo data?')) reset() }}>Reset demo data</Button></Section>
      </div>
    </div>
  )
}
