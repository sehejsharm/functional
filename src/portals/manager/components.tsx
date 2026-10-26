// Presentational building blocks shared across the Manager portal screens.
import clsx from 'clsx'
import { AlertTriangle, Check, CheckCircle2, Crown, Info, Lock, ShieldCheck, X, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Badge, Segmented, Tooltip } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { fTime } from '@/lib/time'
import type { IssueSeverity, IssueStatus, Occupancy, Person, Priority, Room, Shift, SopVersion, Task } from '@/lib/types'
import { ISSUE_STATUS, OCCUPANCY, OCCUPANCY_ORDER, PRIORITY, SEVERITY, taskState } from './model'

export function TaskStatusBadge({ task, now }: { task: Task; now?: number }) {
  const s = taskState(task, now)
  return <Badge tone={s.tone} dot>{s.label}</Badge>
}

export function PriorityBadge({ priority, hideStandard }: { priority: Priority; hideStandard?: boolean }) {
  if (hideStandard && priority === 'standard') return <span className="text-xs text-muted">Standard</span>
  const p = PRIORITY[priority]
  return <Badge tone={p.tone}>{priority === 'urgent' && <AlertTriangle size={11} aria-hidden />}{p.label}</Badge>
}

export const SeverityBadge = ({ severity }: { severity: IssueSeverity }) => <Badge tone={SEVERITY[severity].tone} dot>{SEVERITY[severity].label}</Badge>
export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => <Badge tone={ISSUE_STATUS[status].tone}>{ISSUE_STATUS[status].label}</Badge>

export function OccupancyChip({ occ }: { occ?: Occupancy }) {
  if (!occ) return <span className="text-xs text-muted">—</span>
  const o = OCCUPANCY[occ]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2">
      <span className={clsx('h-2 w-2 rounded-sm', o.dot)} aria-hidden />{o.label}
    </span>
  )
}

export function OccupancyLegend({ className, counts }: { className?: string; counts?: Partial<Record<Occupancy, number>> }) {
  return (
    <ul className={clsx('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2', className)} aria-label="Occupancy legend">
      {OCCUPANCY_ORDER.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={clsx('grid h-4 min-w-7 place-items-center rounded border px-1 text-[9px] font-bold text-ink-2', OCCUPANCY[k].tile)}>{OCCUPANCY[k].short}</span>
          {OCCUPANCY[k].label}{counts && <span className="tabular text-muted">{counts[k] ?? 0}</span>}
        </li>
      ))}
      <li className="flex items-center gap-1.5"><Crown size={13} className="text-gold-700" aria-hidden /> VIP</li>
    </ul>
  )
}

export function PersonCell({ person, sub, size = 28, to }: { person?: Person | null; sub?: ReactNode; size?: number; to?: string }) {
  if (!person) return <span className="text-sm text-muted">Unassigned</span>
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={person.name} size={size} />
      <span className="min-w-0">
        <span className={clsx('block truncate text-sm font-medium text-ink', to && 'group-hover/pc:underline')}>{person.name}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </span>
  )
  return to ? <Link to={to} className="group/pc" onClick={(e) => e.stopPropagation()}>{body}</Link> : body
}

/** Compact labelled select for table toolbars. */
export function FilterSelect({ label, value, onChange, children, className }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('relative', className)}>
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        className={clsx('input h-9 w-auto max-w-[200px] cursor-pointer py-1.5 text-sm', value && 'border-forest-600/60 bg-forest-50/60 font-medium')}>
        {children}
      </select>
    </label>
  )
}

export function FilterChip({ label, onClear }: { label: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-forest-700/25 bg-forest-50 pl-3 pr-1.5 text-xs font-medium text-forest-800">
      {label}
      <button type="button" onClick={onClear} aria-label="Remove filter" className="grid h-5 w-5 place-items-center rounded-full hover:bg-forest-100"><X size={12} /></button>
    </span>
  )
}

export function ShiftSwitcher({ shifts, value, onChange, liveId, size = 'md' }: { shifts: Shift[]; value: string; onChange: (id: string) => void; liveId?: string; size?: 'sm' | 'md' }) {
  return (
    <Segmented size={size} value={value} onChange={onChange} items={shifts.map((s) => ({
      id: s.id,
      label: <span className="flex items-center gap-1.5">{s.id === liveId && <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-label="Live" />}{s.name}<span className="hidden text-muted sm:inline">{fTime(s.start).replace(':00', '')}</span></span>,
    }))} />
  )
}

