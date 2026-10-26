import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Camera, ShieldCheck } from 'lucide-react'
import type { SopStep } from '@/lib/types'
import { CheckMark, StepIcon } from './ui'

/** The SOP exactly as an Employee sees it. Shared by the task view and the Author's "Preview draft". */
export function SopSteps({ steps, version, done = [], photos = [], interactive, mode = 'guided', onToggle, onPhoto }: {
  steps: SopStep[]; version: string; done?: string[]; photos?: string[]; interactive: boolean; mode?: 'guided' | 'standard'
  onToggle?: (id: string) => void; onPhoto?: (id: string) => void
}) {
  // Standard mode trusts experienced staff: only milestone (checked) steps and the last step are ticked.
  const visible = mode === 'standard' ? steps.filter((s, i) => s.requireCheck || i === steps.length - 1) : steps
  return (
    <div className="card-light p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">{mode === 'standard' ? 'Milestones' : 'Room steps'}</h3>
        <span className="rounded-pill bg-forest-900 px-2.5 py-0.5 text-xs font-bold text-gold-400">{version}</span>
      </div>
      {!interactive && <p className="mb-3 rounded-lg bg-sage-200/70 px-3 py-2 text-sm text-muted">Start the room to tick steps.</p>}
      <ol className="space-y-2">
        {visible.map((s) => {
          const n = steps.indexOf(s) + 1
          const checked = done.includes(s.id)
          return (
            <motion.li layout key={s.id} className={clsx('rounded-xl border p-3 transition', checked ? 'border-gold-500/50 bg-gold-500/10' : 'border-sage-200 bg-white')}>
              <div className="flex gap-3">
                <button disabled={!interactive} onClick={() => onToggle?.(s.id)} aria-pressed={checked} aria-label={`Step ${n}${checked ? ' done' : ''}`}
                  className="mt-0.5 disabled:cursor-not-allowed disabled:opacity-50"><CheckMark checked={checked} /></button>
                <div className="flex-1">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-muted"><StepIcon name={s.icon} /></span>
                    <p className={clsx('text-[15px] leading-snug', checked && 'text-muted line-through decoration-gold-500/60')}>{n}. {s.instruction || <em className="text-muted">No instruction yet</em>}</p>
                  </div>
                  {s.guestCare && <p className="mt-1.5 rounded-lg bg-cream px-2.5 py-1.5 text-sm text-ink/80">Guest care: {s.guestCare}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.requireCheck && <span className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700"><ShieldCheck size={13} /> Recorded check · independent verification</span>}
                    {s.allowPhoto && (
                      <button disabled={!interactive} onClick={() => onPhoto?.(s.id)}
                        className="inline-flex items-center gap-1 rounded-pill border border-sage-300 px-2 py-0.5 text-xs text-ink disabled:opacity-50">
                        <Camera size={12} /> {photos.includes(s.id) ? 'Photo attached' : 'Add optional photo'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
