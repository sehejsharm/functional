import { motion, useAnimationControls } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'

/** Visual groups of cells, e.g. 17 → [6, 6, 5]. */
function groups(n: number): number[] {
  const out: number[] = []
  for (let left = n; left > 0; left -= 6) out.push(Math.min(6, left))
  return out
}

/**
 * One real <input type=password> drives the value (paste, password managers, autofill all work);
 * the cells are a rendering treatment over it, and screen readers hear a single password field.
 */
export function PassphraseGrid({ length, value, onChange, onSubmit, error }: {
  length: number; value: string; onChange: (v: string) => void; onSubmit: () => void; error: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)
  const shake = useAnimationControls()

  useEffect(() => { if (error) void shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } }) }, [error, shake])

  let i = 0
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="passkey" className="label !mb-0 !text-sage-200">Hotel passkey</label>
        <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-1 text-xs text-sage-300 hover:text-white"
          aria-pressed={show} aria-controls="passkey">
          {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <motion.div animate={shake} className="relative" onClick={() => ref.current?.focus()}>
        <input
          id="passkey" ref={ref} type={show ? 'text' : 'password'} value={value} autoFocus
          autoComplete="current-password" maxLength={length} spellCheck={false} aria-invalid={error}
          aria-describedby={error ? 'passkey-error' : undefined}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, '').slice(0, length))}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
        <div aria-hidden className="flex flex-col gap-2">
          {groups(length).map((g, gi) => (
            <div key={gi} className="flex gap-1.5">
              {Array.from({ length: g }, () => {
                const idx = i++
                const ch = value[idx]
                const active = focused && idx === Math.min(value.length, length - 1)
                return (
                  <motion.div key={idx}
                    animate={ch ? { scale: [0.85, 1], opacity: 1 } : { scale: 1 }}
                    transition={{ duration: 0.15 }}
                    className={clsx('grid h-11 w-9 place-items-center rounded-cell border text-lg font-semibold sm:h-12 sm:w-10',
                      error ? 'border-danger/70 bg-danger/10 text-danger' : ch ? 'border-gold-500/50 bg-sage-100 text-ink' : 'border-white/10 bg-sage-100/90 text-ink',
                      active && !error && 'shadow-ring border-gold-500')}>
                    {ch ? (show ? ch : '•') : active ? <span className="h-5 w-px animate-pulse bg-ink" /> : null}
                  </motion.div>
                )
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
