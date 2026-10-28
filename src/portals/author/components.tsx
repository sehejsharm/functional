// Presentational building blocks shared by the author screens.
import clsx from 'clsx'
import { ArrowRight, Camera, Minus, MoveVertical, Plus, RotateCcw, ShieldCheck, Signal, Star, Wifi } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { SopSteps } from '@/components/SopSteps'
import { Avatar, Badge, Segmented, StepIcon, type Tone } from '@/components/ui'
import { APPROVALS_REQUIRED, byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fTime } from '@/lib/time'
import { confirm, toast } from '@/lib/toast'
import type { Feedback, SopStep, SopVersion, VersionStatus } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { approversOf, currentOf, duplicateSop, pinnedTasks, startRevision, startRevisionWithFeedback, type RowStatus } from './actions'
import { diffFields, diffSteps, summarize, wordDiff, type StepDiff } from './diff'

// ── Status ───────────────────────────────────────────────────────────────────

export const VERSION_STATUS: Record<VersionStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' }, in_review: { label: 'In review', tone: 'info' }, changes_requested: { label: 'Changes requested', tone: 'warning' },
  published: { label: 'Published', tone: 'success' }, superseded: { label: 'Superseded', tone: 'neutral' }, rejected: { label: 'Rejected', tone: 'danger' },
}
export const ROW_STATUS: Record<RowStatus, { label: string; tone: Tone }> = {
  ...VERSION_STATUS, retired: { label: 'Retired', tone: 'neutral' },
} as Record<RowStatus, { label: string; tone: Tone }>

export const VersionStatusBadge = ({ status, size }: { status: VersionStatus; size?: 'sm' | 'md' }) => (
  <Badge tone={VERSION_STATUS[status].tone} dot size={size}>{VERSION_STATUS[status].label}</Badge>
)
export const RowStatusBadge = ({ status }: { status: RowStatus }) => <Badge tone={ROW_STATUS[status].tone} dot>{ROW_STATUS[status].label}</Badge>

export const VersionTag = ({ label, draft }: { label: string; draft?: boolean }) => (
  <span className={clsx('inline-flex items-center rounded-md px-1.5 py-px font-mono text-[11px] font-semibold tabular ring-1 ring-inset', draft ? 'bg-surface-2 text-ink-2 ring-line-strong' : 'bg-forest-50 text-forest-800 ring-forest-700/20')}>
    v{label}{draft && <span className="ml-1 font-sans font-medium text-muted">draft</span>}
  </span>
)

export function PersonChip({ id, sub, size = 24 }: { id: string | undefined; sub?: ReactNode; size?: number }) {
  const p = useDB((s) => byId(s.people, id))
  if (!p) return <span className="text-muted">—</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={p.name} size={size} />
      <span className="min-w-0 leading-tight"><span className="block truncate text-sm text-ink">{p.name}</span>{sub && <span className="block truncate text-xs text-muted">{sub}</span>}</span>
    </span>
  )
}

/** "1 / 2" with the approvers' faces and empty slots for the approvals still needed. */
export function ApprovalMeter({ v, showLabel = true }: { v: SopVersion; showLabel?: boolean }) {
  const people = useDB((s) => s.people)
  const ids = approversOf(v)
  const slots = Math.max(APPROVALS_REQUIRED, ids.length)
  return (
    <span className="inline-flex items-center gap-2" aria-label={`${ids.length} of ${APPROVALS_REQUIRED} approvals`}>
      <span className="flex gap-1">
        {Array.from({ length: slots }, (_, i) => {
          const p = byId(people, ids[i])
          return p ? <Avatar key={i} name={p.name} size={24} />
            : <span key={i} className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-line-strong bg-surface" aria-hidden />
        })}
      </span>
      {showLabel && <span className={clsx('text-xs font-semibold tabular', ids.length >= APPROVALS_REQUIRED ? 'text-ok' : 'text-ink-2')}>{ids.length}/{APPROVALS_REQUIRED}</span>}
    </span>
  )
}

