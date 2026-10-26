import { Stat } from '@/components/Charts'
import { PageHeader, Pill, Section } from '@/components/ui'
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

