// The single source of truth for every write in Mise. The Cloudflare Durable Object runs these
// functions authoritatively; the browser runs the same ones optimistically so the UI moves instantly
// (and, in demo mode, runs them against a hotel kept in this browser).
import type {
  AckEvent, AttendanceMark, Attendance, AuditEntry, CoverItem, CoverKind, Feedback, FeedbackLane, Issue, IssueCategory, IssueSeverity, IssueStatus,
  JobRole, JoinRequest, Notice, Occupancy, Person, Portal, Priority, Property, ReviewDecision, Room, Shift, Sop, SopStep, SopVersion, Task, Tier,
} from './types'
import { hotelDateKey, isLive, setHotelTimeZone } from './time'

export interface State {
  property: Property
  jobRoles: JobRole[]; people: Person[]; sops: Sop[]; sopVersions: SopVersion[]; shifts: Shift[]; rooms: Room[]; tasks: Task[]
  ackEvents: AckEvent[]; notices: Notice[]; attendance: Attendance[]; cover: CoverItem[]; feedback: Feedback[]
  joinRequests: JoinRequest[]; issues: Issue[]; audit: AuditEntry[]
}
export type Collection = Exclude<keyof State, 'property'>
export const COLLECTIONS: Collection[] = ['jobRoles', 'people', 'sops', 'sopVersions', 'shifts', 'rooms', 'tasks', 'ackEvents', 'notices',
  'attendance', 'cover', 'feedback', 'joinRequests', 'issues', 'audit']

export interface Actor { personId: string; grants: { portal: Portal; tier: Tier }[] }

export const APPROVALS_REQUIRED = 2
export const MAX_STEPS = 30
export const MAX_TAGS = 20

const RANK: Record<Tier, number> = { base: 0, senior: 1, admin: 2 }
export const hasPortal = (a: Actor, p: Portal, need: Tier = 'base') => a.grants.some((g) => g.portal === p && RANK[g.tier] >= RANK[need])
export const isAdmin = (a: Actor) => a.grants.some((g) => g.tier === 'admin')

const CATEGORIES: IssueCategory[] = ['guest', 'maintenance', 'supplies', 'safety', 'lost_found', 'other']
const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical']
const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved']
const PRIORITIES: Priority[] = ['standard', 'high', 'urgent']
const OCCUPANCIES: Occupancy[] = ['vacant_clean', 'vacant_dirty', 'occupied', 'due_out', 'arrival', 'out_of_order']
/** Audit lines a client may add on its own (the actor is always the signed-in person). */
const LOG_EVENT = /^(sop|feedback|task|ack|cover|join|notice|issue)\.[a-z_]{2,40}$/

/** A task that still needs doing (or verifying). */
export const isOpenTask = (t: Pick<Task, 'status'>) => t.status !== 'done' && t.status !== 'cancelled'

type StepIn = SopStep
export type Action =
  | { type: 'startTask'; taskId: string }
  | { type: 'toggleStep'; taskId: string; stepId: string }
  | { type: 'attachPhoto'; taskId: string; stepId: string; key: string }
  | { type: 'requestVerification'; taskId: string }
  | { type: 'verifyTask'; taskId: string }
  | { type: 'returnTask'; taskId: string; note: string }
  | { type: 'cancelTask'; taskId: string; reason: string }
  | { type: 'reassignTask'; taskId: string; personId: string }
  | { type: 'setTaskPriority'; taskId: string; priority: Priority }
  | { type: 'endUrgent'; taskId: string; reason: string }
  | { type: 'markUrgentSeen'; taskId: string }
  | { type: 'reportIssue'; id: string; taskId?: string | null; text: string; title?: string; category?: IssueCategory; severity?: IssueSeverity; roomId?: string }
  | { type: 'updateIssue'; issueId: string; status?: IssueStatus; assignedToId?: string | null; note?: string; severity?: IssueSeverity }
  | { type: 'resolveIssue'; issueId: string }
  | { type: 'checkIn'; id: string; mark?: AttendanceMark }
  | { type: 'endShift'; id: string; early: boolean }
  | { type: 'requestTimeOff'; id: string; shiftId: string; date: string; note: string }
  | { type: 'openRef'; id: string; kind: 'sop' | 'notice'; refId: string }
  | { type: 'acknowledge'; id: string; kind: 'sop' | 'notice'; refId: string; reply?: string }
  | { type: 'assignTask'; id: string; shiftId: string; personId: string; roomId: string; start: string; end: string; priority: Priority; sopId: string; notes?: string }
  | { type: 'setTaskMode'; taskId: string; mode: Task['mode'] }
  | { type: 'decideCover'; coverId: string; status: CoverItem['status'] }
  | { type: 'approveBackup'; id: string; shiftId: string; date: string; personId: string; backupId: string; coverId?: string }
  | { type: 'saveNoticeTemplate'; id: string; title: string; body: string; replyNeeded: boolean }
  | { type: 'sendNotice'; id: string; title: string; body: string; replyNeeded: boolean; audience: 'team' | 'people'; teamShiftId?: string; recipientIds: string[]; priority?: Notice['priority']; expiresAt?: string }
  | { type: 'decideJoin'; joinId: string; status: 'approved' | 'declined'; personId?: string }
  | { type: 'saveDraft'; version: SopVersion; department?: string; created?: boolean }
  | { type: 'newDraftFrom'; id: string; sopId: string; versionId: string | null; seedNote?: { feedbackId: string; text: string; stepId?: string } }
  | { type: 'deleteDraft'; versionId: string }
  | { type: 'submitForReview'; versionId: string }
  | { type: 'review'; id: string; versionId: string; decision: ReviewDecision['decision']; comment: string; stepId?: string }
  | { type: 'release'; versionId: string }
  | { type: 'retireSop'; sopId: string }
  | { type: 'restoreSop'; sopId: string }
  | { type: 'addFeedback'; id: string; lane: FeedbackLane; sopVersionId: string; text: string; stepId?: string; rating?: number }
  | { type: 'resolveFeedback'; feedbackId: string; reopen?: boolean }
  | { type: 'logEvent'; event: string; detail: string }
  | { type: 'upsertJobRole'; role: JobRole }
  | { type: 'upsertRoom'; room: Room }
  | { type: 'deleteRoom'; roomId: string }
  | { type: 'upsertShift'; shift: Shift }
  | { type: 'deleteShift'; shiftId: string }
  | { type: 'upsertPerson'; person: Person }
  | { type: 'requestAccess'; feature: string; tier: Tier }
  | { type: 'updateProperty'; patch: Partial<Pick<Property, 'name' | 'city' | 'timeZone' | 'codeScheme' | 'defaultTimeTargetMin'>> }