export function Stars({ value, size = 14, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-gold-500" role="img" aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => <Star key={i} size={size} fill={i < Math.round(value) ? 'currentColor' : 'none'} strokeWidth={1.75} className={i < Math.round(value) ? '' : 'text-line-strong'} />)}
    </span>
  )
}

// ── Steps, as a document ─────────────────────────────────────────────────────

const FEEDBACK = /^\[Feedback\]\s*/
export const splitCare = (care: string) => {
  const lines = care.split('\n')
  return { care: lines.filter((l) => !FEEDBACK.test(l)).join('\n').trim(), notes: lines.filter((l) => FEEDBACK.test(l)).map((l) => l.replace(FEEDBACK, '').trim()) }
}

export const StepFlags = ({ s, size = 'sm' }: { s: Pick<SopStep, 'requireCheck' | 'allowPhoto'>; size?: 'sm' | 'xs' }) => (!s.requireCheck && !s.allowPhoto ? null : (
  <span className="inline-flex flex-wrap items-center gap-1.5">
    {s.requireCheck && <span className={clsx('inline-flex items-center gap-1 rounded-pill bg-info/10 font-semibold text-info', size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-2xs')}><ShieldCheck size={11} /> Independent check</span>}
    {s.allowPhoto && <span className={clsx('inline-flex items-center gap-1 rounded-pill bg-ink/[0.06] font-semibold text-ink-2', size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-2xs')}><Camera size={11} /> Photo allowed</span>}
  </span>
))

/** Read-only, document-style step list (numbered, with guest-care and flags). */
export function StepDocument({ steps }: { steps: SopStep[] }) {
  if (!steps.length) return <p className="py-6 text-center text-sm text-muted">No steps yet.</p>
  return (
    <ol className="divide-y divide-line">
      {steps.map((s, i) => {
        const { care } = splitCare(s.guestCare)
        return (
          <li key={s.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest-900 text-xs font-semibold tabular text-white">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2"><span className="mt-0.5 text-muted"><StepIcon name={s.icon} /></span><p className="text-[15px] leading-snug text-ink">{s.instruction || <em className="text-muted">No instruction</em>}</p></div>
              {care && <p className="mt-2 whitespace-pre-line rounded-cell border border-gold-500/25 bg-gold-50 px-3 py-2 text-sm text-ink-2"><span className="font-semibold text-gold-700">Guest care · </span>{care}</p>}
              <div className="mt-2"><StepFlags s={s} /></div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Phone preview ────────────────────────────────────────────────────────────

export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  const now = useNow(30_000)
  return (
    <div className={clsx('mx-auto w-full max-w-[340px]', className)}>
      <div className="rounded-[2.6rem] bg-forest-950 p-[9px] shadow-lift ring-1 ring-black/20">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-canvas">
          <div className="relative flex items-center justify-between bg-surface px-6 pb-1.5 pt-3 text-[11px] font-semibold tabular text-ink">
            <span>{fTime(now).replace(/\s?(AM|PM)$/, '')}</span>
            <span className="absolute left-1/2 top-2 h-[22px] w-24 -translate-x-1/2 rounded-full bg-forest-950" aria-hidden />
            <span className="flex items-center gap-1 text-ink-2" aria-hidden><Signal size={12} /><Wifi size={12} /><span className="ml-0.5 inline-block h-2.5 w-5 rounded-[3px] border border-ink-2/60 p-px"><span className="block h-full w-3/4 rounded-[1px] bg-ink-2" /></span></span>
          </div>
          <div className="h-[600px] overflow-y-auto overscroll-contain">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** The SOP inside a phone exactly as staff will see it, with ticking enabled so the author can try it. */
export function StaffPreview({ steps, version, title, minutes, roleName }: { steps: SopStep[]; version: string; title: string; minutes: number | string; roleName?: string }) {
  const [mode, setMode] = useState<'guided' | 'standard'>('guided')
  const [done, setDone] = useState<string[]>([])
  const [photos, setPhotos] = useState<string[]>([])
  const clean = useMemo(() => steps.map((s) => ({ ...s, guestCare: splitCare(s.guestCare).care })), [steps])
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Segmented size="sm" value={mode} onChange={setMode} items={[{ id: 'guided', label: 'Guided' }, { id: 'standard', label: 'Standard' }]} />
        <button type="button" onClick={() => { setDone([]); setPhotos([]) }} disabled={!done.length && !photos.length}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-40"><RotateCcw size={12} /> Reset</button>
      </div>
      <PhoneFrame>
        <div className="border-b border-line bg-surface px-4 pb-3 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700">Room 114 · Deluxe King</div>
          <div className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{title || 'Untitled SOP'}</div>
          <div className="mt-0.5 text-xs text-muted">{minutes || '—'} min target{roleName ? ` · ${roleName}` : ''}</div>
        </div>
        <div className="p-2.5">
          <SopSteps compact steps={clean} version={version} interactive mode={mode} done={done} photos={photos}
            onToggle={(id) => setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))}
            onPhoto={(id) => setPhotos((p) => (p.includes(id) ? p : [...p, id]))} />
        </div>
      </PhoneFrame>
      <p className="text-center text-xs text-muted">{mode === 'standard' ? 'Standard mode shows only steps with an independent check, plus the last step.' : 'Tick steps to try it as staff would. Nothing is recorded.'}</p>
    </div>
  )
}

// ── Version comparison ───────────────────────────────────────────────────────

function Words({ a, b, side }: { a: string; b: string; side: 'before' | 'after' }) {
  const parts = wordDiff(a, b)
  return (
    <>{parts.map((p, i) => p.kind === 'same' ? <span key={i}>{p.text}</span>
      : p.kind === 'del' ? (side === 'before' ? <del key={i} className="rounded-sm bg-danger/10 text-danger decoration-danger/70">{p.text}</del> : null)
        : side === 'after' ? <ins key={i} className="rounded-sm bg-ok/15 text-ok decoration-ok/60 underline-offset-2">{p.text}</ins> : null)}</>
  )
}

const KIND: Record<StepDiff['kind'], { label: string; tone: Tone; border: string }> = {
  added: { label: 'Added', tone: 'success', border: 'border-l-ok' },
  removed: { label: 'Removed', tone: 'danger', border: 'border-l-danger' },
  reworded: { label: 'Reworded', tone: 'warning', border: 'border-l-amber' },
  flags: { label: 'Checks changed', tone: 'info', border: 'border-l-info' },
  moved: { label: 'Moved', tone: 'neutral', border: 'border-l-line-strong' },
  same: { label: 'Unchanged', tone: 'neutral', border: 'border-l-line' },
}

export function DiffRow({ d, extra, plain }: { d: StepDiff; extra?: ReactNode; plain?: boolean }) {
  const k = KIND[d.kind]
  const care = splitCare(d.step.guestCare).care, prevCare = d.prev ? splitCare(d.prev.guestCare).care : ''
  return (
    <li className={clsx('rounded-cell border border-l-[3px] border-line bg-surface p-3.5', plain ? 'border-l-forest-700' : k.border, d.kind === 'same' && 'bg-surface-2/60')}>
      <div className="flex items-start gap-3">
        <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular', d.kind === 'removed' ? 'bg-danger/10 text-danger' : d.kind === 'same' ? 'bg-ink/[0.06] text-muted' : 'bg-forest-900 text-white')}>
          {d.kind === 'removed' ? <Minus size={13} /> : d.n}
        </span>
        <div className="min-w-0 flex-1">
          <div className={clsx('flex flex-wrap items-center gap-1.5', !plain && 'mb-1.5')}>
            {!plain && <Badge tone={k.tone}>{k.label}</Badge>}
            {d.kind === 'removed' && <span className="text-xs text-muted">was step {d.was}</span>}
            {d.changes.filter((c) => d.kind !== 'added' && d.kind !== 'removed' && c !== 'Instruction reworded').map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-pill bg-ink/[0.05] px-2 py-0.5 text-2xs font-medium text-ink-2">{/^Moved/.test(c) && <MoveVertical size={10} />}{c}</span>
            ))}
          </div>
          {d.kind === 'reworded' && d.prev ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-md bg-danger/[0.04] p-2.5 ring-1 ring-inset ring-danger/15">
                <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Before · step {d.was}</div>
                <p className="text-sm leading-relaxed text-ink"><Words a={d.prev.instruction} b={d.step.instruction} side="before" /></p>
                {(prevCare || care) && prevCare !== care && <p className="mt-1.5 text-xs leading-relaxed text-ink-2"><span className="font-semibold text-gold-700">Guest care · </span>{prevCare ? <Words a={prevCare} b={care} side="before" /> : <em className="text-muted">none</em>}</p>}
              </div>
              <div className="rounded-md bg-ok/[0.05] p-2.5 ring-1 ring-inset ring-ok/20">
                <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">After · step {d.n}</div>
                <p className="text-sm leading-relaxed text-ink"><Words a={d.prev.instruction} b={d.step.instruction} side="after" /></p>
                {(prevCare || care) && prevCare !== care && <p className="mt-1.5 text-xs leading-relaxed text-ink-2"><span className="font-semibold text-gold-700">Guest care · </span>{care ? <Words a={prevCare} b={care} side="after" /> : <em className="text-muted">removed</em>}</p>}
              </div>
            </div>
          ) : (
            <>
              <p className={clsx('text-sm leading-relaxed', d.kind === 'removed' ? 'text-muted line-through decoration-danger/50' : d.kind === 'same' ? 'text-ink-2' : 'text-ink')}>{d.step.instruction || <em className="text-muted">No instruction</em>}</p>
              {care && d.kind !== 'removed' && <p className="mt-1.5 text-xs leading-relaxed text-ink-2"><span className="font-semibold text-gold-700">Guest care · </span>{care}</p>}
            </>
          )}
          {d.kind !== 'removed' && (d.step.requireCheck || d.step.allowPhoto) && <div className="mt-2"><StepFlags s={d.step} size="xs" /></div>}
        </div>
      </div>
      {extra}
    </li>
  )
}

export function DiffView({ base, next, baseLabel, nextLabel, extra, defaultScope }: {
  base?: SopVersion; next: SopVersion; baseLabel?: string; nextLabel?: string; extra?: (d: StepDiff) => ReactNode; defaultScope?: 'changes' | 'all'
}) {
  const jobRoles = useDB((s) => s.jobRoles)
  const roleName = (id: string) => jobRoles.find((r) => r.id === id)?.name ?? id
  const rows = useMemo(() => diffSteps(base?.steps ?? [], next.steps), [base, next])
  const sum = summarize(rows)
  const fields = diffFields(base, next, roleName)
  const [scope, setScope] = useState<'changes' | 'all'>(defaultScope ?? (base && sum.total ? 'changes' : 'all'))
  const shown = scope === 'all' ? rows : rows.filter((r) => r.kind !== 'same')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {base ? (
            <>
              <span className="mr-1 inline-flex items-center gap-1.5 font-medium text-ink-2">{baseLabel ?? `v${base.version}`} <ArrowRight size={12} /> {nextLabel ?? `v${next.version}`}</span>
              {sum.added > 0 && <Badge tone="success"><Plus size={10} /> {sum.added} added</Badge>}
              {sum.removed > 0 && <Badge tone="danger"><Minus size={10} /> {sum.removed} removed</Badge>}
              {sum.reworded > 0 && <Badge tone="warning">{sum.reworded} reworded</Badge>}
              {sum.flags > 0 && <Badge tone="info">{sum.flags} checks changed</Badge>}
              {sum.moved > 0 && <Badge>{sum.moved} moved</Badge>}
              {!sum.total && !fields.length && <Badge>No differences</Badge>}
            </>
          ) : <span className="font-medium text-ink-2">First version — all {next.steps.length} steps are new</span>}
        </div>
        {base && <Segmented size="sm" value={scope} onChange={setScope} items={[{ id: 'changes', label: 'Changes only', count: sum.total }, { id: 'all', label: 'All steps', count: next.steps.length }]} />}
      </div>
      {fields.length > 0 && (
        <div className="overflow-hidden rounded-cell border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2"><tr><th className="th">Field</th><th className="th">Before</th><th className="th">After</th></tr></thead>
            <tbody>{fields.map((f) => (
              <tr key={f.field} className="border-t border-line"><td className="td font-medium text-ink-2">{f.field}</td><td className="td text-muted line-through decoration-danger/40">{f.before}</td><td className="td font-medium text-ink">{f.after}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {shown.length ? <ol className="space-y-2.5">{shown.map((d) => <DiffRow key={d.step.id + d.kind} d={d} extra={extra?.(d)} plain={!base} />)}</ol>
        : <p className="rounded-cell border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">The steps are identical. {fields.length ? 'Only the details above changed.' : ''}</p>}
    </div>
  )
}

// ── Commands shared by library, detail and feedback screens ─────────────────

export function useSopCommands() {
  const nav = useNavigate()
  const { person } = usePersona('author')
  const me = person?.id ?? 'amina'
  const blockedByReview = async (v: SopVersion) => {
    if (await confirm({ title: `${v.code} ${v.version} is already in review`, body: 'Only one revision of an SOP can be open at a time. Follow the review to its decision before starting another.', confirmLabel: 'Open review', cancelLabel: 'Close' }))
      nav(`/author/reviews/${v.id}`)
  }
  return {
    me,
    revise: async (sopId: string) => {
      const r = startRevision(sopId, me)
      if (!r) return
      if ('blocked' in r) return blockedByReview(r.blocked)
      if (r.reused) toast.info('You already have a draft of this SOP', { description: `Opened ${r.version.code} ${r.version.version} instead of starting another revision.` })
      else toast.success(`Revision ${r.version.version} started`, { description: `${r.version.code} · a copy of the current version. Staff keep using it until this is released.` })
      nav(`/author/edit/${r.version.id}`)
    },
    duplicate: (sopId: string) => {
      const d = duplicateSop(sopId, me)
      if (!d) return toast.error('Nothing to duplicate', { description: 'This SOP has no versions yet.' })
      toast.success(`Created ${d.code}`, { description: 'A new SOP with its own history, starting at 1.0. Give it a title and code of its own.' })
      nav(`/author/edit/${d.id}`)
    },
    retire: async (sopId: string) => {
      const s = useDB.getState()
      const sop = byId(s.sops, sopId); const cur = currentOf(s, sopId)
      if (!sop) return
      const pinned = pinnedTasks(s, cur?.id).length
      const ok = await confirm({
        title: `Retire ${sop.code}?`, tone: 'danger', confirmLabel: 'Retire SOP',
        body: `Managers will no longer be able to assign it.${pinned ? ` ${pinned} room${pinned === 1 ? '' : 's'} already assigned keep their pinned version and can be finished.` : ''} Its versions and history stay readable, and you can restore it at any time.`,
      })
      if (!ok) return
      s.retireSop(sopId, me)
      toast.success(`${sop.code} retired`, { description: 'It no longer appears in assignment lists.', action: { label: 'Undo', onClick: () => { useDB.getState().restoreSop(sopId, me); toast.info(`${sop.code} restored`) } } })
    },
    restore: async (sopId: string) => {
      const s = useDB.getState()
      const sop = byId(s.sops, sopId); const cur = currentOf(s, sopId)
      if (!sop) return
      const ok = await confirm({ title: `Restore ${sop.code}?`, confirmLabel: 'Restore SOP', body: cur ? `Version ${cur.version} becomes assignable again straight away.` : 'It returns to the library. It has no published version, so it can’t be assigned yet.' })
      if (!ok) return
      s.restoreSop(sopId, me)
      toast.success(`${sop.code} restored`, { description: cur ? `Managers can assign v${cur.version} again.` : undefined })
    },
    applyFeedback: async (f: Feedback) => {
      const r = startRevisionWithFeedback(f, me)
      if (!r) return toast.error('That SOP version no longer exists')
      if ('blocked' in r) return blockedByReview(r.blocked)
      toast.success(r.reused ? 'Added to your open draft' : `Revision ${r.version.version} started from feedback`, { description: f.stepId ? 'The note sits on the step it is about — apply it, then remove the note.' : 'The request is pinned at the top of the steps.' })
      nav(`/author/edit/${r.version.id}`)
    },
  }
}
