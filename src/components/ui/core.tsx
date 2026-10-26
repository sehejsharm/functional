import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'link' | 'light'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onDragOver'> & {
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: LucideIcon; iconRight?: LucideIcon; block?: boolean
}

const BTN_SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5', sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-[15px] gap-2',
}
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-forest-900 text-white shadow-sm hover:bg-forest-800 active:bg-forest-950',
  secondary: 'border border-line-strong bg-surface text-ink shadow-sm hover:bg-surface-2 hover:border-ink-2/30',
  ghost: 'text-ink-2 hover:bg-ink/5 hover:text-ink',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger/90',
  gold: 'bg-gold-500 text-forest-950 shadow-sm hover:bg-gold-400',
  link: 'h-auto px-0 text-forest-700 underline-offset-2 hover:underline',
  // Light-on-dark surfaces (sidebar, interstitials).
  light: 'bg-white/10 text-white hover:bg-white/15 border border-white/15',
}

/**
 * Primary action button. `primary` = forest, `gold` is the single hero action on a screen,
 * `secondary` for everything else, `danger` for destructive work (always behind a confirm).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon: I, iconRight: IR, block, className, children, disabled, type = 'button', ...rest }, ref,
) {
  const iconSize = size === 'lg' ? 18 : size === 'md' ? 16 : 14
  return (
    <motion.button ref={ref} type={type} whileTap={disabled || loading ? undefined : { scale: 0.98 }} disabled={disabled || loading}
      className={clsx('inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-cell font-semibold transition-colors',
        'disabled:pointer-events-none disabled:opacity-50', variant !== 'link' && BTN_SIZE[size], BTN_VARIANT[variant], block && 'w-full', className)}
      {...rest}>
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : I ? <I size={iconSize} aria-hidden /> : null}
      {children}
      {IR && !loading && <IR size={iconSize} aria-hidden />}
    </motion.button>
  )
})

export function IconButton({ icon: I, label, size = 'md', variant = 'ghost', className, badge, ...rest }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: LucideIcon; label: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'secondary' | 'dark'; badge?: number }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={clsx('relative inline-grid shrink-0 place-items-center rounded-cell transition-colors disabled:opacity-50',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        variant === 'ghost' && 'text-ink-2 hover:bg-ink/5 hover:text-ink',
        variant === 'secondary' && 'border border-line-strong bg-surface text-ink-2 shadow-sm hover:bg-surface-2',
        variant === 'dark' && 'text-sage-300 hover:bg-white/10 hover:text-white', className)} {...rest}>
      <I size={size === 'sm' ? 15 : 17} aria-hidden />
      {!!badge && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'gold'
const BADGE_TONE: Record<Tone, string> = {
  neutral: 'bg-ink/[0.06] text-ink-2 ring-ink/10',
  success: 'bg-ok/10 text-ok ring-ok/25',
  warning: 'bg-amber/10 text-amber ring-amber/25',
  danger: 'bg-danger/10 text-danger ring-danger/25',
  info: 'bg-info/10 text-info ring-info/25',
  brand: 'bg-forest-100 text-forest-800 ring-forest-700/20',
  gold: 'bg-gold-50 text-gold-700 ring-gold-500/40',
}
const DOT_TONE: Record<Tone, string> = {
  neutral: 'bg-muted', success: 'bg-ok', warning: 'bg-amber', danger: 'bg-danger', info: 'bg-info', brand: 'bg-forest-700', gold: 'bg-gold-500',
}

/** Status chip. Keep labels short and sentence-case ("In progress", "Awaiting check"). */
export function Badge({ tone = 'neutral', dot, children, className, size = 'sm' }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill font-medium ring-1 ring-inset',
      size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs', BADGE_TONE[tone], className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', DOT_TONE[tone])} aria-hidden />}
      {children}
    </span>
  )
}

/** Older tone names used across early screens. */
export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'gold' | 'ok' | 'warn' | 'danger' | 'light' | 'info'; children: ReactNode; className?: string }) {
  const map = { neutral: 'neutral', gold: 'gold', ok: 'success', warn: 'warning', danger: 'danger', light: 'neutral', info: 'info' } as const
  return <Badge tone={map[tone]} className={className}>{children}</Badge>
}

