import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Check, Search, X } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { forwardRef } from 'react'

/** Label + control + hint/error. Wrap any input, select or custom control. */
export function Field({ label, hint, error, required, children, className, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="label">{label}{required && <span className="text-danger"> *</span>}</label>}
      {children}
      {error ? <span role="alert" className="mt-1 block text-xs font-medium text-danger">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={clsx('input', invalid && '!border-danger', className)} aria-invalid={invalid || undefined} {...rest} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={clsx('input', invalid && '!border-danger', className)} aria-invalid={invalid || undefined} {...rest} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...rest }, ref) {
  return <select ref={ref} className={clsx('input cursor-pointer', invalid && '!border-danger', className)} aria-invalid={invalid || undefined} {...rest}>{children}</select>
})

export function SearchBox({ value, onChange, placeholder = 'Search', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <label className={clsx('relative block', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input type="search" autoFocus={autoFocus} className="input h-9 pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"><X size={14} /></button>}
    </label>
  )
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-5 w-9 shrink-0 rounded-pill transition-colors', checked ? 'bg-forest-700' : 'bg-ink/20')}>
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')} />
      </button>
      {(label || description) && <span className="min-w-0"><span className="block text-sm font-medium text-ink">{label}</span>{description && <span className="block text-xs text-muted">{description}</span>}</span>}
    </label>
  )
}

export function Checkbox({ checked, onChange, label, description, indeterminate, disabled, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; indeterminate?: boolean; disabled?: boolean; ariaLabel?: string }) {
  return (
    <label className={clsx('inline-flex items-start gap-2.5', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} aria-label={ariaLabel} disabled={disabled} onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
        className={clsx('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors', checked || indeterminate ? 'border-forest-700 bg-forest-700 text-white' : 'border-line-strong bg-surface hover:border-ink-2/50')}>
        {indeterminate ? <span className="h-0.5 w-2 rounded bg-white" /> : checked ? <Check size={12} strokeWidth={3} /> : null}
      </button>
      {(label || description) && <span className="min-w-0"><span className="block text-sm text-ink">{label}</span>{description && <span className="block text-xs text-muted">{description}</span>}</span>}
    </label>
  )
}

/** Large selectable option (pick a person, a room, a plan). */
export function OptionCard({ selected, onClick, children, disabled, className }: { selected: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected}
      className={clsx('relative rounded-cell border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
        selected ? 'border-forest-700 bg-forest-50 ring-1 ring-forest-700' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2', className)}>
      {children}
      {selected && <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-forest-700 text-white"><Check size={10} strokeWidth={3} /></span>}
    </button>
  )
}
