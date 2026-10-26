import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import {
  Bath, Bed, Bell, BellRing, BriefcaseBusiness, Check, ClipboardCheck, DoorOpen, Eye, HelpCircle, Luggage, Moon, Shield, ShoppingCart, Sparkles, SprayCan, Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './core'

/** Animated check-off: a stroke-draw rather than a static tick. */
export function CheckMark({ checked, size = 28 }: { checked: boolean; size?: number }) {
  return (
    <motion.span animate={{ scale: checked ? [1, 1.15, 1] : 1, backgroundColor: checked ? 'rgb(30 76 54)' : 'rgba(255,255,255,1)' }}
      style={{ width: size, height: size }}
      className={clsx('grid shrink-0 place-items-center rounded-full border-2', checked ? 'border-forest-700' : 'border-line-strong')}>
      <svg viewBox="0 0 24 24" width={size * 0.57} height={size * 0.57} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={false} animate={{ pathLength: checked ? 1 : 0 }} transition={{ duration: 0.3 }} />
      </svg>
    </motion.span>
  )
}

export const STEP_ICONS: Record<string, LucideIcon> = {
  door: DoorOpen, bed: Bed, bath: Bath, eye: Eye, check: Check, moon: Moon, cart: ShoppingCart, shield: Shield, clipboard: ClipboardCheck, bell: Bell,
  luggage: Luggage, spray: SprayCan, food: Utensils, sparkle: Sparkles, case: BriefcaseBusiness, alert: BellRing,
}
export const StepIcon = ({ name, size = 16 }: { name: string; size?: number }) => { const I = STEP_ICONS[name] ?? Check; return <I size={size} aria-hidden /> }

export function IconBadge({ icon: I, label, onClick, active }: { icon: LucideIcon; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={clsx('grid h-8 w-8 place-items-center rounded-cell text-sage-300 transition hover:bg-white/10 hover:text-white', active && 'bg-white/10 text-white')}>
      <I size={16} />
    </button>
  )
}
export const HelpBadge = (p: { onClick: () => void }) => <IconBadge icon={HelpCircle} label="Help" onClick={p.onClick} />

/** A warm full-screen card that interrupts gently for a shift event (urgent ended, reassigned…). */
export function ShiftEventInterstitial({ open, title, lead, details, actionLabel, onAction, footer }: {
  open: boolean; title: string; lead: string; details: ReactNode; actionLabel: string; onAction: () => void; footer?: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[65] grid place-items-center bg-forest-950/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="alertdialog" aria-label={title} initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface text-ink shadow-lift">
            <div className="h-1.5 bg-gradient-to-r from-gold-500 via-gold-400 to-forest-700" />
            <div className="p-6">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gold-50 text-gold-700"><BellRing size={18} /></span>
                <h2 className="text-xl font-semibold">{title}</h2>
              </div>
              <p className="text-ink-2">{lead}</p>
              <div className="mt-4 rounded-card border border-line bg-surface-2 p-4">{details}</div>
              <Button variant="primary" size="lg" block className="mt-5" onClick={onAction}>{actionLabel}</Button>
              {footer && <p className="mt-3 text-center text-xs text-muted">{footer}</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
