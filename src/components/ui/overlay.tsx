import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useConfirmStore, useToasts } from '@/lib/toast'
import { Button } from './core'

const Portal = ({ children }: { children: ReactNode }) => (typeof document === 'undefined' ? null : createPortal(children, document.body))

// Open overlays, innermost last: Escape closes only the top one.
const overlayStack: number[] = []
let overlaySeq = 0

/**
 * Shared overlay behaviour: Escape closes only the topmost overlay, focus moves into the dialog and
 * returns to the opener on close, and clicks/submits are ignored once closing starts (the exit
 * animation keeps the old footer on screen for a moment — this stops double submits).
 */
function useOverlay(open: boolean, onClose: () => void) {
  const openRef = useRef(open)
  openRef.current = open
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const id = ++overlaySeq
    overlayStack.push(id)
    const opener = document.activeElement as HTMLElement | null
    const h = (e: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== id) return
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      // Keep keyboard focus inside the open dialog.
      const f = [...dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', h)
    const t = setTimeout(() => {
      const el = dialogRef.current
      if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]), textarea, select') ?? el).focus({ preventScroll: true })
    }, 30)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', h)
      const i = overlayStack.indexOf(id); if (i >= 0) overlayStack.splice(i, 1)
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open])
  const guard = { onClickCapture: (e: React.SyntheticEvent) => { if (!openRef.current) { e.stopPropagation(); e.preventDefault() } },
    onSubmitCapture: (e: React.SyntheticEvent) => { if (!openRef.current) { e.stopPropagation(); e.preventDefault() } } }
  return { dialogRef, guard }
}

/** Centered dialog. Put the primary action last in `footer`. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const { dialogRef, guard } = useOverlay(open, onClose)
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto p-4" {...guard}>
            <motion.div className="fixed inset-0 bg-forest-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.div ref={dialogRef as React.RefObject<HTMLDivElement>} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
              initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ duration: 0.16 }}
              className={clsx('relative w-full rounded-card border border-line bg-surface shadow-lift outline-none', { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size])}>
              <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
                <div><h2 className="text-base font-semibold text-ink">{title}</h2>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>
                <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded-cell p-1.5 text-muted hover:bg-ink/5 hover:text-ink"><X size={18} /></button>
              </div>
              {children && <div className="max-h-[70vh] overflow-y-auto px-5 pb-5">{children}</div>}
              {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-card border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

/** Side sheet (detail panels, filters) or bottom sheet on phones. */
export function Drawer({ open, onClose, title, description, children, footer, side = 'right', width = 'md', dark }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode
  side?: 'right' | 'left' | 'bottom'; width?: 'sm' | 'md' | 'lg'; dark?: boolean
}) {
  const { dialogRef, guard } = useOverlay(open, onClose)
  const from = side === 'right' ? { x: '100%' } : side === 'left' ? { x: '-100%' } : { y: '100%' }
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-[55] bg-forest-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.aside ref={dialogRef as React.RefObject<HTMLElement>} tabIndex={-1} {...guard} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
              className={clsx('fixed z-[56] flex flex-col shadow-lift outline-none', dark ? 'sidebar-surface text-sage-50' : 'bg-surface text-ink',
                side === 'bottom' ? 'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl' : clsx('top-0 h-full w-full', side === 'right' ? 'right-0' : 'left-0', { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }[width]))}
              initial={from} animate={{ x: 0, y: 0 }} exit={from} transition={{ type: 'spring', damping: 32, stiffness: 320 }}>
              {side === 'bottom' && <span className="mx-auto mt-2 h-1 w-10 rounded-pill bg-ink/15" aria-hidden />}
              <div className={clsx('flex items-start justify-between gap-3 px-5 py-4', dark ? 'border-b border-white/10' : 'border-b border-line')}>
                <div className="min-w-0"><h2 className={clsx('text-base font-semibold', dark ? 'text-white' : 'text-ink')}>{title}</h2>{description && <p className={clsx('mt-0.5 text-sm', dark ? 'text-sage-300' : 'text-muted')}>{description}</p>}</div>
                <button onClick={onClose} aria-label="Close" className={clsx('rounded-cell p-1.5', dark ? 'text-sage-300 hover:bg-white/10 hover:text-white' : 'text-muted hover:bg-ink/5 hover:text-ink')}><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">{children}</div>
              {footer && <div className={clsx('flex flex-wrap items-center justify-end gap-2 px-5 py-3', dark ? 'border-t border-white/10' : 'border-t border-line bg-surface-2')}>{footer}</div>}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </Portal>
  )
}

export type MenuItem = { label: ReactNode; icon?: LucideIcon; onClick?: () => void; danger?: boolean; disabled?: boolean; hint?: ReactNode } | 'separator' | { heading: ReactNode }

