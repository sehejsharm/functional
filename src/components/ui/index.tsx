import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import {
  Bath, Bed, Bell, Check, ClipboardCheck, DoorOpen, Eye, HelpCircle, Moon, Search, Shield, ShoppingCart, Sparkles, X,
  type LucideIcon,
} from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type BtnVariant = 'gold' | 'primary' | 'ghost' | 'light' | 'danger'
export function Button({ variant = 'primary', size = 'md', className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <motion.button
      whileTap={rest.disabled ? undefined : { scale: 0.97 }}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
        size === 'sm' && 'px-3 py-1.5 text-xs', size === 'md' && 'px-4 py-2.5 text-sm', size === 'lg' && 'px-5 py-3.5 text-base',
        variant === 'gold' && 'bg-gold-500 text-forest-950 hover:bg-gold-400',
        variant === 'primary' && 'bg-forest-600 text-sage-50 hover:bg-forest-700 border border-white/10',
        variant === 'ghost' && 'text-sage-200 hover:bg-white/5',
        variant === 'light' && 'bg-sage-50 text-ink hover:bg-sage-100',
        variant === 'danger' && 'bg-danger/90 text-white hover:bg-danger',
        className,
      )}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  )
}

export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'gold' | 'ok' | 'warn' | 'danger' | 'light'; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', {
      'bg-white/8 text-sage-200 border border-white/10': tone === 'neutral',
      'bg-gold-500/15 text-gold-400 border border-gold-500/30': tone === 'gold',
      'bg-ok/15 text-ok border border-ok/30': tone === 'ok',
      'bg-amber/15 text-amber border border-amber/30': tone === 'warn',
      'bg-danger/15 text-danger border border-danger/30': tone === 'danger',
      'bg-sage-200 text-ink': tone === 'light',
    }, className)}>{children}</span>
  )
}

export const Count = ({ n }: { n: number }) => (
  <span className="ml-1 inline-grid min-w-5 h-5 place-items-center rounded-pill bg-gold-500 px-1.5 text-[10px] font-bold text-forest-950">{n}</span>
)

export function Logo({ size = 36, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span style={{ width: size, height: size }} className="grid place-items-center rounded-[28%] bg-gold-500 font-display font-bold text-forest-950" aria-hidden>
        <span style={{ fontSize: size * 0.58 }}>M</span>
      </span>
      {wordmark && <span className="font-display text-xl font-bold tracking-tight text-white">Mise</span>}
    </span>
  )
}

export function IconBadge({ icon: I, label, onClick, active }: { icon: LucideIcon; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={clsx('grid h-9 w-9 place-items-center rounded-full border bg-forest-800 text-sage-200 hover:text-gold-400 transition',
        active ? 'border-gold-500/60' : 'border-white/15')}>
      <I size={16} />
    </button>
  )
}
export const HelpBadge = (p: { onClick: () => void }) => <IconBadge icon={HelpCircle} label="Help" onClick={p.onClick} />

export function Avatar({ initials, size = 36, tone = 'gold' }: { initials: string; size?: number; tone?: 'gold' | 'sage' }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={clsx('grid shrink-0 place-items-center rounded-full font-bold', tone === 'gold' ? 'bg-gold-500/20 text-gold-400 ring-1 ring-gold-500/40' : 'bg-sage-200 text-ink')}>
      {initials}
    </span>
  )
}

export function PageHeader({ eyebrow, title, tagline, right }: { eyebrow?: string; title: string; tagline?: string; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-3xl font-bold text-white md:text-4xl">{title}</h1>
        {tagline && <p className="mt-1 text-sage-300">{tagline}</p>}
      </div>
      {right}
    </header>
  )
}

export function Section({ title, right, children, id, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={clsx('card p-5 scroll-mt-6', className)}>
      {(title || right) && <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">{title}</h2>{right}</div>}
      {children}
    </section>
  )
}

export function Empty({ title, body, icon: I = Sparkles, action }: { title: string; body?: string; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-white/10 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full border border-gold-500/30 bg-forest-900 text-gold-400"><I size={20} /></span>
      <div className="font-semibold text-white">{title}</div>
      {body && <p className="max-w-sm text-sm text-sage-300">{body}</p>}
      {action}
    </div>
  )
}

export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('animate-pulse rounded-xl bg-white/5', className)} />

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-forest-950/60 p-1">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}
          className={clsx('relative rounded-lg px-3 py-1.5 text-sm font-medium transition', value === it.id ? 'text-forest-950' : 'text-sage-300 hover:text-white')}>
          {value === it.id && <motion.span layoutId={`tab-${items.map((i) => i.id).join()}`} className="absolute inset-0 rounded-lg bg-sage-50" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
          <span className="relative">{it.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Drawer({ open, onClose, title, children, side = 'right' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: 'right' | 'bottom' }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-label={title}
            className={clsx('fixed z-50 flex flex-col bg-forest-900 shadow-lift border-white/10',
              side === 'right' ? 'right-0 top-0 h-full w-full max-w-md border-l' : 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-card border-t')}
            initial={side === 'right' ? { x: '100%' } : { y: '100%' }} animate={{ x: 0, y: 0 }} exit={side === 'right' ? { x: '100%' } : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-sage-300 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  )
}

/** Animated check-off: a satisfying stroke-draw rather than a static tick. */
export function CheckMark({ checked }: { checked: boolean }) {
  return (
    <motion.span animate={{ scale: checked ? [1, 1.18, 1] : 1, backgroundColor: checked ? 'rgb(201 162 75)' : 'rgba(0,0,0,0)' }}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-gold-500">
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="rgb(7 31 22)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={false} animate={{ pathLength: checked ? 1 : 0 }} transition={{ duration: 0.3 }} />
      </svg>
    </motion.span>
  )
}

export const STEP_ICONS: Record<string, LucideIcon> = { door: DoorOpen, bed: Bed, bath: Bath, eye: Eye, check: Check, moon: Moon, cart: ShoppingCart, shield: Shield, clipboard: ClipboardCheck, bell: Bell }
export const StepIcon = ({ name, size = 16 }: { name: string; size?: number }) => { const I = STEP_ICONS[name] ?? Check; return <I size={size} /> }

/** Reusable "shift event interstitial": a warm full-width card that interrupts gently. */
export function ShiftEventInterstitial({ open, title, lead, details, actionLabel, onAction, footer }: {
  open: boolean; title: string; lead: string; details: ReactNode; actionLabel: string; onAction: () => void; footer?: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-forest-950/80 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="alertdialog" aria-label={title} initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }}
            className="w-full max-w-lg rounded-card bg-cream p-6 text-ink shadow-lift">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold-500/25 text-gold-600"><Bell size={18} /></span>
              <h2 className="text-2xl font-bold">{title}</h2>
            </div>
            <p className="mb-4 text-[15px] leading-relaxed">{lead}</p>
            <div className="mb-5 rounded-xl bg-white/70 p-4 text-sm">{details}</div>
            <Button variant="primary" size="lg" className="w-full !bg-forest-900" onClick={onAction}>{actionLabel}</Button>
            {footer && <p className="mt-3 text-center text-xs text-muted">{footer}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
