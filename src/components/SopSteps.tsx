import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Camera, Check, Lock, ShieldCheck } from 'lucide-react'
import type { SopStep } from '@/lib/types'
import { CheckMark, StepIcon } from './ui'

/**
 * The SOP exactly as an employee sees it. Shared by the task screen and the author's "Preview".
 * Guided mode shows every step; Standard mode shows only milestones (checked steps + the last step).
 */
export function SopSteps({ steps, version, done = [], photos = [], interactive, mode = 'guided', onToggle, onPhoto, title, compact, readOnly }: {
  steps: SopStep[]; version: string; done?: string[]; photos?: string[]; interactive: boolean; mode?: 'guided' | 'standard'
  onToggle?: (id: string) => void; onPhoto?: (id: string) => void; title?: string; compact?: boolean
  /** Reading view (guides, previews, reviews): numbered steps, no ticks, no progress. */
  readOnly?: boolean
}) {
  const visible = mode === 'standard' ? steps.filter((s, i) => s.requireCheck || i === steps.length - 1) : steps
  const doneCount = visible.filter((s) => done.includes(s.id)).length
  const nextId = visible.find((s) => !done.includes(s.id))?.id
  return (
    <section className="card overflow-hidden" aria-label="Steps">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title ?? (mode === 'standard' ? 'Milestones' : 'Steps')}</h3>
          <p className="text-xs text-muted">{readOnly ? `${visible.length} step${visible.length === 1 ? '' : 's'}` : `${doneCount} of ${visible.length} done`}{mode === 'standard' ? ' · Standard mode' : ''}</p>
        </div>
        <span className="rounded-pill bg-forest-900 px-2.5 py-0.5 text-2xs font-semibold text-white">v{version}</span>
      </div>
      {!readOnly && <div className="h-1 bg-ink/[0.05]"><motion.div className="h-full bg-forest-700" animate={{ width: `${visible.length ? (doneCount / visible.length) * 100 : 0}%` }} transition={{ duration: 0.4 }} /></div>}
      {!interactive && !readOnly && (
        <p className="flex items-center gap-2 border-b border-line bg-surface-2 px-5 py-2.5 text-sm text-ink-2"><Lock size={14} className="text-muted" /> Start the room to tick steps.</p>
      )}
      <ol className={clsx('divide-y divide-line', compact && 'text-sm')}>
        {visible.map((s) => {
          const n = steps.indexOf(s) + 1
          const checked = done.includes(s.id)
          const isNext = interactive && !readOnly && s.id === nextId
          return (
            <li key={s.id} className={clsx('relative flex gap-4 px-5 py-4 transition-colors', checked ? 'bg-forest-50/60' : isNext ? 'bg-gold-50/60' : '')}>
              {isNext && <span className="absolute inset-y-0 left-0 w-[3px] bg-gold-500" aria-hidden />}
              {readOnly
                ? <span aria-hidden className={clsx('mt-0.5 grid shrink-0 place-items-center rounded-full bg-forest-50 font-semibold tabular text-forest-800 ring-1 ring-forest-700/15', compact ? 'h-6 w-6 text-xs' : 'h-7 w-7 text-sm')}>{n}</span>
                : <button type="button" disabled={!interactive} onClick={() => onToggle?.(s.id)} aria-pressed={checked} aria-label={`Step ${n}${checked ? ', done' : ''}: ${s.instruction}`}
                    className="mt-0.5 shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-60"><CheckMark checked={checked} size={compact ? 24 : 28} /></button>}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="mt-[3px] text-muted"><StepIcon name={s.icon} /></span>
                  <p className={clsx('leading-snug', compact ? 'text-sm' : 'text-[15px]', checked ? 'text-muted line-through decoration-forest-700/40' : 'text-ink')}>
                    {!readOnly && <span className="mr-1 font-semibold tabular">{n}.</span>}{s.instruction || <em className="text-muted">No instruction yet</em>}
                  </p>
                </div>
                {s.guestCare && <p className="mt-2 rounded-cell border border-gold-500/25 bg-gold-50 px-3 py-2 text-sm text-ink-2"><span className="font-semibold text-gold-700">Guest care · </span>{s.guestCare}</p>}
                {(s.requireCheck || s.allowPhoto) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {s.requireCheck && <span className="inline-flex items-center gap-1 rounded-pill bg-info/10 px-2 py-0.5 text-2xs font-semibold text-info"><ShieldCheck size={12} /> Independent check</span>}
                    {s.allowPhoto && readOnly && <span className="inline-flex items-center gap-1 rounded-pill bg-ink/[0.06] px-2 py-0.5 text-2xs font-semibold text-ink-2"><Camera size={11} /> Photo allowed</span>}
                    {s.allowPhoto && !readOnly && (
                      <button type="button" disabled={!interactive} onClick={() => onPhoto?.(s.id)}
                        className={clsx('inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-2xs font-semibold transition disabled:opacity-50', photos.includes(s.id) ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line-strong text-ink-2 hover:bg-surface-2')}>
                        {photos.includes(s.id) ? <><Check size={11} /> Photo attached</> : <><Camera size={11} /> Add photo</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
