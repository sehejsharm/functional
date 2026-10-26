// Pure, read-only helpers for the Manager portal: labels, derived task state and audit wording.
// Mutations live in actions.ts; presentational pieces in components.tsx.
import type { Tone } from '@/components/ui'
import type { DB } from '@/lib/db'
import type { AuditEntry, CoverKind, IssueCategory, IssueSeverity, IssueStatus, Occupancy, Person, Priority, Shift, SopVersion, Task, TaskStatus } from '@/lib/types'
import { fTime, hotelDateKey, MIN } from '@/lib/time'

export const DAY = 86_400_000

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  ready: { label: 'Ready', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  awaiting_verification: { label: 'Awaiting check', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const PRIORITY: Record<Priority, { label: string; tone: Tone; rank: number }> = {
  standard: { label: 'Standard', tone: 'neutral', rank: 0 },
  high: { label: 'High', tone: 'warning', rank: 1 },
  urgent: { label: 'Urgent', tone: 'danger', rank: 2 },
}

export const OCCUPANCY: Record<Occupancy, { label: string; short: string; tile: string; dot: string }> = {
  vacant_clean: { label: 'Vacant clean', short: 'VC', tile: 'border-ok/30 bg-ok/[0.07]', dot: 'bg-ok' },
  vacant_dirty: { label: 'Vacant dirty', short: 'VD', tile: 'border-amber/35 bg-amber/[0.08]', dot: 'bg-amber' },
  occupied: { label: 'Occupied', short: 'OC', tile: 'border-info/30 bg-info/[0.07]', dot: 'bg-info' },
  due_out: { label: 'Due out', short: 'DO', tile: 'border-gold-500/50 bg-gold-50', dot: 'bg-gold-500' },
  arrival: { label: 'Arrival', short: 'AR', tile: 'border-forest-700/30 bg-forest-50', dot: 'bg-forest-700' },
  out_of_order: { label: 'Out of order', short: 'OOO', tile: 'border-danger/30 bg-danger/[0.06] bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgb(var(--danger)/0.06)_5px,rgb(var(--danger)/0.06)_10px)]', dot: 'bg-danger' },
}
export const OCCUPANCY_ORDER: Occupancy[] = ['vacant_dirty', 'due_out', 'arrival', 'occupied', 'vacant_clean', 'out_of_order']

export const SEVERITY: Record<IssueSeverity, { label: string; tone: Tone; rank: number }> = {
  low: { label: 'Low', tone: 'neutral', rank: 0 },
  medium: { label: 'Medium', tone: 'info', rank: 1 },
  high: { label: 'High', tone: 'warning', rank: 2 },
  critical: { label: 'Critical', tone: 'danger', rank: 3 },
}
export const ISSUE_STATUS: Record<IssueStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'danger' },
  in_progress: { label: 'In progress', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
}
export const CATEGORY: Record<IssueCategory, string> = {
  guest: 'Guest request', maintenance: 'Maintenance', supplies: 'Supplies', safety: 'Safety', lost_found: 'Lost & found', other: 'Other',
}
export const COVER_KIND: Record<CoverKind, { label: string; tone: Tone }> = {
  time_off: { label: 'Time off', tone: 'brand' },
  backup: { label: 'Backup cover', tone: 'info' },
  arrival: { label: 'Late arrival', tone: 'warning' },
  early_departure: { label: 'Early departure', tone: 'warning' },
  early_close: { label: 'Early close', tone: 'danger' },
  ended: { label: 'Shift ended', tone: 'neutral' },
}

export const isToday = (iso: string, now = Date.now()) => hotelDateKey(iso) === hotelDateKey(now)
export const isOpen = (t: Task) => t.status !== 'done' && t.status !== 'cancelled'
/** Scheduled or in progress past its finish time (awaiting verification is not "overdue": the work is done). */
export const isOverdue = (t: Task, now = Date.now()) => (t.status === 'scheduled' || t.status === 'in_progress') && Date.parse(t.end) < now

export type TaskStateKey = TaskStatus | 'overdue' | 'returned'
export function taskState(t: Task, now = Date.now()): { key: TaskStateKey; label: string; tone: Tone } {
  if (t.status === 'in_progress' && t.returned) return { key: 'returned', label: 'Sent back', tone: 'danger' }
  if (isOverdue(t, now)) return { key: 'overdue', label: t.status === 'scheduled' ? 'Late start' : 'Overdue', tone: 'danger' }
  return { key: t.status, ...TASK_STATUS[t.status] }
}

/** Minutes worked against the SOP target. `null` elapsed means the room hasn't started. */
export function taskTiming(t: Task, v: SopVersion | undefined, now = Date.now()) {
  const target = v?.timeTargetMin ?? Math.round((Date.parse(t.end) - Date.parse(t.start)) / MIN)
  if (!t.startedAt) return { elapsed: null as number | null, target, over: false }
  const end = t.completedAt ? Date.parse(t.completedAt) : t.status === 'cancelled' && t.cancelled ? Date.parse(t.cancelled.at) : now
  const elapsed = Math.max(0, Math.round((end - Date.parse(t.startedAt)) / MIN))
  return { elapsed, target, over: elapsed > target }
}

/** "2:10 – 2:37 PM" (or "11:40 AM – 12:07 PM" across noon). */
export function fWindow(t: { start: string; end: string }) {
  const a = fTime(t.start).replace(/^0/, ''), b = fTime(t.end).replace(/^0/, '')
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
}
export const fMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`)
export function fAge(iso: string, now = Date.now()) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / MIN))
  if (m < 60) return `${m}m`
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

export const liveShiftAt = (now: number, shifts: Shift[]) => shifts.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end))
export const shiftOf = (personId: string, shifts: Shift[]) => shifts.find((s) => s.memberIds.includes(personId))
export const firstName = (p?: Person | null) => p?.name.split(' ')[0] ?? 'Someone'

/** Approved time off for a person on a hotel date. */
export const offOn = (db: Pick<DB, 'cover'>, personId: string, date: string) =>
  db.cover.some((c) => c.kind === 'time_off' && c.status === 'approved' && c.personId === personId && c.date === date)

/** Published SOP versions that govern a job role (the ledger's "should have read" set). */
export const versionsForRole = (db: Pick<DB, 'sops' | 'sopVersions'>, roleId: string) =>
  db.sops.filter((s) => !s.retiredAt && s.currentVersionId).map((s) => db.sopVersions.find((v) => v.id === s.currentVersionId)!)
    .filter((v) => v && v.status === 'published' && v.jobRoleId === roleId)

export function ackCompliance(db: Pick<DB, 'sops' | 'sopVersions' | 'ackEvents'>, person: Person) {
  const vs = versionsForRole(db, person.jobRoleId)
  const acked = vs.filter((v) => db.ackEvents.some((a) => a.personId === person.id && a.kind === 'sop' && a.refId === v.id && a.acknowledgedAt)).length
  return { total: vs.length, acked, pct: vs.length ? pct(acked, vs.length) : null }
}

/** First-time verification pass rate: checked rooms that were never sent back. */
export function verifyPass(tasks: Task[], audit: AuditEntry[]) {
  const returned = new Set(audit.filter((a) => a.action === 'task.returned').map((a) => a.detail.split(':')[0]))
  const checked = tasks.filter((t) => t.verifiedById || returned.has(t.id) || t.returned)
  const passed = checked.filter((t) => t.verifiedById && !returned.has(t.id) && !t.returned).length
  return { checked: checked.length, passed, pct: checked.length ? pct(passed, checked.length) : null }
}

/** "12 Oct" from a hotel date key. */
export const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Plain-language line for an audit entry ("verified room 305"). */
export function describeAudit(a: AuditEntry, db: Pick<DB, 'tasks' | 'rooms' | 'people' | 'issues' | 'sopVersions' | 'notices' | 'shifts'>): { text: string; tone: Tone; to?: string } {
  const room = (taskId: string) => { const t = db.tasks.find((x) => x.id === taskId); return t ? db.rooms.find((r) => r.id === t.roomId)?.number : undefined }
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? id
  const [head, ...rest] = a.detail.split(': ')
  const note = rest.join(': ')
  const roomText = (id: string) => { const n = room(id); return n ? `room ${n}` : 'a room' }
  const tl = (id: string) => `/manager/tasks?task=${id}`
  const ver = (d: string) => { const v = db.sopVersions.find((x) => x.id === d); return v ? `${v.code} v${v.version}` : d }
  switch (a.action) {
    case 'task.verified': return { text: `verified ${roomText(a.detail)}`, tone: 'success', to: tl(a.detail) }
    case 'task.completed': return { text: `finished ${roomText(a.detail)}`, tone: 'success', to: tl(a.detail) }
    case 'task.started': return { text: `started ${roomText(a.detail)}`, tone: 'info', to: tl(a.detail) }
    case 'task.verification_requested': return { text: `asked for verification on ${roomText(a.detail)}`, tone: 'warning', to: tl(a.detail) }
    case 'task.returned': return { text: `sent ${roomText(head)} back${note ? ` — “${note}”` : ''}`, tone: 'danger', to: tl(head) }
    case 'task.cancelled': return { text: `cancelled ${roomText(head)}${note ? ` — ${note}` : ''}`, tone: 'neutral', to: tl(head) }
    case 'task.priority_changed': return { text: `set ${roomText(head)} to ${note || 'a new'} priority`, tone: 'warning', to: tl(head) }
    case 'task.mode_changed': return { text: `switched ${a.detail}`, tone: 'info' }
    case 'task.reassigned': { const [id, to] = a.detail.split(' → '); return { text: `moved ${roomText(id)} to ${name(to)}`, tone: 'info', to: tl(id) } }
    case 'task.assigned': {
      const [rid, rest2] = a.detail.split(' → '); const pid = rest2?.split(' ')[0]
      const r = db.rooms.find((x) => x.id === rid)?.number
      return { text: `assigned room ${r ?? rid} to ${name(pid ?? '')}`, tone: 'brand', to: `/manager/tasks?room=${rid}` }
    }
    case 'issue.reported': return { text: `reported “${a.detail.split(' · ')[0]}”`, tone: 'danger', to: '/manager/incidents' }
    case 'issue.resolved': case 'issue.in_progress': case 'issue.open': case 'issue.updated': {
      const i = db.issues.find((x) => x.id === a.detail)
      const verb = a.action === 'issue.resolved' ? 'resolved' : a.action === 'issue.in_progress' ? 'started work on' : a.action === 'issue.open' ? 'reopened' : 'updated'
      return { text: `${verb} incident “${i?.title ?? a.detail}”`, tone: a.action === 'issue.resolved' ? 'success' : 'info', to: `/manager/incidents?id=${a.detail}` }
    }
    case 'attendance.checkin': return { text: 'checked in for the shift', tone: 'success' }
    case 'shift.went_early': return { text: 'went home early', tone: 'warning', to: '/manager/shift-cover' }
    case 'shift.ended': return { text: 'ended their shift', tone: 'neutral' }
    case 'sop.acknowledged': { const v = db.sopVersions.find((x) => x.id === a.detail); return { text: `acknowledged ${v ? `${v.code} v${v.version}` : 'an SOP'}`, tone: 'success' } }
    case 'notice.acknowledged': { const n = db.notices.find((x) => x.id === a.detail); return { text: `confirmed notice “${n?.title ?? 'a notice'}”`, tone: 'success', to: '/manager/notices' } }
    case 'notice.sent': return { text: `sent notice “${a.detail.split(' → ')[0]}”`, tone: 'brand', to: '/manager/notices' }
    case 'cover.backup_approved': return { text: `approved backup cover — ${a.detail.replace(/\b([a-z]+)\b covers \b([a-z]+)\b/, (_m, b, p) => `${name(b)} covers ${name(p)}`)}`, tone: 'success', to: '/manager/shift-cover' }
    case 'cover.approved': case 'cover.declined': return { text: `${a.action === 'cover.approved' ? 'approved' : 'declined'} ${a.detail}`, tone: a.action === 'cover.approved' ? 'success' : 'neutral', to: '/manager/shift-cover' }
    case 'join.approved': case 'join.declined': return { text: `${a.action === 'join.approved' ? 'approved' : 'declined'} the join request from ${a.detail}`, tone: a.action === 'join.approved' ? 'success' : 'neutral', to: '/manager/join-requests' }
    case 'ack.reminder_sent': return { text: `sent an acknowledgment reminder — ${a.detail}`, tone: 'info', to: '/manager/acknowledgments' }
    case 'sop.change_requested': return { text: `requested a change to ${a.detail}`, tone: 'info', to: '/manager/sops' }
    case 'sop.submitted': return { text: `sent ${a.detail.replace(' sent for review', '')} for review`, tone: 'info' }
    case 'sop.released': return { text: `released ${a.detail}`, tone: 'brand' }
    case 'sop.retired': return { text: `retired ${a.detail}`, tone: 'neutral' }
    case 'sop.restored': return { text: `restored ${a.detail}`, tone: 'neutral' }
    case 'sop.review.approve': return { text: `approved ${ver(a.detail)}`, tone: 'success' }
    case 'sop.review.request_changes': return { text: `requested changes on ${ver(a.detail)}`, tone: 'warning' }
    case 'sop.review.reject': return { text: `rejected ${ver(a.detail)}`, tone: 'danger' }
    default: return { text: `${a.action.replace(/[._]/g, ' ')}${a.detail ? ` · ${a.detail}` : ''}`, tone: 'neutral' }
  }
}
