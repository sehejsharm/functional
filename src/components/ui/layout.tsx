import clsx from 'clsx'
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Screen title block. Breadcrumbs live in the shell's top bar, so this holds title, description,
 * optional status/meta line and the screen's actions (right-aligned, primary action last).
 */
export function PageHeader({ title, description, eyebrow, actions, meta, back, tagline, right, children }: {
  title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; meta?: ReactNode
  back?: { to: string; label: string }; children?: ReactNode
  /** @deprecated use description */ tagline?: ReactNode
  /** @deprecated use actions */ right?: ReactNode
}) {
  return (
    <header className="mb-6">
      {back && <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft size={15} /> {back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold leading-tight text-ink md:text-[28px]">{title}</h1>
          {(description ?? tagline) && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description ?? tagline}</p>}
          {meta && <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">{meta}</div>}
        </div>
        {(actions ?? right) && <div className="flex flex-wrap items-center gap-2">{actions ?? right}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  )
}

export function Card({ children, className, as: As = 'section', id }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; id?: string }) {
  return <As id={id} className={clsx('card scroll-mt-24', className)}>{children}</As>
}

export function CardHeader({ title, description, actions, icon: I, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {I && <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-cell bg-forest-50 text-forest-700"><I size={16} /></span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
export const CardBody = ({ children, className }: { children: ReactNode; className?: string }) => <div className={clsx('p-5', className)}>{children}</div>
export const CardFooter = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={clsx('flex items-center justify-end gap-2 rounded-b-card border-t border-line bg-surface-2 px-5 py-3', className)}>{children}</div>
)

/** Card with an optional header row; the common building block for a screen region. */
export function Section({ title, description, right, actions, children, id, className, bodyClassName, icon }: {
  title?: ReactNode; description?: ReactNode; right?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; className?: string; bodyClassName?: string; icon?: LucideIcon
}) {
  return (
    <Card id={id} className={className}>
      {(title || actions || right) && <CardHeader title={title} description={description} actions={actions ?? right} icon={icon} />}
      <div className={clsx('p-5', bodyClassName)}>{children}</div>
    </Card>
  )
}

export function EmptyState({ icon: I = Inbox, title, description, body, action, compact, className }: {
  icon?: LucideIcon; title: ReactNode; description?: ReactNode; /** @deprecated */ body?: ReactNode; action?: ReactNode; compact?: boolean; className?: string
}) {
  return (
    <div className={clsx('flex flex-col items-center text-center', compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-12', className)}>
      <span className={clsx('grid place-items-center rounded-full bg-forest-50 text-forest-700 ring-8 ring-forest-50/50', compact ? 'h-9 w-9' : 'h-12 w-12')}><I size={compact ? 16 : 20} /></span>
      <div className="mt-1 text-sm font-semibold text-ink">{title}</div>
      {(description ?? body) && <p className="max-w-sm text-sm text-muted">{description ?? body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
export const Empty = EmptyState

export function KeyValue({ items, columns = 1 }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-3', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface TimelineItem { id: string; title: ReactNode; meta?: ReactNode; body?: ReactNode; icon?: LucideIcon; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' }
export function Timeline({ items, empty = 'No activity yet' }: { items: TimelineItem[]; empty?: ReactNode }) {
  if (!items.length) return <p className="py-4 text-sm text-muted">{empty}</p>
  return (
    <ol className="relative">
      {items.map((it, i) => {
        const I = it.icon
        return (
          <li key={it.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" aria-hidden />}
            <span className={clsx('relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-surface', {
              neutral: 'bg-surface-2 text-muted', success: 'bg-ok/10 text-ok', warning: 'bg-amber/10 text-amber', danger: 'bg-danger/10 text-danger', info: 'bg-info/10 text-info', brand: 'bg-forest-100 text-forest-800',
            }[it.tone ?? 'neutral'])}>{I ? <I size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-sm text-ink">{it.title}</div>
              {it.meta && <div className="mt-0.5 text-xs text-muted">{it.meta}</div>}
              {it.body && <div className="mt-1.5 text-sm text-ink-2">{it.body}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Inline trend line for KPI cards. */
export function Sparkline({ data, tone = 'brand', height = 32, width = 96 }: { data: number[]; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'gold'; height?: number; width?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = { brand: 'rgb(var(--forest-700))', success: 'rgb(var(--ok))', warning: 'rgb(var(--amber))', danger: 'rgb(var(--danger))', gold: 'rgb(var(--gold-500))' }[tone]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  )
}

/**
 * KPI tile. `delta` is the change vs the comparison period; set `goodWhen="down"` for metrics where
 * lower is better (overdue, minutes over target) so colour reflects good/bad, not direction.
 */
export function StatCard({ label, value, unit, delta, deltaLabel = 'vs last week', goodWhen = 'up', hint, icon: I, trend, to, loading }: {
  label: ReactNode; value: ReactNode; unit?: string; delta?: number | null; deltaLabel?: string; goodWhen?: 'up' | 'down'; hint?: ReactNode
  icon?: LucideIcon; trend?: number[]; to?: string; loading?: boolean
}) {
  const good = delta == null || delta === 0 ? null : (delta > 0) === (goodWhen === 'up')
  const body = (
    <div className={clsx('card h-full p-4 transition', to && 'hover:border-forest-600/40 hover:shadow-pop')}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted">{label}</div>
        {I && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-cell bg-forest-50 text-forest-700"><I size={14} /></span>}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? <div className="h-8 w-16 animate-pulse rounded bg-ink/5" /> : (
            <div className="text-[28px] font-semibold leading-none tracking-tight text-ink tabular">{value}{unit && <span className="ml-0.5 text-base font-medium text-muted">{unit}</span>}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {delta != null && (
              <span className={clsx('inline-flex items-center gap-0.5 font-semibold', good == null ? 'text-muted' : good ? 'text-ok' : 'text-danger')}>
                {delta > 0 ? <ArrowUpRight size={13} /> : delta < 0 ? <ArrowDownRight size={13} /> : null}{delta > 0 ? '+' : ''}{delta}{typeof delta === 'number' && unit === '%' ? 'pt' : ''}
              </span>
            )}
            {delta != null && <span className="text-muted">{deltaLabel}</span>}
            {hint && <span className="text-muted">{hint}</span>}
          </div>
        </div>
        {trend && <span className="hidden shrink-0 sm:block"><Sparkline data={trend} tone={good === false ? 'danger' : 'brand'} width={80} /></span>}
      </div>
    </div>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}

/** Row of filters/search/actions above a list. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('flex flex-wrap items-center gap-2', className)}>{children}</div>
}