export type ActionResult = { ok: true; state: State; value?: unknown } | { ok: false; error: string }

export class DomainError extends Error {}
const fail = (msg: string): never => { throw new DomainError(msg) }
const need = (cond: unknown, msg: string) => { if (!cond) fail(msg) }

export function proposeVersion(draft: Pick<SopVersion, 'steps' | 'timeTargetMin'>, base: SopVersion | undefined): { label: string; structural: boolean } {
  if (!base) return { label: '1.0', structural: true }
  const [maj, min] = base.version.split('.').map(Number)
  const structural =
    draft.steps.length !== base.steps.length ||
    draft.timeTargetMin !== base.timeTargetMin ||
    draft.steps.some((s, i) => s.requireCheck !== base.steps[i]?.requireCheck)
  return { label: structural ? `${maj + 1}.0` : `${maj}.${min + 1}`, structural }
}

export const approvalsOf = (v: SopVersion) =>
  new Set(v.reviews.filter((r) => r.decision === 'approve' && !r.stepId && r.reviewerId !== v.authorId).map((r) => r.reviewerId)).size

const validId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{2,64}$/.test(id)
const str = (v: unknown, max: number, label: string) => { need(typeof v === 'string' && v.length <= max, `${label} is too long`); return (v as string) }
const optStr = (v: unknown, max: number, label: string) => (v === undefined || v === null || v === '' ? undefined : str(v, max, label))

function validateVersion(v: SopVersion) {
  str(v.title, 200, 'Title'); str(v.code, 40, 'Code')
  need(Number.isInteger(v.timeTargetMin) && v.timeTargetMin >= 1 && v.timeTargetMin <= 240, 'Time target must be 1–240 minutes')
  need(Array.isArray(v.tags) && v.tags.length <= MAX_TAGS, `Up to ${MAX_TAGS} tags`)
  need(Array.isArray(v.steps) && v.steps.length >= 1 && v.steps.length <= MAX_STEPS, `An SOP has 1–${MAX_STEPS} steps`)
  v.steps.forEach((s: StepIn) => { str(s.instruction, 2000, 'Step'); str(s.guestCare, 2000, 'Guest-care detail'); need(validId(s.id), 'Bad step id') })
}

/**
 * Who is on a shift on a given hotel date: the standing roster, with anyone covered by an approved backup that day
 * swapped for their backup. The standing roster itself never changes for a one-day cover.
 */
export function rosterOn(s: Pick<State, 'shifts' | 'cover'>, shiftId: string, date: string): string[] {
  const sh = s.shifts.find((x) => x.id === shiftId)
  if (!sh) return []
  const swaps = s.cover.filter((c) => c.kind === 'backup' && c.status === 'approved' && c.shiftId === shiftId && c.date === date && c.backupId)
  const out = new Set(sh.memberIds)
  swaps.forEach((c) => { out.delete(c.personId); out.add(c.backupId!) })
  return [...out]
}

/** Why a room can't take this assignment, or null when it can. Shared by the assign screens and the server. */
export function assignBlocker(s: Pick<State, 'sops' | 'sopVersions' | 'rooms' | 'tasks'>, a: { sopId: string; roomId: string; shiftId: string; start: string; end?: string }): string | null {
  const sop = s.sops.find((x) => x.id === a.sopId)
  if (!sop?.currentVersionId) return 'This SOP has no published version'
  if (sop.retiredAt) return 'This SOP is retired'
  const v = s.sopVersions.find((x) => x.id === sop.currentVersionId)
  if (v?.status !== 'published') return 'This SOP has no published version'
  const room = s.rooms.find((r) => r.id === a.roomId)
  if (!room) return 'Unknown room'
  if (room.occupancy === 'out_of_order') return `Room ${room.number} is out of order`
  const open = s.tasks.filter((t) => t.roomId === a.roomId && isOpenTask(t))
  if (open.some((t) => t.shiftId === a.shiftId && hotelDateKey(t.start) === hotelDateKey(a.start))) return `Room ${room.number} already has open work on this shift`
  if (a.end && open.some((t) => Date.parse(t.start) < Date.parse(a.end!) && Date.parse(a.start) < Date.parse(t.end))) return `Room ${room.number} already has an open job in this slot`
  return null
}

/**
 * Apply one action as `actor` at time `now`. Throws DomainError on any rule violation, so the server
 * never persists a partial change and the client can roll back its optimistic copy.
 */