export const Count = ({ n, tone = 'gold' }: { n: number; tone?: 'gold' | 'danger' | 'neutral' }) => (
  <span className={clsx('ml-1 inline-grid h-5 min-w-5 place-items-center rounded-pill px-1.5 text-[10px] font-bold tabular',
    tone === 'gold' && 'bg-gold-500 text-forest-950', tone === 'danger' && 'bg-danger text-white', tone === 'neutral' && 'bg-white/15 text-white')}>{n}</span>
)

export function Logo({ size = 36, wordmark = true, light = true }: { size?: number; wordmark?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span style={{ width: size, height: size }} className="grid place-items-center rounded-[28%] bg-gold-500 font-display font-bold text-forest-950 shadow-sm" aria-hidden>
        <span style={{ fontSize: size * 0.58 }}>M</span>
      </span>
      {wordmark && <span className={clsx('font-display text-xl font-bold tracking-tight', light ? 'text-white' : 'text-ink')}>Mise</span>}
    </span>
  )
}

const AVATAR_BG = ['bg-forest-100 text-forest-800', 'bg-gold-50 text-gold-700', 'bg-info/10 text-info', 'bg-amber/10 text-amber', 'bg-ok/10 text-ok', 'bg-danger/10 text-danger']
export const initialsOf = (name: string) => name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()

/** Pass `name` (preferred) or `initials`. `tone="gold"` keeps the brand look on dark surfaces. */
export function Avatar({ name, initials, size = 32, tone, className }: { name?: string; initials?: string; size?: number; tone?: 'gold' | 'sage' | 'auto'; className?: string }) {
  const text = initials ?? (name ? initialsOf(name) : '?')
  const auto = AVATAR_BG[[...(name ?? text)].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length]
  return (
    <span style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }} title={name}
      className={clsx('grid shrink-0 select-none place-items-center rounded-full font-semibold',
        tone === 'gold' ? 'bg-gold-500/20 text-gold-300 ring-1 ring-gold-500/40' : tone === 'sage' ? 'bg-sage-200 text-ink' : auto, className)}>
      {text}
    </span>
  )
}

export function AvatarStack({ names, max = 4, size = 26 }: { names: string[]; max?: number; size?: number }) {
  return (
    <span className="flex -space-x-1.5">
      {names.slice(0, max).map((n) => <Avatar key={n} name={n} size={size} className="ring-2 ring-surface" />)}
      {names.length > max && <span style={{ width: size, height: size }} className="grid place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted ring-2 ring-surface">+{names.length - max}</span>}
    </span>
  )
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>

export const Spinner = ({ size = 16, className }: { size?: number; className?: string }) => <Loader2 size={size} className={clsx('animate-spin text-muted', className)} aria-label="Loading" />

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={clsx('relative overflow-hidden rounded-cell bg-ink/[0.06]', className)} aria-hidden>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
  </div>
)

export function ProgressBar({ value, max = 100, tone = 'brand', label, showValue, size = 'md' }: { value: number; max?: number; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'gold'; label?: string; showValue?: boolean; size?: 'sm' | 'md' }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="w-full">
      {(label || showValue) && <div className="mb-1 flex justify-between text-xs"><span className="text-ink-2">{label}</span>{showValue && <span className="font-medium tabular text-ink">{Math.round(pct)}%</span>}</div>}
      <div className={clsx('w-full overflow-hidden rounded-pill bg-ink/[0.07]', size === 'sm' ? 'h-1.5' : 'h-2')} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <motion.div className={clsx('h-full rounded-pill', { brand: 'bg-forest-700', success: 'bg-ok', warning: 'bg-amber', danger: 'bg-danger', gold: 'bg-gold-500' }[tone])}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </div>
    </div>
  )
}

/** Hover/focus tooltip without a portal; fine for short labels. */
export function Tooltip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span role="tooltip" className={clsx('pointer-events-none absolute left-1/2 z-50 w-max max-w-xs -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-pop transition-opacity group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
        side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>{label}</span>
    </span>
  )
}

export const Divider = ({ className }: { className?: string }) => <hr className={clsx('border-line', className)} />
