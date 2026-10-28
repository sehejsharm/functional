import { HelpCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Count, Empty, PageHeader, Pill, SearchBox, Section } from '@/components/ui'
import { REVIEW_REQUIRED, useDB } from '@/lib/db'
import { fDateTime } from '@/lib/time'
import { usePersona } from '@/shell/PortalShell'

export function MySops() {
  const { person } = usePersona('author')
  const { sopVersions, tasks, ackEvents, feedback, newDraftFrom, deleteDraft, release } = useDB()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const drafts = sopVersions.filter((v) => v.authorId === person?.id && (v.status === 'draft' || v.status === 'changes_requested'))
  // Versions sent for review before reviews were switched off can be published straight from here.
  const waiting = REVIEW_REQUIRED ? [] : sopVersions.filter((v) => v.status === 'in_review' || v.status === 'changes_requested')
  const published = sopVersions.filter((v) => v.status === 'published' && `${v.title} ${v.code} ${v.version}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Author" title="My SOPs" tagline="Write it once. Every shift follows it."
        right={<Link to="/author/new"><Button variant="gold" size="lg"><Plus size={18} /> Create a new SOP</Button></Link>} />
      <Section title={<>Your drafts <Count n={drafts.length} /></>}>
        <p className="-mt-2 mb-4 text-sm text-sage-300">Saved work, not instructions released to employees.</p>
        {drafts.length ? <ul className="space-y-2">{drafts.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-xl bg-forest-950/40 px-4 py-3">
            <Link to={`/author/edit/${d.id}`} className="hover:text-gold-400"><b className="text-white">{d.code || 'No code'}</b> · {d.title || 'Untitled'} {d.status === 'changes_requested' && <Pill tone="warn">Changes requested</Pill>}</Link>
            <div className="flex gap-2 text-xs text-sage-300">{fDateTime(d.updatedAt)}{d.status === 'draft' && <button className="text-danger hover:underline" onClick={() => deleteDraft(d.id)}>Delete</button>}</div>
          </li>))}</ul> : <Empty title="No draft in progress." />}
      </Section>
      {waiting.length > 0 && (
        <Section title={<>Ready to publish <Count n={waiting.length} /></>}>
          <ul className="space-y-2">{waiting.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded-xl bg-forest-950/40 px-4 py-3">
              <span><b className="text-white">{v.code}</b> · {v.title}</span>
              <Button size="sm" variant="gold" onClick={() => release(v.id, person!.id)}>Publish</Button>
            </li>))}</ul>
        </Section>
      )}
      <Section title={<>Your published SOPs <Count n={published.length} /></>} right={<div className="w-72"><SearchBox value={q} onChange={setQ} placeholder="Find a title, code or version" /></div>}>
        <div className="grid gap-4 md:grid-cols-2">
          {published.map((v) => {
            const used = tasks.filter((t) => t.sopVersionId === v.id)
            const verified = used.filter((t) => t.status === 'done' && v.steps.some((s) => s.requireCheck)).length
            const reads = ackEvents.filter((a) => a.kind === 'sop' && a.refId === v.id && a.openedAt).length
            const waiting = feedback.filter((f) => f.sopVersionId === v.id && f.status === 'open').length
            return (
              <article key={v.id} className="card-light p-5">
                <div className="flex items-start justify-between gap-2"><div className="text-xs font-bold text-forest-700">{v.code} · {v.version}</div><Pill tone="ok">Current version</Pill></div>
                <h3 className="mt-1 font-display text-xl font-bold">{v.title}</h3>
                <p className="text-xs text-muted">Published · Effective {fDateTime(v.effectiveAt!)}</p>
                <p className="mt-3 text-sm">{waiting ? `${waiting} feedback item${waiting > 1 ? 's' : ''} waiting on this version` : 'Nothing waiting on this version'}</p>
                <p className="text-sm text-muted">Used in {used.length} tasks · {verified ? `${verified} verified` : 'none verified yet'}</p>
                <p className="flex items-center gap-1 text-sm text-muted">Reads (opened): {reads}
                  <span title="People who opened this exact version at least once. Opening is not the same as confirming they read it."><HelpCircle size={13} /></span></p>
                <Button size="sm" variant="primary" className="mt-4 !bg-forest-900" onClick={() => nav(`/author/edit/${newDraftFrom(v.id, person!.id).id}`)}>Start a revision</Button>
              </article>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
