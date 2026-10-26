// Pure helpers for the Employee portal: task phases, labels and small formatters.
// Kept free of React so every screen derives status the same way.
import type { Tone } from '@/components/ui'
import type { AuditEntry, IssueCategory, IssueSeverity, IssueStatus, Occupancy, Person, Priority, Sop, SopVersion, Task } from '@/lib/types'
import { HOTEL_TZ, HOUR, MIN } from '@/lib/time'

/** A scheduled room whose time slot has not started yet: "Do not enter yet". */
export const isGated = (t: Task, now: number) => t.status === 'scheduled' && now < Date.parse(t.start)
/** Scheduled but more than an hour past its slot: the employee must not go in without the supervisor. */
export const isBlocked = (t: Task, now: number) => t.status === 'scheduled' && now > Date.parse(t.end) + HOUR

export type TaskPhase = 'gated' | 'ready' | 'overdue' | 'blocked' | 'in_progress' | 'returned' | 'awaiting' | 'done' | 'cancelled'

export function taskPhase(t: Task, now: number): TaskPhase {
  switch (t.status) {
    case 'cancelled': return 'cancelled'
    case 'done': return 'done'
    case 'awaiting_verification': return 'awaiting'
    case 'in_progress': return t.returned ? 'returned' : 'in_progress'
    default:
      if (isGated(t, now)) return 'gated'
      if (isBlocked(t, now)) return 'blocked'
      if (now > Date.parse(t.end)) return 'overdue'
      return 'ready'
  }
}

