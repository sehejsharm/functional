// Presentational building blocks shared by the Employee screens (phone-first, ≥44px targets).
import clsx from 'clsx'
import {
  ChevronRight, ConciergeBell, HelpCircle, Lock, Megaphone, Package, PackageSearch, Send, ShieldAlert, Star, Wrench, type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SopSteps } from '@/components/SopSteps'
import { Badge, Button, Drawer, Field, Input, Select, Textarea, type Tone } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { fDateTime, fTime, minutesBetween } from '@/lib/time'
import type { IssueCategory, IssueSeverity, Notice, Room, SopStep, Task } from '@/lib/types'
import { toast } from '@/lib/toast'
import { relTime } from '@/shell/PortalShell'
import { CATEGORY, OCCUPANCY, PHASE, SEVERITY, taskPhase } from './model'

/** True at the desktop breakpoint (sidebar visible, no bottom tabs). */
export function useIsDesktop() {
  const q = '(min-width: 1024px)'
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const h = () => setMatch(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return match
}

/** Bottom sheet on phones, side panel on desktop. */
export function Sheet(props: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const desktop = useIsDesktop()
  return <Drawer {...props} side={desktop ? 'right' : 'bottom'} width="md" />
}

const CALLOUT_TONE: Record<'warning' | 'danger' | 'info' | 'gold' | 'neutral' | 'success', string> = {
  warning: 'border-amber/30 bg-amber/[0.07]',
  danger: 'border-danger/30 bg-danger/[0.06]',
  info: 'border-info/25 bg-info/[0.06]',
  gold: 'border-gold-500/35 bg-gold-50',
  neutral: 'border-line bg-surface-2',
  success: 'border-ok/25 bg-ok/[0.06]',
}
const CALLOUT_ICON: Record<keyof typeof CALLOUT_TONE, string> = {
  warning: 'text-amber', danger: 'text-danger', info: 'text-info', gold: 'text-gold-700', neutral: 'text-muted', success: 'text-ok',
}

/** Inline banner: sent-back rooms, manager notes, gates, version pins. */
export function Callout({ tone, icon: I, title, children, action, className, role }: {
  tone: keyof typeof CALLOUT_TONE; icon: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; role?: 'alert' | 'status'
}) {
  return (
    <div role={role} className={clsx('rounded-card bg-surface', className)}>
    <div className={clsx('flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-start', CALLOUT_TONE[tone])}>
      <div className="flex min-w-0 flex-1 gap-3">
        <I size={18} className={clsx('mt-0.5 shrink-0', CALLOUT_ICON[tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{title}</div>
          {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 gap-2 pl-[30px] sm:pl-0">{action}</div>}
    </div>
    </div>
  )
}

/** Square room-number tile used in lists. */
export function RoomTile({ number, vip, size = 'md', tone = 'neutral' }: { number?: string; vip?: boolean; size?: 'md' | 'lg'; tone?: 'neutral' | 'brand' | 'muted' }) {
  return (
    <span className={clsx('relative grid shrink-0 place-items-center rounded-cell border font-semibold tabular',
      size === 'lg' ? 'h-14 w-14 text-xl' : 'h-12 w-12 text-[17px]',
      tone === 'brand' ? 'border-forest-700/20 bg-forest-50 text-forest-900' : tone === 'muted' ? 'border-line bg-surface-2 text-muted' : 'border-line bg-surface-2 text-ink')}>
      {number ?? '—'}
      {vip && <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-gold-500 text-forest-950 ring-2 ring-surface" title="VIP guest"><Star size={10} fill="currentColor" aria-label="VIP" /></span>}
    </span>
  )
}

export function VipBadge() {
  return <Badge tone="gold"><Star size={10} fill="currentColor" aria-hidden />VIP</Badge>
}

export function OccupancyBadge({ room }: { room?: Room }) {
  if (!room?.occupancy) return null
  const o = OCCUPANCY[room.occupancy]
  return <Badge tone={o.tone} dot>{o.label}</Badge>
}

export function PhaseBadge({ task, now, size }: { task: Task; now: number; size?: 'sm' | 'md' }) {
  const p = PHASE[taskPhase(task, now)]
  return <Badge tone={p.tone} dot size={size}>{p.label}</Badge>
}

/** Tappable row for a room in the queue. */
export function TaskRow({ task, now, highlight }: { task: Task; now: number; highlight?: boolean }) {
  const room = useDB((s) => byId(s.rooms, task.roomId))
  const v = useDB((s) => byId(s.sopVersions, task.sopVersionId))
  const phase = taskPhase(task, now)
  const muted = phase === 'done' || phase === 'cancelled'
  return (
    <li>
      <Link to={`/employee/tasks/${task.id}`}
        className={clsx('group flex min-h-[68px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:px-5', highlight && 'bg-gold-50/50')}>
        <RoomTile number={room?.number} vip={room?.vip} tone={muted ? 'muted' : phase === 'in_progress' || phase === 'returned' ? 'brand' : 'neutral'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={clsx('truncate text-sm font-semibold', muted ? 'text-ink-2' : 'text-ink')}>{v?.title ?? 'Room task'}</span>
            {task.priority !== 'standard' && !muted && <Badge tone={task.priority === 'urgent' ? 'danger' : 'warning'}>{task.priority === 'urgent' ? 'Urgent' : 'High'}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {phase === 'gated' && <Lock size={11} className="text-muted" aria-hidden />}
            <span className="tabular">{phase === 'gated' ? `Opens ${fTime(task.start)}` : `${fTime(task.start)} – ${fTime(task.end)}`}</span>
            <span aria-hidden>·</span><span className="tabular">{minutesBetween(task.start, task.end)} min</span>
            {room?.type && <><span aria-hidden className="max-sm:hidden">·</span><span className="max-sm:hidden">{room.type}</span></>}
          </div>
          <div className="mt-1.5 sm:hidden"><PhaseBadge task={task} now={now} /></div>
        </div>
        <span className="max-sm:hidden"><PhaseBadge task={task} now={now} /></span>
        <ChevronRight size={16} className="shrink-0 text-line-strong transition group-hover:text-ink-2" aria-hidden />
      </Link>
    </li>
  )
}

/** Accessible single-choice chip row. */
export function ChipGroup<T extends string>({ label, value, onChange, options, invalid }: {
  label: string; value: T | null; onChange: (v: T) => void; options: { id: T; label: string; icon?: LucideIcon }[]; invalid?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.id
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={clsx('inline-flex min-h-11 items-center gap-2 rounded-pill border px-3.5 text-sm font-medium transition',
              on ? 'border-forest-700 bg-forest-900 text-white shadow-sm' : clsx('bg-surface text-ink-2 hover:border-ink-2/40 hover:text-ink', invalid ? 'border-danger/60' : 'border-line-strong'))}>
            {o.icon && <o.icon size={15} aria-hidden className={on ? 'text-gold-400' : 'text-muted'} />}{o.label}
          </button>
        )
      })}
    </div>
  )
}

export const CATEGORY_ICON: Record<IssueCategory, LucideIcon> = {
  guest: ConciergeBell, maintenance: Wrench, supplies: Package, safety: ShieldAlert, lost_found: PackageSearch, other: HelpCircle,
}

export interface IssueDraft { category: IssueCategory; severity: IssueSeverity; title: string; details: string; roomId: string }

/**
 * The report form used inside a room (room fixed) and from Reports (optional room picker).
 * Validates on submit; the caller performs the write and closes the sheet.
 */
export function IssueForm({ id, fixedRoom, rooms, onSubmit }: { id: string; fixedRoom?: Room; rooms?: Room[]; onSubmit: (d: IssueDraft) => void }) {
  const [category, setCategory] = useState<IssueCategory | null>(null)
  const [severity, setSeverity] = useState<IssueSeverity>('medium')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [roomId, setRoomId] = useState('')
  const [tried, setTried] = useState(false)
  const uid = useId()
  const errors = { category: !category ? 'Choose what kind of issue this is' : null, title: !title.trim() ? 'Give the issue a short title' : null }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errors.category || errors.title || !category) return
    onSubmit({ category, severity, title: title.trim(), details: details.trim(), roomId: fixedRoom?.id ?? roomId })
  }
  return (
    <form id={id} onSubmit={submit} noValidate className="space-y-5">
      {fixedRoom && (
        <div className="flex items-center gap-3 rounded-cell border border-line bg-surface-2 px-3 py-2.5">
          <RoomTile number={fixedRoom.number} vip={fixedRoom.vip} />
          <div className="min-w-0 text-sm"><div className="font-semibold text-ink">Room {fixedRoom.number}</div><div className="text-xs text-muted">{[fixedRoom.type, fixedRoom.wing && `${fixedRoom.wing} wing`, `floor ${fixedRoom.floor}`].filter(Boolean).join(' · ')}</div></div>
          <span className="ml-auto text-xs text-muted">Linked to this room</span>
        </div>
      )}
      <Field label="What kind of issue?" required error={tried && errors.category}>
        <ChipGroup label="Issue category" value={category} onChange={setCategory} invalid={tried && !!errors.category}
          options={(Object.keys(CATEGORY) as IssueCategory[]).map((c) => ({ id: c, label: CATEGORY[c].label, icon: CATEGORY_ICON[c] }))} />
      </Field>
      <Field label="How serious is it?" hint={SEVERITY[severity].hint}>
        <SeverityPicker value={severity} onChange={setSeverity} />
      </Field>
      <Field label="Short title" required htmlFor={`${uid}-t`} error={tried && errors.title} hint={!tried || !errors.title ? 'What someone needs to know at a glance.' : undefined}>
        <Input id={`${uid}-t`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} invalid={tried && !!errors.title} placeholder="e.g. Bathroom tap leaking" />
        {category && CATEGORY[category].quick.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested titles">
            {CATEGORY[category].quick.map((q) => (
              <button key={q} type="button" onClick={() => setTitle(q)} className="rounded-pill border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2 hover:border-line-strong hover:text-ink">{q}</button>
            ))}
          </div>
        )}
      </Field>
      {!fixedRoom && rooms && (
        <Field label="Room" hint="Optional. Leave blank for corridors, lifts and back-of-house." htmlFor={`${uid}-r`}>
          <Select id={`${uid}-r`} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">No specific room</option>
            {[...rooms].sort((a, b) => a.number.localeCompare(b.number)).map((r) => <option key={r.id} value={r.id}>Room {r.number}{r.type ? ` · ${r.type}` : ''}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Details" hint="What you saw, where, and anything you already did." htmlFor={`${uid}-d`}>
        <Textarea id={`${uid}-d`} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Cold tap drips constantly; towel placed under it." />
      </Field>
    </form>
  )
}

const SEV_DOT: Record<IssueSeverity, string> = { low: 'bg-muted', medium: 'bg-info', high: 'bg-amber', critical: 'bg-danger' }
/**
 * Severity as a 4-up radio group. (Deliberately not the shared Segmented: its animated pill keeps a
 * closing Drawer's backdrop mounted after the selection changes, which blocks the page.)
 */
export function SeverityPicker({ value, onChange }: { value: IssueSeverity; onChange: (v: IssueSeverity) => void }) {
  return (
    <div role="radiogroup" aria-label="Severity" className="grid grid-cols-4 gap-1 rounded-cell bg-ink/[0.06] p-1">
      {(Object.keys(SEVERITY) as IssueSeverity[]).map((s) => {
        const on = value === s
        return (
          <button key={s} type="button" role="radio" aria-checked={on} onClick={() => onChange(s)}
            className={clsx('flex min-h-10 items-center justify-center gap-1.5 rounded-[7px] text-sm font-medium transition',
              on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}>
            <span className={clsx('h-2 w-2 rounded-full', SEV_DOT[s], !on && 'opacity-60')} aria-hidden />{SEVERITY[s].label}
          </button>
        )
      })}
    </div>
  )
}

/** 1–5 star picker as a radio group. */
export function StarRating({ value, onChange, size = 28 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div role="radiogroup" aria-label="Rating out of 5" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} disabled={!onChange}
          onMouseEnter={() => onChange && setHover(n)} onClick={() => onChange?.(n)}
          className="grid h-11 w-11 place-items-center rounded-cell transition hover:bg-gold-50 disabled:cursor-default disabled:hover:bg-transparent">
          <Star size={size} className={n <= shown ? 'text-gold-500' : 'text-line-strong'} fill={n <= shown ? 'currentColor' : 'none'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  )
}

const NOTICE_PRIORITY: Record<NonNullable<Notice['priority']>, { label: string; tone: Tone } | null> = {
  normal: null, important: { label: 'Important', tone: 'warning' }, urgent: { label: 'Urgent', tone: 'danger' },
}

/**
 * A hotel notice with acknowledge / reply. Rendering it on screen records it as opened;
 * opening or replying is never task acceptance.
 */
export function NoticeCard({ notice, personId, compact }: { notice: Notice; personId: string; compact?: boolean }) {
  const ack = useDB((s) => s.ackEvents.find((a) => a.personId === personId && a.kind === 'notice' && a.refId === notice.id))
  const sender = useDB((s) => byId(s.people, notice.sentById))
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const uid = useId()
  useEffect(() => {
    if (!ack?.openedAt) useDB.getState().openRef(personId, 'notice', notice.id)
  }, [ack?.openedAt, personId, notice.id])
  const pr = NOTICE_PRIORITY[notice.priority ?? 'normal']
  const acked = !!ack?.acknowledgedAt
  const send = () => {
    setBusy(true)
    useDB.getState().acknowledge(personId, 'notice', notice.id, reply.trim())
    toast.success('Reply sent', { description: `${sender?.name ?? 'Your manager'} can see it now.` })
    setReply(''); setBusy(false)
  }
  const acknowledge = () => {
    useDB.getState().acknowledge(personId, 'notice', notice.id)
    toast.success('Notice acknowledged', { description: notice.title })
  }
  return (
    <article className="px-4 py-4 sm:px-5" aria-labelledby={`${uid}-t`}>
      <div className="flex items-start gap-3">
        <span className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', pr?.tone === 'danger' ? 'bg-danger/10 text-danger' : pr ? 'bg-amber/10 text-amber' : 'bg-forest-50 text-forest-700')}><Megaphone size={15} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={`${uid}-t`} className="text-sm font-semibold text-ink">{notice.title}</h3>
            {pr && <Badge tone={pr.tone}>{pr.label}</Badge>}
            {notice.replyNeeded && !ack?.repliedAt && <Badge tone="gold">Reply needed</Badge>}
            {ack?.repliedAt ? <Badge tone="success">Replied</Badge> : acked ? <Badge tone="success">Acknowledged</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-ink-2">{notice.body}</p>
          <p className="mt-1.5 text-xs text-muted">{sender?.name ?? 'Hotel management'} · {notice.sentAt ? `${fDateTime(notice.sentAt)} · ${relTime(notice.sentAt)}` : 'Draft'}</p>
          {ack?.reply && (
            <div className="mt-3 rounded-cell border border-line bg-surface-2 px-3 py-2 text-sm">
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">Your reply · {ack.repliedAt && fDateTime(ack.repliedAt)}</div>
              <p className="mt-0.5 text-ink">{ack.reply}</p>
            </div>
          )}
          {!acked && !ack?.repliedAt && (
            notice.replyNeeded ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label htmlFor={`${uid}-r`} className="sr-only">Reply to {notice.title}</label>
                <Input id={`${uid}-r`} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a short reply" className="h-11 sm:h-9"
                  onKeyDown={(e) => { if (e.key === 'Enter' && reply.trim()) send() }} />
                <Button variant="primary" icon={Send} disabled={!reply.trim()} loading={busy} onClick={send} className="max-sm:h-11">Send reply</Button>
              </div>
            ) : (
              <Button variant="secondary" className="mt-3 max-sm:h-11 max-sm:w-full" onClick={acknowledge}>Acknowledge</Button>
            )
          )}
          {!compact && <p className="mt-2 text-2xs text-muted">Opening or replying is never task acceptance.</p>}
        </div>
      </div>
    </article>
  )
}

/**
 * SopSteps with its "Start the room to tick steps" hint (and, for the reader, the done-counter)
 * hidden — the shared component has no prop for either.
 */
export function StepList({ steps, version, reader, hideLockHint, ...rest }: {
  steps: SopStep[]; version: string; reader?: boolean; hideLockHint?: boolean
  done?: string[]; photos?: string[]; interactive?: boolean; mode?: 'guided' | 'standard'; onToggle?: (id: string) => void; onPhoto?: (id: string) => void; title?: string
}) {
  return (
    <div className={clsx(hideLockHint && !reader && '[&>section>p]:hidden')}>
      <SopSteps steps={steps} version={version} interactive={!!rest.interactive} readOnly={reader} {...rest} />
    </div>
  )
}

/** Compact labelled meter (the shared ProgressBar always prints its label above the bar). */
export function Meter({ value, max, label, valueText, tone = 'brand' }: { value: number; max: number; label: string; valueText?: string; tone?: 'brand' | 'success' | 'warning' | 'gold' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-ink/[0.07]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={valueText}>
      <div className={clsx('h-full rounded-pill transition-[width] duration-700 ease-out', { brand: 'bg-forest-700', success: 'bg-ok', warning: 'bg-amber', gold: 'bg-gold-500' }[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Section heading used inside long phone screens (lighter than a card header). */
export function GroupLabel({ children, count, action }: { children: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 px-1">
      <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted">{children}{count != null && <span className="ml-1.5 tabular text-ink-2">{count}</span>}</h2>
      {action}
    </div>
  )
}
