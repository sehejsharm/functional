import clsx from 'clsx'
import type { ReactNode } from 'react'

export interface TabItem<T extends string> { id: T; label: ReactNode; count?: number }

/**
 * Tabs. `underline` (default) for switching views inside a screen; `pill` for compact
 * view toggles (a segmented control).
 */
export function Tabs<T extends string>({ value, onChange, items, variant = 'underline', className }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; variant?: 'underline' | 'pill'; className?: string }) {
  if (variant === 'pill') return <Segmented value={value} onChange={onChange} items={items} className={className} />
  return (
    <div role="tablist" className={clsx('scrollbar-none flex gap-5 overflow-x-auto border-b border-line', className)}>
      {items.map((it) => {
        const on = value === it.id
        return (
          <button key={it.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(it.id)}
            className={clsx('relative -mb-px flex items-center gap-2 whitespace-nowrap pb-2.5 pt-1 text-sm font-medium transition-colors', on ? 'text-ink' : 'text-muted hover:text-ink')}>
            {it.label}
            {it.count != null && <span className={clsx('rounded-pill px-1.5 py-px text-2xs font-semibold tabular', on ? 'bg-forest-900 text-white' : 'bg-ink/[0.07] text-ink-2')}>{it.count}</span>}
            <span aria-hidden className={clsx('absolute inset-x-0 bottom-0 h-0.5 rounded-pill bg-forest-900 transition-opacity duration-200', on ? 'opacity-100' : 'opacity-0')} />
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, items, className, size = 'md' }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={clsx('inline-flex rounded-cell bg-ink/[0.06] p-0.5', className)}>
      {items.map((it) => {
        const on = value === it.id
        return (
          <button key={it.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(it.id)}
            className={clsx('relative flex items-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-all duration-150', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm', on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}>
            <span className="relative">{it.label}</span>
            {it.count != null && <span className="relative rounded-pill bg-ink/[0.08] px-1.5 text-2xs font-semibold tabular">{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Horizontal workflow stepper (Draft → Review → Release). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === current ? 'step' : undefined}>
          <span className={clsx('grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
            i < current ? 'bg-forest-700 text-white' : i === current ? 'bg-forest-900 text-white ring-4 ring-forest-100' : 'bg-ink/[0.07] text-muted')}>{i < current ? '✓' : i + 1}</span>
          <span className={clsx(i === current ? 'font-semibold text-ink' : 'text-muted')}>{s}</span>
          {i < steps.length - 1 && <span className={clsx('mx-1 h-px w-8', i < current ? 'bg-forest-700' : 'bg-line-strong')} />}
        </li>
      ))}
    </ol>
  )
}