/** Dropdown anchored to its trigger; rendered in a portal so tables and cards never clip it. */
export function Menu({ trigger, items, align = 'end', width = 220, label = 'Open menu', block }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; items: MenuItem[]; align?: 'start' | 'end'; width?: number; label?: string; /** stretch the trigger to its container's width */ block?: boolean }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    const left = align === 'end' ? r.right - width : r.left
    const below = r.bottom + 6
    const h = panel.current?.offsetHeight ?? 240
    setPos({ top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) })
  }, [open, align, width])
  const triggerEl = () => anchor.current?.querySelector<HTMLElement>('button, a, [tabindex]') ?? null
  // ARIA belongs on the real trigger control, not the wrapper.
  useEffect(() => {
    const t = triggerEl(); if (!t) return
    t.setAttribute('aria-haspopup', 'menu'); t.setAttribute('aria-expanded', String(open))
    if (!t.getAttribute('aria-label') && !t.textContent?.trim()) t.setAttribute('aria-label', label)
  })
  const items$ = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not([disabled])') ?? [])]
  useEffect(() => { if (open) { const t = setTimeout(() => items$()[0]?.focus(), 20); return () => clearTimeout(t) } }, [open])
  const onPanelKey = (e: React.KeyboardEvent) => {
    const list = items$(); const i = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); triggerEl()?.focus() }
    else if (e.key === 'Tab') setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const scroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); window.addEventListener('keydown', key); window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); window.removeEventListener('scroll', scroll, true) }
  }, [open])
  return (
    <>
      <span ref={anchor} className={block ? 'flex w-full min-w-0' : 'inline-flex'}>{trigger({ open, toggle: () => setOpen((o) => !o) })}</span>
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div ref={panel} role="menu" aria-label={label} onKeyDown={onPanelKey} style={{ top: pos.top, left: pos.left, width }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
              className="fixed z-[70] rounded-card border border-line bg-surface p-1 text-ink shadow-pop">
              {items.map((it, i) => it === 'separator' ? <div key={i} className="my-1 h-px bg-line" /> : 'heading' in it
                ? <div key={i} className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted">{it.heading}</div>
                : (
                  <button key={i} role="menuitem" type="button" tabIndex={-1} disabled={it.disabled} onClick={() => { setOpen(false); triggerEl()?.focus(); it.onClick?.() }}
                    className={clsx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition focus:outline-none disabled:opacity-40', it.danger ? 'text-danger hover:bg-danger/5 focus:bg-danger/5' : 'text-ink hover:bg-ink/5 focus:bg-ink/5')}>
                    {it.icon && <it.icon size={15} className={it.danger ? '' : 'text-muted'} />}
                    <span className="flex-1">{it.label}</span>
                    {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
                  </button>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  )
}

/** Mounted once in App; serves `confirm()` and `prompt()` from '@/lib/toast'. */
export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req)
  const [text, setText] = useState('')
  useEffect(() => setText(''), [req])
  const close = (v: false | { value: string }) => { req?.resolve(v); useConfirmStore.setState({ req: null }) }
  const blocked = !!req && ((req.requireText && text.trim() !== req.requireText) || (req.input?.required && !text.trim()))
  return (
    <Modal open={!!req} onClose={() => close(false)} size="sm" title={req?.title ?? ''} description={req?.body}
      footer={<>
        <Button variant="secondary" onClick={() => close(false)}>{req?.cancelLabel ?? 'Cancel'}</Button>
        <Button variant={req?.tone === 'danger' ? 'danger' : 'primary'} disabled={!!blocked} onClick={() => close({ value: text.trim() })}>{req?.confirmLabel ?? 'Confirm'}</Button>
      </>}>
      {req?.input && (
        <label className="block"><span className="label">{req.input.label}{req.input.required && <span className="text-danger"> *</span>}</span>
          <textarea autoFocus rows={3} className="input" placeholder={req.input.placeholder} value={text} onChange={(e) => setText(e.target.value)} /></label>
      )}
      {req?.requireText && (
        <label className="block"><span className="label">Type <b className="font-semibold text-ink">{req.requireText}</b> to confirm</span>
          <input autoFocus className="input" value={text} onChange={(e) => setText(e.target.value)} /></label>
      )}
    </Modal>
  )
}

const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle }
const TOAST_TONE = { success: 'text-ok', error: 'text-danger', info: 'text-info', warning: 'text-amber' }

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <Portal>
      <div aria-live="polite" className="pointer-events-none fixed right-4 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 max-lg:top-16 lg:bottom-4">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const I = TOAST_ICON[t.tone]
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
                role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-card border border-line bg-surface p-3.5 shadow-pop">
                <I size={18} className={clsx('mt-0.5 shrink-0', TOAST_TONE[t.tone])} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{t.title}</div>
                  {t.description && <div className="mt-0.5 text-sm text-muted">{t.description}</div>}
                  {t.action && <button className="mt-1.5 text-sm font-semibold text-forest-700 hover:underline" onClick={() => { t.action!.onClick(); dismiss(t.id) }}>{t.action.label}</button>}
                </div>
                <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="-m-2 rounded p-2.5 text-muted hover:text-ink"><X size={15} /></button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Portal>
  )
}