export function apply(s0: State, actor: Actor, a: Action, now: string): { state: State; value?: unknown } {
  setHotelTimeZone(s0.property.timeZone)
  const s: State = { ...s0 }
  const P = s.property.id
  const me = actor.personId
  const emp = hasPortal(actor, 'employee'), mgr = hasPortal(actor, 'manager'), auth = hasPortal(actor, 'author')
  const log = (action: string, detail: string) => { s.audit = [{ id: `au-${now}-${Math.random().toString(36).slice(2, 8)}`, propertyId: P, actorId: me, action, detail, at: now }, ...s.audit] }
  const task = (id: string) => s.tasks.find((t) => t.id === id) ?? fail('Task not found')
  const patchTask = (id: string, p: Partial<Task>) => { s.tasks = s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }
  const ownTask = (id: string) => { const t = task(id); need(t.personId === me || mgr, 'Not your task'); return t }
  const fresh = (coll: { id: string }[], id: string) => { need(validId(id), 'Invalid id'); need(!coll.some((x) => x.id === id), 'Duplicate id') }
  const version = (id: string) => s.sopVersions.find((v) => v.id === id) ?? fail('SOP version not found')
  const putVersion = (v: SopVersion) => { s.sopVersions = s.sopVersions.some((x) => x.id === v.id) ? s.sopVersions.map((x) => (x.id === v.id ? v : x)) : [...s.sopVersions, v] }
  const issue = (id: string) => s.issues.find((i) => i.id === id) ?? fail('Incident not found')
  const person = (id: string, label = 'Unknown staff member') => s.people.find((p) => p.id === id) ?? fail(label)
  let value: unknown

  const updateIssue = (id: string, patch: { status?: IssueStatus; assignedToId?: string | null; note?: string; severity?: IssueSeverity }) => {
    const i = issue(id)
    const reporterNote = i.reportedById === me && !patch.status && patch.assignedToId === undefined && !patch.severity
    need(mgr || reporterNote, 'Managers only')
    if (patch.status) need(ISSUE_STATUSES.includes(patch.status), 'Bad status')
    if (patch.severity) need(SEVERITIES.includes(patch.severity), 'Bad severity')
    if (patch.assignedToId) person(patch.assignedToId)
    const note = patch.note ? str(patch.note, 1000, 'Note').trim() : ''
    need(patch.status || patch.assignedToId !== undefined || patch.severity || note, 'Nothing to update')
    const { status, severity, assignedToId } = patch
    s.issues = s.issues.map((x) => x.id !== id ? x : {
      ...x, ...(status ? { status } : {}), ...(severity ? { severity } : {}),
      ...(assignedToId !== undefined ? { assignedToId: assignedToId ?? undefined } : {}),
      ...(status === 'resolved' ? { resolvedAt: now, resolvedById: me } : status ? { resolvedAt: undefined, resolvedById: undefined } : {}),
      updates: [...x.updates, { at: now, byId: me, text: note || (status ? `Status → ${status.replace('_', ' ')}` : assignedToId !== undefined ? 'Reassigned' : 'Updated'), status }],
    })
    log(`issue.${status ?? 'updated'}`, id)
  }

  switch (a.type) {
    // ── Employee work ─────────────────────────────────────────────
    case 'startTask': {
      const t = ownTask(a.taskId)
      need(t.status === 'scheduled', 'This room has already started')
      need(Date.parse(now) >= Date.parse(t.start), 'Do not enter yet — this room has not opened')
      patchTask(t.id, { status: 'in_progress', startedAt: now }); log('task.started', t.id); break
    }
    case 'toggleStep': {
      const t = ownTask(a.taskId)
      need(t.status === 'in_progress', 'Start the room to tick steps')
      need(version(t.sopVersionId).steps.some((x) => x.id === a.stepId), 'Unknown step')
      patchTask(t.id, { doneStepIds: t.doneStepIds.includes(a.stepId) ? t.doneStepIds.filter((x) => x !== a.stepId) : [...t.doneStepIds, a.stepId] })
      break
    }
    case 'attachPhoto': {
      const t = ownTask(a.taskId)
      need(version(t.sopVersionId).steps.find((x) => x.id === a.stepId)?.allowPhoto, 'Photos are not allowed on this step')
      need(typeof a.key === 'string' && a.key.startsWith(`${P}/`), 'Bad photo')
      patchTask(t.id, { photoStepIds: [...new Set([...t.photoStepIds, a.stepId])], photoKeys: { ...t.photoKeys, [a.stepId]: a.key } }); log('task.photo', `${t.id}:${a.stepId}`); break
    }
    case 'requestVerification': {
      const t = ownTask(a.taskId); const v = version(t.sopVersionId)
      need(t.status === 'in_progress', 'Room is not in progress')
      const required = t.mode === 'standard' ? v.steps.filter((x, i) => x.requireCheck || i === v.steps.length - 1) : v.steps
      need(required.every((x) => t.doneStepIds.includes(x.id)), 'Tick every step first')
      // Rooms without a recorded-check step complete straight away; others wait for independent verification.
      // completedAt is when the work finished; verifiedAt (below) is when someone else signed it off.
      if (v.steps.some((x) => x.requireCheck)) { patchTask(t.id, { status: 'awaiting_verification', completedAt: now, returned: undefined }); log('task.verification_requested', t.id) }
      else { patchTask(t.id, { status: 'done', completedAt: now, returned: undefined }); log('task.completed', t.id) }
      break
    }
    case 'verifyTask': {
      need(mgr, 'Only a manager can verify'); const t = task(a.taskId)
      need(t.personId !== me, 'Verification must be independent'); need(t.status === 'awaiting_verification', 'Nothing to verify')
      patchTask(t.id, { status: 'done', completedAt: t.completedAt ?? now, verifiedById: me, verifiedAt: now }); log('task.verified', t.id); break
    }
    case 'returnTask': {
      need(mgr, 'Only a manager can send a room back'); const t = task(a.taskId)
      need(t.personId !== me, 'Verification must be independent'); need(t.status === 'awaiting_verification', 'This room is not waiting for verification')
      const note = str(a.note, 500, 'Reason').trim(); need(note, 'Say what needs fixing')
      patchTask(t.id, { status: 'in_progress', completedAt: undefined, returned: { byId: me, at: now, note } }); log('task.returned', `${t.id}: ${note}`); break
    }
    case 'cancelTask': {
      need(mgr, 'Managers only'); const t = task(a.taskId); need(isOpenTask(t), 'This room is already finished')
      const reason = str(a.reason, 300, 'Reason').trim()
      patchTask(t.id, { status: 'cancelled', cancelled: { byId: me, at: now, reason } }); log('task.cancelled', `${t.id}: ${reason}`); break
    }
    case 'reassignTask': {
      need(mgr, 'Managers only'); const t = task(a.taskId)
      need(t.status === 'scheduled' || t.status === 'in_progress', 'Only rooms not yet finished can move'); need(t.personId !== a.personId, 'Already theirs')
      const p = person(a.personId); need(p.jobRoleId === version(t.sopVersionId).jobRoleId, 'This SOP is for a different role')
      need(rosterOn(s, t.shiftId, hotelDateKey(t.start)).includes(p.id), 'Not rostered on this shift')
      patchTask(t.id, { personId: p.id, assignedById: me }); log('task.reassigned', `${t.id} → ${p.id}`); break
    }
    case 'setTaskPriority': {
      need(mgr, 'Managers only'); const t = task(a.taskId); need(isOpenTask(t), 'This room is already finished')
      need(PRIORITIES.includes(a.priority), 'Bad priority'); need(t.priority !== a.priority, 'Already that priority')
      patchTask(t.id, { priority: a.priority }); log('task.priority_changed', `${t.id}: ${a.priority}`); break
    }
    case 'endUrgent': {
      need(mgr, 'Managers only'); const t = task(a.taskId); need(t.priority === 'urgent', 'Not urgent')
      patchTask(t.id, { priority: 'standard', urgentEnded: { at: now, reason: str(a.reason, 200, 'Reason'), seen: false } }); log('task.urgent_ended', t.id); break
    }
    case 'markUrgentSeen': { const t = ownTask(a.taskId); if (t.urgentEnded) patchTask(t.id, { urgentEnded: { ...t.urgentEnded, seen: true } }); break }
    case 'reportIssue': {
      need(actor.grants.length, 'Sign in first'); fresh(s.issues, a.id)
      const t = a.taskId ? ownTask(a.taskId) : undefined
      const roomId = a.roomId || t?.roomId
      if (roomId) need(s.rooms.some((r) => r.id === roomId), 'Unknown room')
      const text = str(a.text, 2000, 'Details').trim()
      const title = (optStr(a.title, 200, 'Title')?.trim() || text).slice(0, 80)
      need(title, 'Describe the issue')
      const i: Issue = {
        id: a.id, propertyId: P, taskId: t?.id, roomId: roomId || undefined, reportedById: me,
        category: a.category && CATEGORIES.includes(a.category) ? a.category : 'other', severity: a.severity && SEVERITIES.includes(a.severity) ? a.severity : 'medium',
        title, text: text || title, status: 'open', at: now, updates: [{ at: now, byId: me, text: 'Reported', status: 'open' }],
      }
      s.issues = [i, ...s.issues]; value = i
      log('issue.reported', `${title}${t ? ` · ${t.id}` : ''}`); break
    }
    case 'updateIssue': { updateIssue(a.issueId, a); break }
    case 'resolveIssue': { updateIssue(a.issueId, { status: 'resolved' }); break }
    case 'checkIn': {
      need(emp, 'Employees only'); fresh(s.attendance, a.id)
      const date = hotelDateKey(now)
      s.attendance = [...s.attendance.filter((x) => !(x.personId === me && x.date === date)), { id: a.id, propertyId: P, personId: me, date, mark: a.mark === 'extra' ? 'extra' : 'checkin', at: now }]
      log('attendance.checkin', date); break
    }
    case 'endShift': {
      need(emp, 'Employees only'); fresh(s.cover, a.id)
      const sh = s.shifts.find((x) => x.memberIds.includes(me) && isLive(x, Date.parse(now))) ?? s.shifts.find((x) => x.memberIds.includes(me))
        ?? s.shifts.find((x) => x.id === [...s.tasks].filter((t) => t.personId === me).sort((p, q) => q.start.localeCompare(p.start))[0]?.shiftId)
        ?? fail('You are not on a shift')
      s.cover = [...s.cover, { id: a.id, propertyId: P, kind: a.early ? 'early_departure' : 'ended', personId: me, shiftId: sh.id, date: hotelDateKey(now),
        note: a.early ? 'Went early from the Employee app' : 'Ended shift from the Employee app', status: a.early ? 'pending' : 'approved' }]
      log(a.early ? 'shift.went_early' : 'shift.ended', sh.id); break
    }
    case 'requestTimeOff': {
      need(emp, 'Employees only'); fresh(s.cover, a.id); need(s.shifts.some((x) => x.id === a.shiftId), 'Unknown shift')
      need(/^\d{4}-\d{2}-\d{2}$/.test(a.date), 'Bad date')
      s.cover = [...s.cover, { id: a.id, propertyId: P, kind: 'time_off', personId: me, shiftId: a.shiftId, date: a.date, note: str(a.note, 300, 'Note'), status: 'pending' }]
      log('cover.time_off_requested', a.date); break
    }
    case 'openRef':
    case 'acknowledge': {
      if (a.kind === 'notice') need(s.notices.find((n) => n.id === a.refId)?.recipientIds.includes(me), 'Notice not addressed to you')
      else version(a.refId)
      const ex = s.ackEvents.find((x) => x.personId === me && x.kind === a.kind && x.refId === a.refId)
      let ev: AckEvent = ex ?? (fresh(s.ackEvents, a.id), { id: a.id, propertyId: P, personId: me, kind: a.kind, refId: a.refId, openedAt: null, acknowledgedAt: null })
      ev = { ...ev, openedAt: ev.openedAt ?? now }
      if (a.type === 'acknowledge') {
        ev = { ...ev, acknowledgedAt: ev.acknowledgedAt ?? now }
        if (a.reply !== undefined) ev = { ...ev, repliedAt: now, reply: str(a.reply, 500, 'Reply') }
        log(`${a.kind}.acknowledged`, a.refId)
      } else if (ex?.openedAt) break
      s.ackEvents = ex ? s.ackEvents.map((x) => (x.id === ex.id ? ev : x)) : [...s.ackEvents, ev]
      break
    }

    // ── Manager ───────────────────────────────────────────────────
    case 'assignTask': {
      need(mgr, 'Managers only'); fresh(s.tasks, a.id)
      const why = assignBlocker(s, a); if (why) fail(why)
      const v = version(s.sops.find((x) => x.id === a.sopId)!.currentVersionId!)
      const p = person(a.personId)
      need(p.jobRoleId === v.jobRoleId, 'This SOP is for a different role')
      need(s.shifts.some((x) => x.id === a.shiftId), 'Unknown shift')
      need(rosterOn(s, a.shiftId, hotelDateKey(a.start)).includes(a.personId), 'Not rostered on this shift')
      need(Date.parse(a.end) > Date.parse(a.start), 'Finish must be after start')
      need(PRIORITIES.includes(a.priority), 'Bad priority')
      const t: Task = {
        id: a.id, propertyId: P, shiftId: a.shiftId, personId: a.personId, roomId: a.roomId, sopVersionId: v.id, start: a.start, end: a.end,
        priority: a.priority, status: 'scheduled', doneStepIds: [], photoStepIds: [], photoKeys: {}, mode: 'guided', assignedById: me, reviewedVersionConfirmed: true,
        notes: optStr(a.notes, 500, 'Notes')?.trim() || undefined,
      }
      s.tasks = [...s.tasks, t]; value = t
      log('task.assigned', `${a.roomId} → ${a.personId} (${v.code} ${v.version})`); break
    }
    case 'setTaskMode': { need(mgr, 'Managers only'); need(['guided', 'standard'].includes(a.mode), 'Bad mode'); task(a.taskId); patchTask(a.taskId, { mode: a.mode }); log('task.mode', `${a.taskId} ${a.mode}`); break }
    case 'decideCover': {
      need(mgr, 'Managers only'); const c = s.cover.find((x) => x.id === a.coverId) ?? fail('Not found')
      need(c.status === 'pending', 'Already decided'); need(['approved', 'declined'].includes(a.status), 'Bad status')
      s.cover = s.cover.map((x) => (x.id === c.id ? { ...x, status: a.status } : x)); log(`cover.${a.status}`, `${c.kind} ${c.personId}`); break
    }
    case 'approveBackup': {
      need(mgr, 'Managers only'); fresh(s.cover, a.id)
      const sh = s.shifts.find((x) => x.id === a.shiftId) ?? fail('Unknown shift')
      need(/^\d{4}-\d{2}-\d{2}$/.test(a.date), 'Bad date')
      const p = person(a.personId, 'Unknown person'), b = person(a.backupId, 'Unknown backup')
      // Eligibility is re-checked here, at approval time.
      need(b.jobRoleId === p.jobRoleId, 'Backup is not qualified for this job'); need(!rosterOn(s, sh.id, a.date).includes(b.id), 'Backup is already on this shift')
      need(!s.cover.some((c) => c.personId === b.id && c.date === a.date && c.kind === 'time_off' && c.status !== 'declined'), 'Backup has time off that day')
      if (a.coverId) { const c = s.cover.find((x) => x.id === a.coverId) ?? fail('Request not found'); need(c.status === 'pending', 'Already decided') }
      // A backup covers one date: the standing roster stays as it is (see rosterOn).
      s.cover = [...s.cover.map((c) => (c.id === a.coverId ? { ...c, status: 'approved' as const } : c)),
        { id: a.id, propertyId: P, kind: 'backup', personId: a.personId, backupId: a.backupId, shiftId: a.shiftId, date: a.date, note: 'Backup approved', status: 'approved' }]
      log('cover.backup_approved', `${b.name} covers ${p.name} on ${sh.name} ${a.date}`); break
    }
    case 'saveNoticeTemplate': {
      need(mgr, 'Managers only'); fresh(s.notices, a.id)
      s.notices = [{ id: a.id, propertyId: P, title: str(a.title, 120, 'Title'), body: str(a.body, 2000, 'Body'), replyNeeded: !!a.replyNeeded, sample: true, audience: 'team', recipientIds: [], sentAt: null }, ...s.notices]
      break
    }
    case 'sendNotice': {
      need(mgr, 'Managers only'); fresh(s.notices, a.id)
      need(a.recipientIds.length > 0 && a.recipientIds.every((id) => s.people.some((p) => p.id === id)), 'Choose who to send it to')
      need(a.title.trim().length > 0, 'Give the notice a title')
      need(!a.priority || ['normal', 'important', 'urgent'].includes(a.priority), 'Bad priority')
      need(!a.expiresAt || !Number.isNaN(Date.parse(a.expiresAt)), 'Bad expiry')
      s.notices = [{ id: a.id, propertyId: P, title: str(a.title, 120, 'Title'), body: str(a.body, 2000, 'Body'), replyNeeded: !!a.replyNeeded, sample: false,
        audience: a.audience, teamShiftId: a.teamShiftId, recipientIds: [...new Set(a.recipientIds)], sentAt: now, sentById: me, priority: a.priority, expiresAt: a.expiresAt }, ...s.notices]
      log('notice.sent', `${a.title} → ${a.recipientIds.length}`); break
    }
    case 'decideJoin': {
      need(mgr, 'Managers only'); const j = s.joinRequests.find((x) => x.id === a.joinId) ?? fail('Not found'); need(j.status === 'pending', 'Already decided')
      s.joinRequests = s.joinRequests.map((x) => (x.id === j.id ? { ...x, status: a.status } : x))
      if (a.status === 'approved' && a.personId) {
        fresh(s.people, a.personId)
        s.people = [...s.people, { id: a.personId, propertyId: P, name: j.name, initials: initials(j.name), jobRoleId: j.jobRoleId, title: s.jobRoles.find((r) => r.id === j.jobRoleId)?.name ?? 'Team member',
          catalogue: ['pilot', 'whole'], status: 'active', hiredAt: now, languages: ['English'] }]
        s.shifts = s.shifts.map((x) => (x.id === j.shiftId ? { ...x, memberIds: [...x.memberIds, a.personId!] } : x))
      }
      log(`join.${a.status}`, j.name); break
    }

    // ── Author ────────────────────────────────────────────────────
    case 'newDraftFrom': {
      need(auth, 'Authors only'); fresh(s.sopVersions, a.id)
      const base = a.versionId ? version(a.versionId) : undefined
      if (!base) need(validId(a.sopId), 'Invalid id')
      const d: SopVersion = {
        id: a.id, sopId: base?.sopId ?? a.sopId, propertyId: P, version: base ? proposeVersion(base, base).label : '1.0', baseVersionId: base?.id ?? null,
        status: 'draft', title: base?.title ?? '', code: base?.code ?? '', jobRoleId: base?.jobRoleId ?? s.jobRoles[0]?.id ?? '', language: base?.language ?? 'English',
        tags: base?.tags ?? [], timeTargetMin: base?.timeTargetMin ?? s.property.defaultTimeTargetMin,
        steps: base ? base.steps.map((x) => ({ ...x, guestCare: a.seedNote && x.id === a.seedNote.stepId ? `${x.guestCare}\n[Feedback] ${a.seedNote.text}`.trim() : x.guestCare }))
          : [{ id: `${a.id}-s1`, icon: 'check', instruction: '', guestCare: '', requireCheck: false, allowPhoto: false }],
        authorId: me, createdAt: now, updatedAt: now, reviews: [], catalogue: base?.catalogue ?? ['pilot', 'whole'],
      }
      putVersion(d); value = d
      if (a.seedNote) s.feedback = s.feedback.map((f) => (f.id === a.seedNote!.feedbackId ? { ...f, status: 'done' } : f))
      break
    }
    case 'saveDraft': {
      need(auth, 'Authors only'); const ex = version(a.version.id)
      need(ex.authorId === me, 'Only the author can edit this draft'); need(ex.status === 'draft' || ex.status === 'changes_requested', 'Only drafts can be edited')
      const v: SopVersion = { ...ex, title: a.version.title, code: a.version.code.toUpperCase(), jobRoleId: a.version.jobRoleId, language: a.version.language,
        tags: a.version.tags, timeTargetMin: a.version.timeTargetMin, steps: a.version.steps, catalogue: a.version.catalogue, updatedAt: now }
      validateVersion(v); need(s.jobRoles.some((r) => r.id === v.jobRoleId), 'Unknown role')
      putVersion(v); value = v
      // Keep the library record (code, department) in step with the draft.
      const department = optStr(a.department, 80, 'Department')?.trim()
      const sop = s.sops.find((x) => x.id === v.sopId)
      s.sops = sop
        ? s.sops.map((x) => (x.id !== v.sopId ? x : { ...x, department: department || x.department, code: x.currentVersionId ? x.code : v.code || x.code }))
        : [...s.sops, { id: v.sopId, propertyId: P, code: v.code, currentVersionId: null, department: department || undefined }]
      log(a.created ? 'sop.draft_created' : 'sop.draft_saved', `${v.code || 'Untitled'} ${v.version}`)
      break
    }
    case 'deleteDraft': {
      const v = version(a.versionId); need(v.authorId === me && v.status === 'draft', 'Only your own drafts can be deleted')
      s.sopVersions = s.sopVersions.filter((x) => x.id !== v.id)
      // A brand-new SOP that only ever had this draft leaves the library too.
      if (!s.sopVersions.some((x) => x.sopId === v.sopId)) s.sops = s.sops.filter((x) => !(x.id === v.sopId && !x.currentVersionId))
      log('sop.draft_deleted', `${v.code || 'Untitled'} ${v.version}`); break
    }
    case 'submitForReview': {
      const v = version(a.versionId); need(v.authorId === me, 'Only the author can submit'); need(v.status === 'draft' || v.status === 'changes_requested', 'Already submitted')
      validateVersion(v); need(v.title.trim() && /^[A-Z]{2,5}(-[A-Z0-9]+)+$/.test(v.code), 'Add a title and a code like HK-102')
      need(v.steps.every((x) => x.instruction.trim()), 'Every step needs an instruction')
      const clash = s.sops.find((x) => x.code === v.code && x.id !== v.sopId); need(!clash, `Code ${v.code} is already used`)
      const base = s.sopVersions.find((b) => b.id === v.baseVersionId)
      const label = proposeVersion(v, base).label
      putVersion({ ...v, status: 'in_review', submittedAt: now, reviews: [], version: label })
      if (!s.sops.some((x) => x.id === v.sopId)) s.sops = [...s.sops, { id: v.sopId, propertyId: P, code: v.code, currentVersionId: null }]
      log('sop.submitted', `${v.code} ${label}`); break
    }
    case 'review': {
      need(auth, 'Reviewers need author access'); need(validId(a.id), 'Invalid id')
      // Changes requested goes back to the author: they revise and resubmit, which starts a fresh round.
      const v = version(a.versionId); need(v.status === 'in_review', 'Not open for review')
      need(v.authorId !== me, 'Authors cannot review their own version'); need(['approve', 'request_changes', 'reject'].includes(a.decision), 'Bad decision')
      const reviews = [...v.reviews.filter((r) => !(r.reviewerId === me && !r.stepId && !a.stepId)),
        { id: a.id, reviewerId: me, decision: a.decision, at: now, comment: str(a.comment, 2000, 'Comment'), stepId: a.stepId }]
      const status = a.stepId ? v.status : a.decision === 'reject' ? 'rejected' : a.decision === 'request_changes' ? 'changes_requested' : v.status
      putVersion({ ...v, reviews, status }); log(`sop.review.${a.decision}`, `${v.code} ${v.version}`); break
    }
    case 'release': {
      need(auth, 'Authors only'); const v = version(a.versionId)
      need(v.status === 'in_review', 'Only versions in review can be released')
      need(approvalsOf(v) >= APPROVALS_REQUIRED, `Needs ${APPROVALS_REQUIRED} independent approvals`)
      const sop = s.sops.find((x) => x.id === v.sopId) ?? fail('SOP missing')
      const current = s.sopVersions.find((x) => x.id === sop.currentVersionId)
      const label = proposeVersion(v, current).label
      // In-flight tasks keep their pinned sopVersionId; only new assignments pick this up.
      s.sopVersions = s.sopVersions.map((x) => x.id === v.id ? { ...x, status: 'published', version: label, publishedAt: now, effectiveAt: now } : x.id === current?.id ? { ...x, status: 'superseded' } : x)
      s.sops = s.sops.map((x) => (x.id === v.sopId ? { ...x, code: v.code, currentVersionId: v.id } : x))
      value = label; log('sop.released', `${v.code} ${label}`); break
    }
    case 'retireSop':
    case 'restoreSop': {
      need(auth, 'Authors only'); const sop = s.sops.find((x) => x.id === a.sopId) ?? fail('SOP not found')
      s.sops = s.sops.map((x) => (x.id !== sop.id ? x : a.type === 'retireSop' ? { ...x, retiredAt: now, retiredById: me } : { ...x, retiredAt: undefined, retiredById: undefined }))
      log(a.type === 'retireSop' ? 'sop.retired' : 'sop.restored', sop.code); break
    }
    case 'addFeedback': {
      fresh(s.feedback, a.id); const v = version(a.sopVersionId)
      need(a.lane !== 'manager_request' || mgr, 'Manager requests come from managers')
      need(a.rating === undefined || (Number.isInteger(a.rating) && a.rating >= 1 && a.rating <= 5), 'Rating is 1–5')
      if (a.stepId) need(v.steps.some((x) => x.id === a.stepId), 'Unknown step')
      // One rating per person per version: a new one replaces the old.
      const kept = a.lane === 'rating' ? s.feedback.filter((f) => !(f.lane === 'rating' && f.sopVersionId === v.id && f.fromId === me)) : s.feedback
      s.feedback = [{ id: a.id, propertyId: P, lane: a.lane, sopVersionId: v.id, stepId: a.stepId, fromId: me, rating: a.rating, text: str(a.text, 2000, 'Feedback'), at: now, status: 'open' }, ...kept]
      if (a.lane === 'manager_request') log('sop.change_requested', `${v.code} v${v.version}`)
      break
    }
    case 'resolveFeedback': { need(auth, 'Authors only'); s.feedback = s.feedback.map((f) => (f.id === a.feedbackId ? { ...f, status: a.reopen ? 'open' : 'done' } : f)); break }
    case 'logEvent': {
      need(actor.grants.length, 'Sign in first'); need(LOG_EVENT.test(a.event), 'Unknown event')
      log(a.event, str(a.detail, 300, 'Detail')); break
    }

    // ── Platform foundation (property admin) ─────────────────────
    case 'upsertJobRole': {
      need(isAdmin(actor), 'Property admins only'); need(validId(a.role.id), 'Invalid id')
      const r: JobRole = { id: a.role.id, propertyId: P, name: str(a.role.name, 80, 'Name').trim() || fail('Name required'), team: str(a.role.team, 80, 'Team') }
      s.jobRoles = s.jobRoles.some((x) => x.id === r.id) ? s.jobRoles.map((x) => (x.id === r.id ? r : x)) : [...s.jobRoles, r]; log('admin.role', r.name); break
    }
    case 'upsertRoom': {
      need(isAdmin(actor) || hasPortal(actor, 'manager', 'senior'), 'Senior managers only'); need(validId(a.room.id), 'Invalid id')
      need(!a.room.occupancy || OCCUPANCIES.includes(a.room.occupancy), 'Bad occupancy')
      const r: Room = { id: a.room.id, propertyId: P, number: str(a.room.number, 12, 'Room').trim() || fail('Room number required'), floor: Number(a.room.floor) || 0, wing: str(a.room.wing ?? '', 40, 'Wing'),
        yesterdayAttendantId: a.room.yesterdayAttendantId, type: optStr(a.room.type, 40, 'Type'), occupancy: a.room.occupancy, vip: a.room.vip || undefined, guestName: optStr(a.room.guestName, 80, 'Guest') }
      need(!s.rooms.some((x) => x.number === r.number && x.id !== r.id), `Room ${r.number} already exists`)
      s.rooms = s.rooms.some((x) => x.id === r.id) ? s.rooms.map((x) => (x.id === r.id ? r : x)) : [...s.rooms, r]; break
    }
    case 'deleteRoom': {
      need(isAdmin(actor) || hasPortal(actor, 'manager', 'senior'), 'Senior managers only')
      need(!s.tasks.some((t) => t.roomId === a.roomId && isOpenTask(t)), 'This room has open jobs'); s.rooms = s.rooms.filter((r) => r.id !== a.roomId); break
    }
    case 'upsertShift': {
      need(isAdmin(actor) || hasPortal(actor, 'manager', 'senior'), 'Senior managers only'); need(validId(a.shift.id), 'Invalid id')
      need(/^\d{2}:\d{2}$/.test(a.shift.start) && /^\d{2}:\d{2}$/.test(a.shift.end), 'Times are HH:MM')
      const sh: Shift = { id: a.shift.id, propertyId: P, name: str(a.shift.name, 40, 'Name').trim() || fail('Name required'), start: a.shift.start, end: a.shift.end,
        staffTarget: Math.max(0, Math.floor(Number(a.shift.staffTarget) || 0)), team: str(a.shift.team ?? '', 80, 'Team'), memberIds: a.shift.memberIds.filter((id) => s.people.some((p) => p.id === id)) }
      s.shifts = s.shifts.some((x) => x.id === sh.id) ? s.shifts.map((x) => (x.id === sh.id ? sh : x)) : [...s.shifts, sh]; log('admin.shift', sh.name); break
    }
    case 'deleteShift': {
      need(isAdmin(actor), 'Property admins only'); need(!s.tasks.some((t) => t.shiftId === a.shiftId && isOpenTask(t)), 'This shift has open jobs')
      s.shifts = s.shifts.filter((x) => x.id !== a.shiftId); break
    }
    case 'upsertPerson': {
      need(isAdmin(actor), 'Property admins only'); need(validId(a.person.id), 'Invalid id')
      const name = str(a.person.name, 80, 'Name').trim(); need(name, 'Name required'); need(s.jobRoles.some((r) => r.id === a.person.jobRoleId), 'Choose a job role')
      const ex = s.people.find((x) => x.id === a.person.id)
      const p: Person = { ...ex, id: a.person.id, propertyId: P, name, initials: initials(name), jobRoleId: a.person.jobRoleId, title: str(a.person.title, 80, 'Title') || s.jobRoles.find((r) => r.id === a.person.jobRoleId)!.name,
        catalogue: a.person.catalogue?.length ? a.person.catalogue : ['pilot', 'whole'],
        employeeNo: optStr(a.person.employeeNo, 40, 'Employee number') ?? ex?.employeeNo, email: optStr(a.person.email, 120, 'Email') ?? ex?.email, phone: optStr(a.person.phone, 40, 'Phone') ?? ex?.phone,
        status: a.person.status && ['active', 'on_leave', 'inactive'].includes(a.person.status) ? a.person.status : ex?.status ?? 'active', hiredAt: ex?.hiredAt ?? now, languages: a.person.languages ?? ex?.languages }
      s.people = ex ? s.people.map((x) => (x.id === p.id ? p : x)) : [...s.people, p]; log('admin.person', p.name); break
    }
    case 'requestAccess': { log('access.requested', `${str(a.feature, 80, 'Feature')} (${a.tier})`); break }
    case 'updateProperty': {
      need(isAdmin(actor), 'Property admins only')
      if (a.patch.timeZone) { try { new Intl.DateTimeFormat('en', { timeZone: a.patch.timeZone }) } catch { fail('Unknown time zone') } }
      s.property = { ...s.property, ...a.patch }; log('admin.property', JSON.stringify(a.patch)); break
    }
    default: fail('Unknown action')
  }
  return { state: s, value }
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((x) => x[0]!.toUpperCase()).join('').slice(0, 2)

export function emptyState(property: Property): State {
  return { property, jobRoles: [], people: [], sops: [], sopVersions: [], shifts: [], rooms: [], tasks: [], ackEvents: [], notices: [], attendance: [],
    cover: [], feedback: [], joinRequests: [], issues: [], audit: [] }
}

/** Fills fields that records written by earlier versions of Mise may not have. Safe to run on any state. */
export function normalizeState(s: State): State {
  type LegacyIssue = Partial<Issue> & { personId?: string }
  const tasks = s.tasks.some((t) => !t.photoKeys || !t.photoStepIds || !t.doneStepIds)
    ? s.tasks.map((t) => ({ ...t, photoKeys: t.photoKeys ?? {}, photoStepIds: t.photoStepIds ?? [], doneStepIds: t.doneStepIds ?? [] })) : s.tasks
  const issues = s.issues.some((i) => !i.updates || !i.reportedById)
    ? (s.issues as LegacyIssue[]).map((i): Issue => {
      const text = i.text ?? ''
      return {
        ...(i as Issue), reportedById: i.reportedById ?? i.personId ?? '', title: i.title ?? text.slice(0, 80), text, category: i.category ?? 'other', severity: i.severity ?? 'medium',
        roomId: i.roomId ?? s.tasks.find((t) => t.id === i.taskId)?.roomId, updates: i.updates ?? [{ at: i.at ?? '', byId: i.reportedById ?? i.personId ?? '', text: 'Reported', status: 'open' }],
      }
    }) : s.issues
  return tasks === s.tasks && issues === s.issues ? s : { ...s, tasks, issues }
}

/** What an actor may read. Enforced on the server; compliance data needs Senior manager. */
export function viewFor(s: State, a: Actor): State {
  const mgr = hasPortal(a, 'manager'), senior = hasPortal(a, 'manager', 'senior') || isAdmin(a), auth = hasPortal(a, 'author')
  const me = a.personId
  const mine = <T extends { personId: string }>(xs: T[]) => xs.filter((x) => x.personId === me)
  const myTasks = new Set(s.tasks.filter((t) => t.personId === me).map((t) => t.id))
  return {
    property: s.property, jobRoles: s.jobRoles, people: s.people, shifts: s.shifts, sops: s.sops,
    // Guest names are for managers only.
    rooms: mgr || auth ? s.rooms : s.rooms.map(({ guestName: _g, ...r }) => r),
    sopVersions: auth ? s.sopVersions.filter((v) => v.status !== 'draft' || v.authorId === me) : s.sopVersions.filter((v) => v.status === 'published' || v.status === 'superseded'),
    tasks: mgr || auth ? s.tasks : mine(s.tasks),
    ackEvents: senior ? s.ackEvents : mgr || auth ? s.ackEvents.filter((x) => x.kind === 'notice' || x.personId === me || auth) : mine(s.ackEvents),
    notices: mgr ? s.notices : s.notices.filter((n) => n.sentAt && n.recipientIds.includes(me)),
    attendance: mgr ? s.attendance : mine(s.attendance),
    cover: mgr ? s.cover : mine(s.cover),
    feedback: auth || mgr ? s.feedback : s.feedback.filter((f) => f.fromId === me),
    joinRequests: mgr ? s.joinRequests : [],
    issues: mgr ? s.issues : s.issues.filter((i) => i.reportedById === me || (i.taskId && myTasks.has(i.taskId))),
    audit: senior ? s.audit.slice(0, 2000)
      : s.audit.filter((x) => (mgr && !x.action.startsWith('admin.') && !x.action.startsWith('access.')) || (auth && /^(sop|feedback|task)\./.test(x.action))).slice(0, 1000),
  }
}

export type { CoverKind }
