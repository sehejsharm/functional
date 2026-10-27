import { CheckCheck, FilePen, Inbox, MessageSquareQuote, RotateCcw, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HBars } from '@/components/Charts'
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, SearchBox, Select, Tabs } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { fDateTime } from '@/lib/time'
import { toast } from '@/lib/toast'
import type { Feedback, FeedbackLane } from '@/lib/types'
import { relTime } from '@/shell/PortalShell'
import { markFeedbackDone, reopenFeedback } from './actions'
import { Stars, VersionTag, useSopCommands } from './components'

const LANE: Record<FeedbackLane, { label: string; tone: 'info' | 'gold' | 'brand' }> = {
  suggestion: { label: 'Suggestion', tone: 'info' }, manager_request: { label: 'Manager request', tone: 'brand' }, rating: { label: 'Rating', tone: 'gold' },
}

/** One feedback item: who, which SOP and step, what they said, and what the author can do with it. */
export function FeedbackCard({ f }: { f: Feedback }) {
  const db = useDB()
  const cmd = useSopCommands()
  const v = byId(db.sopVersions, f.sopVersionId)
  const from = byId(db.people, f.fromId)
  const stepIdx = v?.steps.findIndex((s) => s.id === f.stepId) ?? -1
  const step = stepIdx >= 0 ? v!.steps[stepIdx] : undefined
  const sop = v && byId(db.sops, v.sopId)
  const stale = v && sop?.currentVersionId && sop.currentVersionId !== v.id
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={from?.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">{from?.name ?? 'Someone'}</span>
            <span className="text-xs text-muted">{from?.title}</span>
            <span className="text-xs text-muted" title={fDateTime(f.at)}>· {relTime(f.at)}</span>
            <Badge tone={LANE[f.lane].tone}>{LANE[f.lane].label}</Badge>
            {f.status === 'done' && <Badge tone="success" dot>Done</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {v && <Link to={`/author/sops/${v.sopId}`} className="font-mono text-[12px] font-semibold text-forest-700 hover:underline">{v.code}</Link>}
            {v && <VersionTag label={v.version} />}
            {stale && <span className="text-muted">(now {byId(db.sopVersions, sop!.currentVersionId)?.version})</span>}
            {step && <span className="truncate text-ink-2">Step {stepIdx + 1} · {step.instruction.length > 70 ? `${step.instruction.slice(0, 70)}…` : step.instruction}</span>}
          </div>
          {f.lane === 'rating' && f.rating != null && <div className="mt-2"><Stars value={f.rating} /></div>}
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{f.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {f.status === 'open' ? <>
              <Button size="sm" variant="primary" icon={FilePen} onClick={() => cmd.applyFeedback(f)}>Start revision with this</Button>
              <Button size="sm" icon={CheckCheck} onClick={() => { markFeedbackDone(f, cmd.me); toast.success('Marked done', { description: `${from?.name ?? 'The sender'}’s ${LANE[f.lane].label.toLowerCase()} moved to Done.`, action: { label: 'Undo', onClick: () => reopenFeedback(f.id) } }) }}>Mark done</Button>
            </> : <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { reopenFeedback(f.id); toast.info('Moved back to the inbox') }}>Reopen</Button>}
          </div>
        </div>
      </div>
    </li>
  )
}

type TabId = 'suggestion' | 'manager_request' | 'rating' | 'done'

export function FeedbackRequests() {
  const db = useDB()
  const [tab, setTab] = useState<TabId>('suggestion')
  const [sop, setSop] = useState('all')
  const [q, setQ] = useState('')
  const sopOf = (f: Feedback) => byId(db.sopVersions, f.sopVersionId)?.sopId ?? ''
  const open = db.feedback.filter((f) => f.status === 'open')
  const counts = {
    suggestion: open.filter((f) => f.lane === 'suggestion').length, manager_request: open.filter((f) => f.lane === 'manager_request').length,
    rating: open.filter((f) => f.lane === 'rating').length, done: db.feedback.filter((f) => f.status === 'done').length,
  }
  const list = db.feedback
    .filter((f) => (tab === 'done' ? f.status === 'done' : f.status === 'open' && f.lane === tab))
    .filter((f) => sop === 'all' || sopOf(f) === sop)
    .filter((f) => !q.trim() || `${f.text} ${byId(db.people, f.fromId)?.name} ${byId(db.sopVersions, f.sopVersionId)?.code}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.at.localeCompare(a.at))
  const sops = [...new Map(db.feedback.map((f) => { const v = byId(db.sopVersions, f.sopVersionId); return [v?.sopId ?? '', v?.code ?? ''] as const })).entries()].filter(([id]) => id)

  // Ratings summary: every rating counts (open or done), grouped by SOP.
  const ratingSummary = useMemo(() => {
    const m = new Map<string, { code: string; title: string; sum: number; n: number }>()
    db.feedback.filter((f) => f.lane === 'rating' && f.rating != null).forEach((f) => {
      const v = byId(db.sopVersions, f.sopVersionId); if (!v) return
      const e = m.get(v.sopId) ?? { code: v.code, title: v.title, sum: 0, n: 0 }
      e.sum += f.rating!; e.n++; m.set(v.sopId, e)
    })
    return [...m.values()].map((e) => ({ ...e, avg: Math.round((e.sum / e.n) * 10) / 10 })).sort((a, b) => b.avg - a.avg)
  }, [db.feedback, db.sopVersions])
  const overall = ratingSummary.length ? ratingSummary.reduce((a, e) => a + e.sum, 0) / ratingSummary.reduce((a, e) => a + e.n, 0) : 0

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Hotel standards" title="Feedback & requests"
        description="What staff and managers say about each SOP version. Turn a suggestion into a revision in one step — the note lands on the step it is about.">
        <Tabs value={tab} onChange={setTab} items={[
          { id: 'suggestion', label: 'Suggestions', count: counts.suggestion }, { id: 'manager_request', label: 'Manager requests', count: counts.manager_request },
          { id: 'rating', label: 'Ratings', count: counts.rating }, { id: 'done', label: 'Done', count: counts.done },
        ]} />
      </PageHeader>

      {tab === 'rating' && (
        <Card>
          <CardHeader icon={Star} title="Average rating by SOP" description="All ratings received, open and done. Responses, not unique people." />
          <div className="grid gap-6 p-5 md:grid-cols-[220px_1fr]">
            <div className="flex flex-col items-start justify-center gap-1.5 rounded-cell bg-gold-50 p-4 ring-1 ring-inset ring-gold-500/25">
              <span className="text-xs font-medium text-gold-700">Overall</span>
              <span className="text-4xl font-semibold tabular text-ink">{overall ? overall.toFixed(1) : '—'}<span className="text-base font-medium text-muted"> / 5</span></span>
              {overall > 0 && <Stars value={overall} size={16} />}
              <span className="text-xs text-muted">{ratingSummary.reduce((a, e) => a + e.n, 0)} ratings across {ratingSummary.length} SOPs</span>
            </div>
            {ratingSummary.length ? <HBars max={5} tone="gold" data={ratingSummary.map((e) => ({ label: `${e.code} · ${e.title}`, value: e.avg, hint: `${e.n} rating${e.n === 1 ? '' : 's'}` }))} />
              : <p className="text-sm text-muted">No ratings yet.</p>}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search feedback" className="w-full sm:w-72" />
        <Select aria-label="Filter by SOP" className="h-9 w-full py-1.5 sm:w-56" value={sop} onChange={(e) => setSop(e.target.value)}>
          <option value="all">All SOPs</option>{sops.map(([id, code]) => <option key={id} value={id}>{code}</option>)}
        </Select>
        <span className="ml-auto text-xs text-muted">{list.length} item{list.length === 1 ? '' : 's'}</span>
      </div>

      {list.length ? <ul className="space-y-3">{list.map((f) => <FeedbackCard key={f.id} f={f} />)}</ul> : (
        <Card><EmptyState icon={tab === 'done' ? Inbox : MessageSquareQuote}
          title={q || sop !== 'all' ? 'Nothing matches this filter' : tab === 'done' ? 'Nothing marked done yet' : 'Inbox zero'}
          description={tab === 'done' ? 'Items you act on or mark done are kept here.' : 'New feedback from staff and managers lands here as it arrives.'} /></Card>
      )}
    </div>
  )
}