/** Read-only step list with done ticks. Standard mode marks which steps are milestones. */
export function StepProgress({ version, task }: { version: SopVersion; task?: Task }) {
  const done = task?.doneStepIds ?? []
  const standard = task?.mode === 'standard'
  const milestone = (i: number) => version.steps[i].requireCheck || i === version.steps.length - 1
  const relevant = version.steps.filter((_, i) => !standard || milestone(i))
  const n = relevant.filter((s) => done.includes(s.id)).length
  return (
    <div className="card-inset overflow-hidden">
      {task && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-xs">
          <span className="font-medium text-ink-2">{n} of {relevant.length} {standard ? 'milestones' : 'steps'} ticked</span>
          <span className="text-muted">{standard ? 'Standard mode' : 'Guided mode'}</span>
        </div>
      )}
      <ol className="divide-y divide-line">
        {version.steps.map((s, i) => {
          const ok = done.includes(s.id)
          const skip = standard && !milestone(i)
          return (
            <li key={s.id} className={clsx('flex gap-3 px-4 py-3', skip && 'opacity-55')}>
              <span className={clsx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold',
                ok ? 'border-forest-700 bg-forest-700 text-white' : 'border-line-strong bg-surface text-muted')} aria-label={ok ? 'Done' : 'Not done'}>
                {ok ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={clsx('text-sm leading-snug', ok ? 'text-ink-2' : 'text-ink')}>{s.instruction}</p>
                {s.guestCare && <p className="mt-1 text-xs text-muted"><span className="font-semibold text-gold-700">Guest care · </span>{s.guestCare}</p>}
                {(s.requireCheck || s.allowPhoto || skip) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.requireCheck && <Badge tone="info"><ShieldCheck size={11} aria-hidden /> Independent check</Badge>}
                    {s.allowPhoto && <Badge tone={task?.photoStepIds.includes(s.id) ? 'success' : 'neutral'}>{task?.photoStepIds.includes(s.id) ? 'Photo attached' : 'Photo optional'}</Badge>}
                    {skip && <Badge>Skipped in Standard mode</Badge>}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const CALLOUT = {
  info: ['border-info/25 bg-info/[0.06]', 'text-info', Info],
  warning: ['border-amber/30 bg-amber/[0.07]', 'text-amber', AlertTriangle],
  danger: ['border-danger/25 bg-danger/[0.05]', 'text-danger', XCircle],
  success: ['border-ok/25 bg-ok/[0.06]', 'text-ok', CheckCircle2],
  neutral: ['border-line bg-surface-2', 'text-muted', Lock],
} as const
export function Callout({ tone = 'info', title, children, icon, action, className }: { tone?: keyof typeof CALLOUT; title?: ReactNode; children?: ReactNode; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  const [box, fg, Def] = CALLOUT[tone]
  const I = icon ?? Def
  return (
    <div className={clsx('flex items-start gap-3 rounded-cell border px-3.5 py-3 text-sm', box, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <I size={16} className={clsx('mt-0.5 shrink-0', fg)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold text-ink">{title}</div>}
        {children && <div className={clsx('text-ink-2', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Small room square used on the Overview mini board. */
export function MiniRoom({ room, task, onClick, now }: { room: Room; task?: Task; onClick?: () => void; now: number }) {
  const o = OCCUPANCY[room.occupancy ?? 'vacant_clean']
  const st = task ? taskState(task, now) : null
  const mark = !st ? null : st.key === 'done' ? 'bg-ok' : st.key === 'awaiting_verification' ? 'bg-amber' : st.key === 'overdue' || st.key === 'returned' ? 'bg-danger' : st.key === 'in_progress' ? 'bg-info' : st.key === 'cancelled' ? 'bg-muted' : 'bg-ink-2/40'
  const label = `Room ${room.number}, ${o.label}${room.vip ? ', VIP' : ''}${st ? `, ${st.label}` : ', no work today'}`
  return (
    <Tooltip label={<span>Room {room.number} · {o.label}{room.vip ? ' · VIP' : ''}<br />{st ? st.label : 'No work today'}</span>}>
      <button type="button" onClick={onClick} aria-label={label}
        className={clsx('relative grid h-9 w-full place-items-center rounded-md border text-[11px] font-semibold tabular text-ink transition hover:-translate-y-px hover:shadow-pop', o.tile)}>
        {room.number}
        {room.vip && <Crown size={9} className="absolute left-0.5 top-0.5 text-gold-700" aria-hidden />}
        {mark && <span className={clsx('absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-2 ring-surface', mark, st?.key === 'in_progress' && 'animate-pulse')} aria-hidden />}
      </button>
    </Tooltip>
  )
}

export function TaskMarkLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Task status legend">
      {[['bg-info', 'In progress'], ['bg-amber', 'Awaiting verification'], ['bg-danger', 'Overdue or sent back'], ['bg-ok', 'Done'], ['bg-ink-2/40', 'Scheduled']].map(([c, l]) => (
        <li key={l} className="flex items-center gap-1.5"><span className={clsx('h-2 w-2 rounded-full', c)} aria-hidden />{l}</li>
      ))}
    </ul>
  )
}

/** One URL search param as state (filters and drawers survive reloads and can be linked to). */
export function useQueryParam(key: string): [string, (v: string | null) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? ''
  const set = (v: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(key, v); else n.delete(key); return n }, { replace: true })
  return [value, set]
}

/** Look-up helpers bound to the live store. */
export function useLookups() {
  const people = useDB((s) => s.people)
  const rooms = useDB((s) => s.rooms)
  const sopVersions = useDB((s) => s.sopVersions)
  const jobRoles = useDB((s) => s.jobRoles)
  return {
    person: (id?: string | null) => byId(people, id),
    name: (id?: string | null) => byId(people, id)?.name ?? '—',
    room: (id?: string | null) => byId(rooms, id),
    version: (id?: string | null) => byId(sopVersions, id),
    role: (id?: string | null) => byId(jobRoles, id),
  }
}
