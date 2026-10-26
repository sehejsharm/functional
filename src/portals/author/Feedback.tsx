import { RefreshCw, Star } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, PageHeader, Pill, Section } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { fDateTime } from '@/lib/time'
import type { Feedback as FB, FeedbackLane } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'

const CAP = 25

export function FeedbackRequests() {
  const { person } = usePersona('author')
  const { feedback, sopVersions, people, newDraftFrom, resolveFeedback } = useDB()
  const nav = useNavigate()
  const [all, setAll] = useState(false)
  const [tick, setTick] = useState(0)
  const lane = (l: FeedbackLane) => feedback.filter((f) => f.lane === l && (all || f.status === 'open')).slice(0, CAP)

  const Item = ({ f }: { f: FB }) => {
    const v = byId(sopVersions, f.sopVersionId)
    const stepN = v?.steps.findIndex((s) => s.id === f.stepId)
    return (
      <li className="rounded-xl bg-forest-950/40 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs"><Pill tone="gold">{v?.code} · {v?.version}</Pill>{stepN !== undefined && stepN >= 0 && <Pill>Step {stepN + 1}</Pill>}
          <span className="text-sage-300">{byId(people, f.fromId)?.name} · {fDateTime(f.at)}</span>{f.status === 'done' && <Pill tone="ok">Completed</Pill>}</div>
        {f.rating && <div className="mt-2 flex gap-0.5 text-gold-400">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < f.rating! ? 'currentColor' : 'none'} />)}</div>}
        <p className="mt-2 whitespace-pre-wrap text-sm text-white">{f.text}</p>
        {f.status === 'open' && <div className="mt-3 flex gap-2">
          <Button size="sm" variant="gold" onClick={() => nav(`/author/edit/${newDraftFrom(f.sopVersionId, person!.id, { feedbackId: f.id, text: f.text, stepId: f.stepId }).id}`)}>Start a draft from this feedback</Button>
          <Button size="sm" variant="ghost" onClick={() => resolveFeedback(f.id)}>Mark done</Button>
        </div>}
      </li>
    )
  }

  const sugg = lane('suggestion'), ratings = lane('rating'), reqs = lane('manager_request')
  return (
    <div className="space-y-6" key={tick}>
      <PageHeader eyebrow="Author" title="Feedback & requests" tagline="What people say about each SOP version." />
      <Section title="Employee suggestions" right={<div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-sage-200"><input type="checkbox" className="accent-[rgb(201,162,75)]" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include completed decisions</label>
        <Button size="sm" variant="ghost" onClick={() => setTick((t) => t + 1)}><RefreshCw size={14} /> Refresh</Button></div>}>
        <p className="-mt-2 mb-4 text-sm text-sage-300">Specific corrections to the exact SOP and step an employee received.</p>
        {sugg.length ? <ul className="space-y-2">{sugg.map((f) => <Item key={f.id} f={f} />)}</ul> : <Empty title="No suggestions in this view" />}
      </Section>
      <Section title={<>Ratings & feedback <span className="text-sage-300">({ratings.length})</span></>}>
        <p className="-mt-2 mb-4 text-sm text-sage-300">Responses, not unique people. Notes are shown as submitted.</p>
        {ratings.length ? <ul className="space-y-2">{ratings.map((f) => <Item key={f.id} f={f} />)}</ul> : <Empty title="No responses in this selection." />}
      </Section>
      <Section title={<>Manager requests <span className="text-sage-300">({reqs.length})</span></>}>
        {reqs.length ? <ul className="space-y-2">{reqs.map((f) => <Item key={f.id} f={f} />)}</ul>
          : <Empty title="No requests waiting in this view" body="Choose All statuses to include completed decisions." />}
      </Section>
      <p className="text-xs text-sage-300">Partial list · latest {CAP} responses and up to {CAP} requests</p>
    </div>
  )
}