export const PHASE: Record<TaskPhase, { label: string; tone: Tone }> = {
  gated: { label: 'Not open yet', tone: 'neutral' },
  ready: { label: 'Ready', tone: 'brand' },
  overdue: { label: 'Overdue', tone: 'danger' },
  blocked: { label: 'See supervisor', tone: 'danger' },
  in_progress: { label: 'In progress', tone: 'info' },
  returned: { label: 'Sent back', tone: 'warning' },
  awaiting: { label: 'Awaiting check', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const PRIORITY: Record<Priority, { label: string; tone: Tone; rank: number }> = {
  urgent: { label: 'Urgent', tone: 'danger', rank: 0 },
  high: { label: 'High priority', tone: 'warning', rank: 1 },
  standard: { label: 'Standard', tone: 'neutral', rank: 2 },
}

export const OCCUPANCY: Record<Occupancy, { label: string; tone: Tone }> = {
  occupied: { label: 'Occupied', tone: 'info' },
  due_out: { label: 'Due out', tone: 'warning' },
  arrival: { label: 'Arrival', tone: 'brand' },
  vacant_dirty: { label: 'Vacant dirty', tone: 'neutral' },
  vacant_clean: { label: 'Vacant clean', tone: 'success' },
  out_of_order: { label: 'Out of order', tone: 'danger' },
}

export const CATEGORY: Record<IssueCategory, { label: string; quick: string[] }> = {
  guest: { label: 'Guest', quick: ['Guest in room, asked to come back later', 'Do-not-disturb sign on the door', 'Guest request for the front desk'] },
  maintenance: { label: 'Maintenance', quick: ['Leak in the bathroom', 'Light or socket not working', 'Air-con not cooling'] },
  supplies: { label: 'Supplies', quick: ['Out of bath amenities', 'Not enough clean linen', 'Trolley missing chemicals'] },
  safety: { label: 'Safety', quick: ['Wet floor', 'Broken glass', 'Damaged furniture or fitting'] },
  lost_found: { label: 'Lost & found', quick: ['Item left behind by a guest', 'Valuables found in the safe'] },
  other: { label: 'Other', quick: [] },
}

export const SEVERITY: Record<IssueSeverity, { label: string; tone: Tone; hint: string }> = {
  low: { label: 'Low', tone: 'neutral', hint: 'Can wait until the end of the shift.' },
  medium: { label: 'Medium', tone: 'info', hint: 'Needs a look today.' },
  high: { label: 'High', tone: 'warning', hint: 'Blocks the room or a guest is affected.' },
  critical: { label: 'Critical', tone: 'danger', hint: 'Someone could get hurt. Tell your supervisor in person too.' },
}

export const ISSUE_STATUS: Record<IssueStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'warning' },
  in_progress: { label: 'In progress', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
}

/** The steps that must be ticked before the room can be finished (all in Guided, milestones in Standard). */
export const requiredSteps = (t: Task, v: SopVersion) => (t.mode === 'standard' ? v.steps.filter((s, i) => s.requireCheck || i === v.steps.length - 1) : v.steps)
/** Only SOPs with recorded checks need an independent verifier; the rest finish straight away. */
export const needsVerification = (v: SopVersion) => v.steps.some((s) => s.requireCheck)

/** What to put in front of the employee next: a sent-back room, then the room in hand, then the most urgent open slot. */
export function pickNext(tasks: Task[], now: number): Task | undefined {
  const rank = (t: Task) => {
    if (t.status === 'in_progress') return t.returned ? 0 : 1
    if (t.status === 'scheduled' || t.status === 'ready') return isGated(t, now) ? 4 : isBlocked(t, now) ? 3 : 2
    return 9
  }
  return tasks.filter((t) => rank(t) < 9).sort((a, b) =>
    rank(a) - rank(b) || (rank(a) === 2 ? PRIORITY[a.priority].rank - PRIORITY[b.priority].rank : 0) || a.start.localeCompare(b.start))[0]
}

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: HOTEL_TZ, hour: 'numeric', hour12: false })
export function greeting(now: number) {
  const h = Number(hourFmt.format(now)) % 24
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const longDate = new Intl.DateTimeFormat('en-GB', { timeZone: HOTEL_TZ, day: 'numeric', month: 'short', year: 'numeric' })
/** "28 Oct 2024" in hotel time. */
export const fDateYear = (v: string | number) => longDate.format(typeof v === 'string' ? Date.parse(v) : v)

/** "2h 05m", "45m" */
export function fDuration(ms: number) {
  const m = Math.max(0, Math.round(ms / MIN))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** "12:04" running clock for an in-progress room. */
export function fClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export const firstName = (p?: Person) => p?.name.split(' ')[0] ?? ''

/** Tenure like "2 yrs 4 mos" from a hire date. */
export function tenure(fromIso: string, now = Date.now()) {
  const months = Math.max(0, Math.floor((now - Date.parse(fromIso)) / (30.44 * 24 * HOUR)))
  const y = Math.floor(months / 12), m = months % 12
  if (!y) return `${m} mo${m === 1 ? '' : 's'}`
  return `${y} yr${y === 1 ? '' : 's'}${m ? ` ${m} mo${m === 1 ? '' : 's'}` : ''}`
}

/** Published, non-retired SOPs with their current version: what an employee may read and be assigned. */
export function readableSops(sops: Sop[], versions: SopVersion[]) {
  return sops.flatMap((sop) => {
    const v = versions.find((x) => x.id === sop.currentVersionId)
    return !sop.retiredAt && v?.status === 'published' ? [{ sop, v }] : []
  })
}

/** Human labels for the audit actions that touch a single room task. */
export function activityLabel(e: AuditEntry, name: (id?: string) => string): { title: string; body?: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' } {
  const after = e.detail.includes(': ') ? e.detail.slice(e.detail.indexOf(': ') + 2) : undefined
  switch (e.action) {
    case 'task.started': return { title: `${name(e.actorId)} started the room`, tone: 'info' }
    case 'task.verification_requested': return { title: `${name(e.actorId)} requested an independent check`, tone: 'warning' }
    case 'task.completed': return { title: `${name(e.actorId)} finished the room`, tone: 'success' }
    case 'task.verified': return { title: `Verified by ${name(e.actorId)}`, tone: 'success' }
    case 'task.returned': return { title: `Sent back by ${name(e.actorId)}`, body: after, tone: 'warning' }
    case 'task.cancelled': return { title: `Cancelled by ${name(e.actorId)}`, body: after, tone: 'neutral' }
    case 'task.reassigned': return { title: `Reassigned by ${name(e.actorId)}`, tone: 'neutral' }
    case 'issue.reported': return { title: `${name(e.actorId)} reported an issue`, body: e.detail.split(' · ')[0], tone: 'danger' }
    default: return { title: `${name(e.actorId)} · ${e.action.replace('.', ' ').replace(/_/g, ' ')}`, tone: 'neutral' }
  }
}
