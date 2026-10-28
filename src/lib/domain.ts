// The single source of truth for every write in Mise. The Cloudflare Durable Object runs these
// functions authoritatively; the browser runs the same ones optimistically so the UI moves instantly.
import type {
  AckEvent, AttendanceMark, Attendance, AuditEntry, CoverItem, CoverKind, Feedback, FeedbackLane, Issue, JobRole, JoinRequest, Notice,
  Person, Portal, Priority, Property, ReviewDecision, Room, Shift, Sop, SopStep, SopVersion, Task, Tier,
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
/** Off for now: authors publish directly. Turn on to bring back the two-approval review step. */
export const REVIEW_REQUIRED = false
export const MAX_STEPS = 30
export const MAX_TAGS = 20

const RANK: Record<Tier, number> = { base: 0, senior: 1, admin: 2 }
export const hasPortal = (a: Actor, p: Portal, need: Tier = 'base') => a.grants.some((g) => g.portal === p && RANK[g.tier] >= RANK[need])
export const isAdmin = (a: Actor) => a.grants.some((g) => g.tier === 'admin')

type StepIn = SopStep
export type Action =
  | { type: 'startTask'; taskId: string }
  | { type: 'toggleStep'; taskId: string; stepId: string }
  | { type: 'attachPhoto'; taskId: string; stepId: string; key: string }
  | { type: 'requestVerification'; taskId: string }
  | { type: 'verifyTask'; taskId: string }
  | { type: 'endUrgent'; taskId: string; reason: string }
  | { type: 'markUrgentSeen'; taskId: string }
  | { type: 'reportIssue'; id: string; taskId: string; text: string }
  | { type: 'resolveIssue'; issueId: string }
  | { type: 'checkIn'; id: string; mark?: AttendanceMark }
  | { type: 'endShift'; id: string; early: boolean }
  | { type: 'requestTimeOff'; id: string; shiftId: string; date: string; note: string }
  | { type: 'openRef'; id: string; kind: 'sop' | 'notice'; refId: string }
  | { type: 'acknowledge'; id: string; kind: 'sop' | 'notice'; refId: string; reply?: string }
  | { type: 'assignTask'; id: string; shiftId: string; personId: string; roomId: string; start: string; end: string; priority: Priority; sopId: string }
  | { type: 'setTaskMode'; taskId: string; mode: Task['mode'] }
  | { type: 'decideCover'; coverId: string; status: CoverItem['status'] }
  | { type: 'approveBackup'; id: string; shiftId: string; date: string; personId: string; backupId: string }
  | { type: 'saveNoticeTemplate'; id: string; title: string; body: string; replyNeeded: boolean }
  | { type: 'sendNotice'; id: string; title: string; body: string; replyNeeded: boolean; audience: 'team' | 'people'; teamShiftId?: string; recipientIds: string[] }
  | { type: 'decideJoin'; joinId: string; status: 'approved' | 'declined'; personId?: string }
  | { type: 'saveDraft'; version: SopVersion }
  | { type: 'newDraftFrom'; id: string; sopId: string; versionId: string | null; seedNote?: { feedbackId: string; text: string; stepId?: string } }
  | { type: 'deleteDraft'; versionId: string }
  | { type: 'submitForReview'; versionId: string }
  | { type: 'review'; id: string; versionId: string; decision: ReviewDecision['decision']; comment: string; stepId?: string }
  | { type: 'release'; versionId: string }
  | { type: 'addFeedback'; id: string; lane: FeedbackLane; sopVersionId: string; text: string; stepId?: string; rating?: number }
  | { type: 'resolveFeedback'; feedbackId: string }
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

const validId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id)
const str = (v: unknown, max: number, label: string) => { need(typeof v === 'string' && v.length <= max, `${label} is too long`); return (v as string) }

function validateVersion(v: SopVersion) {
  str(v.title, 200, 'Title'); str(v.code, 40, 'Code')
  need(Number.isInteger(v.timeTargetMin) && v.timeTargetMin >= 1 && v.timeTargetMin <= 240, 'Time target must be 1–240 minutes')
  need(Array.isArray(v.tags) && v.tags.length <= MAX_TAGS, `Up to ${MAX_TAGS} tags`)
  need(Array.isArray(v.steps) && v.steps.length >= 1 && v.steps.length <= MAX_STEPS, `An SOP has 1–${MAX_STEPS} steps`)
  v.steps.forEach((s: StepIn) => { str(s.instruction, 2000, 'Step'); str(s.guestCare, 2000, 'Guest-care detail'); need(validId(s.id), 'Bad step id') })
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
  let value: unknown
  const publish = (versionId: string): string => {
    const v = version(versionId)
    const sop = s.sops.find((x) => x.id === v.sopId) ?? fail('SOP missing')
    const current = s.sopVersions.find((x) => x.id === sop.currentVersionId)
    const label = proposeVersion(v, current).label
    // In-flight tasks keep their pinned sopVersionId; only new assignments pick this up.
    s.sopVersions = s.sopVersions.map((x) => x.id === v.id ? { ...x, status: 'published', version: label, publishedAt: now, effectiveAt: now } : x.id === current?.id ? { ...x, status: 'superseded' } : x)
    s.sops = s.sops.map((x) => (x.id === v.sopId ? { ...x, code: v.code, currentVersionId: v.id } : x))
    log('sop.released', `${v.code} ${label}`)
    return label
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
      if (v.steps.some((x) => x.requireCheck)) { patchTask(t.id, { status: 'awaiting_verification' }); log('task.verification_requested', t.id) }
      else { patchTask(t.id, { status: 'done', completedAt: now }); log('task.completed', t.id) }
      break
    }
    case 'verifyTask': {
      need(mgr, 'Only a manager can verify'); const t = task(a.taskId)
      need(t.personId !== me, 'Verification must be independent'); need(t.status === 'awaiting_verification', 'Nothing to verify')
      patchTask(t.id, { status: 'done', completedAt: now }); log('task.verified', t.id); break
    }
    case 'endUrgent': {
      need(mgr, 'Managers only'); const t = task(a.taskId); need(t.priority === 'urgent', 'Not urgent')
      patchTask(t.id, { priority: 'standard', urgentEnded: { at: now, reason: str(a.reason, 200, 'Reason'), seen: false } }); log('task.urgent_ended', t.id); break
    }
    case 'markUrgentSeen': { const t = ownTask(a.taskId); if (t.urgentEnded) patchTask(t.id, { urgentEnded: { ...t.urgentEnded, seen: true } }); break }
    case 'reportIssue': {
      const t = ownTask(a.taskId); fresh(s.issues, a.id)
      s.issues = [{ id: a.id, propertyId: P, taskId: t.id, personId: me, text: str(a.text, 1000, 'Issue'), at: now, status: 'open' }, ...s.issues]
      log('task.issue_reported', `${t.id}: ${a.text}`); break
    }
    case 'resolveIssue': { need(mgr, 'Managers only'); s.issues = s.issues.map((i) => (i.id === a.issueId ? { ...i, status: 'resolved' } : i)); log('issue.resolved', a.issueId); break }
    case 'checkIn': {
      need(emp, 'Employees only'); fresh(s.attendance, a.id)
      const date = hotelDateKey(now)
      s.attendance = [...s.attendance.filter((x) => !(x.personId === me && x.date === date)), { id: a.id, propertyId: P, personId: me, date, mark: a.mark === 'extra' ? 'extra' : 'checkin', at: now }]
      log('attendance.checkin', date); break
    }
    case 'endShift': {
      need(emp, 'Employees only'); fresh(s.cover, a.id)
      const sh = s.shifts.find((x) => x.memberIds.includes(me) && isLive(x, Date.parse(now))) ?? s.shifts.find((x) => x.memberIds.includes(me)) ?? fail('You are not on a shift')
      s.cover = [...s.cover, { id: a.id, propertyId: P, kind: a.early ? 'early_departure' : 'ended', personId: me, shiftId: sh.id, date: hotelDateKey(now),
        note: a.early ? 'Went early from the Employee app' : 'Ended shift', status: a.early ? 'pending' : 'approved' }]
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
      const sop = s.sops.find((x) => x.id === a.sopId); need(sop?.currentVersionId, 'This SOP has no published version')
      const v = version(sop!.currentVersionId!)
      const person = s.people.find((p) => p.id === a.personId) ?? fail('Unknown staff member')
      need(person.jobRoleId === v.jobRoleId, 'This SOP is for a different role')
      need(s.rooms.some((r) => r.id === a.roomId), 'Unknown room')
      const sh = s.shifts.find((x) => x.id === a.shiftId) ?? fail('Unknown shift')
      need(sh.memberIds.includes(a.personId), 'Not rostered on this shift')
      need(Date.parse(a.end) > Date.parse(a.start), 'Finish must be after start')
      need(['standard', 'high', 'urgent'].includes(a.priority), 'Bad priority')
      need(!s.tasks.some((t) => t.roomId === a.roomId && t.status !== 'done' && Date.parse(t.start) < Date.parse(a.end) && Date.parse(a.start) < Date.parse(t.end)), 'That room already has an open job in this slot')
      const t: Task = {
        id: a.id, propertyId: P, shiftId: a.shiftId, personId: a.personId, roomId: a.roomId, sopVersionId: v.id, start: a.start, end: a.end,
        priority: a.priority, status: 'scheduled', doneStepIds: [], photoStepIds: [], photoKeys: {}, mode: 'guided', assignedById: me, reviewedVersionConfirmed: true,
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
      const p = s.people.find((x) => x.id === a.personId) ?? fail('Unknown person'), b = s.people.find((x) => x.id === a.backupId) ?? fail('Unknown backup')
      // Eligibility is re-checked here, at approval time.
      need(b.jobRoleId === p.jobRoleId, 'Backup is not qualified for this job'); need(!sh.memberIds.includes(b.id), 'Backup is already on this shift')
      need(!s.cover.some((c) => c.personId === b.id && c.date === a.date && c.kind === 'time_off' && c.status !== 'declined'), 'Backup has time off that day')
      s.cover = [...s.cover, { id: a.id, propertyId: P, kind: 'backup', personId: a.personId, backupId: a.backupId, shiftId: a.shiftId, date: a.date, note: 'Backup approved', status: 'approved' }]
      s.shifts = s.shifts.map((x) => (x.id === a.shiftId ? { ...x, memberIds: [...new Set([...x.memberIds.filter((m) => m !== a.personId), a.backupId])] } : x))
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
      s.notices = [{ id: a.id, propertyId: P, title: str(a.title, 120, 'Title'), body: str(a.body, 2000, 'Body'), replyNeeded: !!a.replyNeeded, sample: false,
        audience: a.audience, teamShiftId: a.teamShiftId, recipientIds: [...new Set(a.recipientIds)], sentAt: now, sentById: me }, ...s.notices]
      log('notice.sent', `${a.title} → ${a.recipientIds.length}`); break
    }
    case 'decideJoin': {
      need(mgr, 'Managers only'); const j = s.joinRequests.find((x) => x.id === a.joinId) ?? fail('Not found'); need(j.status === 'pending', 'Already decided')
      s.joinRequests = s.joinRequests.map((x) => (x.id === j.id ? { ...x, status: a.status } : x))
      if (a.status === 'approved' && a.personId) {
        fresh(s.people, a.personId)
        s.people = [...s.people, { id: a.personId, propertyId: P, name: j.name, initials: initials(j.name), jobRoleId: j.jobRoleId, title: s.jobRoles.find((r) => r.id === j.jobRoleId)?.name ?? '', catalogue: ['pilot', 'whole'] }]
        s.shifts = s.shifts.map((x) => (x.id === j.shiftId ? { ...x, memberIds: [...x.memberIds, a.personId!] } : x))
      }
      log(`join.${a.status}`, j.name); break
    }

    // ── Author ────────────────────────────────────────────────────
    case 'newDraftFrom': {
      need(auth, 'Authors only'); fresh(s.sopVersions, a.id)
      const base = a.versionId ? version(a.versionId) : undefined
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
      putVersion(v); value = v; break
    }
    case 'deleteDraft': {
      const v = version(a.versionId); need(v.authorId === me && v.status === 'draft', 'Only your own drafts can be deleted')
      s.sopVersions = s.sopVersions.filter((x) => x.id !== v.id); break
    }
    case 'submitForReview': {
      const v = version(a.versionId); need(v.authorId === me, 'Only the author can submit'); need(v.status === 'draft' || v.status === 'changes_requested', 'Already submitted')
      validateVersion(v); need(v.title.trim() && /^[A-Z]{2,5}(-[A-Z0-9]+)+$/.test(v.code), 'Add a title and a code like HK-102')
      need(v.steps.every((x) => x.instruction.trim()), 'Every step needs an instruction')
      const clash = s.sops.find((x) => x.code === v.code && x.id !== v.sopId); need(!clash, `Code ${v.code} is already used`)
      const base = s.sopVersions.find((b) => b.id === v.baseVersionId)
      putVersion({ ...v, status: 'in_review', submittedAt: now, reviews: [], version: proposeVersion(v, base).label })
      if (!s.sops.some((x) => x.id === v.sopId)) s.sops = [...s.sops, { id: v.sopId, propertyId: P, code: v.code, currentVersionId: null }]
      log('sop.submitted', `${v.code} ${v.version}`)
      if (!REVIEW_REQUIRED) value = publish(v.id)
      break
    }
    case 'review': {
      need(auth, 'Reviewers need author access'); fresh([], a.id)
      const v = version(a.versionId); need(v.status === 'in_review' || v.status === 'changes_requested', 'Not open for review')
      need(v.authorId !== me, 'Authors cannot review their own version'); need(['approve', 'request_changes', 'reject'].includes(a.decision), 'Bad decision')
      const reviews = [...v.reviews.filter((r) => !(r.reviewerId === me && !r.stepId && !a.stepId)),
        { id: a.id, reviewerId: me, decision: a.decision, at: now, comment: str(a.comment, 2000, 'Comment'), stepId: a.stepId }]
      const status = a.stepId ? v.status : a.decision === 'reject' ? 'rejected' : a.decision === 'request_changes' ? 'changes_requested' : v.status === 'changes_requested' ? 'in_review' : v.status
      putVersion({ ...v, reviews, status }); log(`sop.review.${a.decision}`, `${v.code} ${v.version}`); break
    }
    case 'release': {
      need(auth, 'Authors only'); const v = version(a.versionId)
      need(v.status === 'in_review' || (!REVIEW_REQUIRED && v.status === 'changes_requested'), 'Only submitted versions can be released')
      if (REVIEW_REQUIRED) need(approvalsOf(v) >= APPROVALS_REQUIRED, `Needs ${APPROVALS_REQUIRED} independent approvals`)
      value = publish(v.id); break
    }
    case 'addFeedback': {
      fresh(s.feedback, a.id); const v = version(a.sopVersionId)
      need(a.lane !== 'manager_request' || mgr, 'Manager requests come from managers')
      need(a.rating === undefined || (Number.isInteger(a.rating) && a.rating >= 1 && a.rating <= 5), 'Rating is 1–5')
      if (a.stepId) need(v.steps.some((x) => x.id === a.stepId), 'Unknown step')
      s.feedback = [{ id: a.id, propertyId: P, lane: a.lane, sopVersionId: v.id, stepId: a.stepId, fromId: me, rating: a.rating, text: str(a.text, 2000, 'Feedback'), at: now, status: 'open' }, ...s.feedback]
      break
    }
    case 'resolveFeedback': { need(auth, 'Authors only'); s.feedback = s.feedback.map((f) => (f.id === a.feedbackId ? { ...f, status: 'done' } : f)); break }

    // ── Platform foundation (property admin) ─────────────────────
    case 'upsertJobRole': {
      need(isAdmin(actor), 'Property admins only'); need(validId(a.role.id), 'Invalid id')
      const r: JobRole = { id: a.role.id, propertyId: P, name: str(a.role.name, 80, 'Name').trim() || fail('Name required'), team: str(a.role.team, 80, 'Team') }
      s.jobRoles = s.jobRoles.some((x) => x.id === r.id) ? s.jobRoles.map((x) => (x.id === r.id ? r : x)) : [...s.jobRoles, r]; log('admin.role', r.name); break
    }
    case 'upsertRoom': {
      need(isAdmin(actor) || hasPortal(actor, 'manager', 'senior'), 'Senior managers only'); need(validId(a.room.id), 'Invalid id')
      const r: Room = { id: a.room.id, propertyId: P, number: str(a.room.number, 12, 'Room').trim() || fail('Room number required'), floor: Number(a.room.floor) || 0, wing: str(a.room.wing ?? '', 40, 'Wing'), yesterdayAttendantId: a.room.yesterdayAttendantId }
      need(!s.rooms.some((x) => x.number === r.number && x.id !== r.id), `Room ${r.number} already exists`)
      s.rooms = s.rooms.some((x) => x.id === r.id) ? s.rooms.map((x) => (x.id === r.id ? r : x)) : [...s.rooms, r]; break
    }
    case 'deleteRoom': {
      need(isAdmin(actor) || hasPortal(actor, 'manager', 'senior'), 'Senior managers only')
      need(!s.tasks.some((t) => t.roomId === a.roomId && t.status !== 'done'), 'This room has open jobs'); s.rooms = s.rooms.filter((r) => r.id !== a.roomId); break
    }
    case 'upsertShift': {
      need(isAdmin(actor) || hasPortal(actor, 'manager', 'senior'), 'Senior managers only'); need(validId(a.shift.id), 'Invalid id')
      need(/^\d{2}:\d{2}$/.test(a.shift.start) && /^\d{2}:\d{2}$/.test(a.shift.end), 'Times are HH:MM')
      const sh: Shift = { ...a.shift, propertyId: P, name: str(a.shift.name, 40, 'Name'), staffTarget: Math.max(0, Math.floor(a.shift.staffTarget)), memberIds: a.shift.memberIds.filter((id) => s.people.some((p) => p.id === id)) }
      s.shifts = s.shifts.some((x) => x.id === sh.id) ? s.shifts.map((x) => (x.id === sh.id ? sh : x)) : [...s.shifts, sh]; log('admin.shift', sh.name); break
    }
    case 'deleteShift': {
      need(isAdmin(actor), 'Property admins only'); need(!s.tasks.some((t) => t.shiftId === a.shiftId && t.status !== 'done'), 'This shift has open jobs')
      s.shifts = s.shifts.filter((x) => x.id !== a.shiftId); break
    }
    case 'upsertPerson': {
      need(isAdmin(actor), 'Property admins only'); need(validId(a.person.id), 'Invalid id')
      const name = str(a.person.name, 80, 'Name').trim(); need(name, 'Name required'); need(s.jobRoles.some((r) => r.id === a.person.jobRoleId), 'Choose a job role')
      const p: Person = { id: a.person.id, propertyId: P, name, initials: initials(name), jobRoleId: a.person.jobRoleId, title: str(a.person.title, 80, 'Title') || s.jobRoles.find((r) => r.id === a.person.jobRoleId)!.name,
        catalogue: a.person.catalogue?.length ? a.person.catalogue : ['pilot', 'whole'] }
      s.people = s.people.some((x) => x.id === p.id) ? s.people.map((x) => (x.id === p.id ? p : x)) : [...s.people, p]; log('admin.person', p.name); break
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

/** What an actor may read. Enforced on the server; compliance data needs Senior manager. */
export function viewFor(s: State, a: Actor): State {
  const mgr = hasPortal(a, 'manager'), senior = hasPortal(a, 'manager', 'senior') || isAdmin(a), auth = hasPortal(a, 'author')
  const me = a.personId
  const mine = <T extends { personId: string }>(xs: T[]) => xs.filter((x) => x.personId === me)
  return {
    property: s.property, jobRoles: s.jobRoles, people: s.people, rooms: s.rooms, shifts: s.shifts, sops: s.sops,
    sopVersions: auth ? s.sopVersions.filter((v) => v.status !== 'draft' || v.authorId === me) : s.sopVersions.filter((v) => v.status === 'published' || v.status === 'superseded'),
    tasks: mgr || auth ? s.tasks : mine(s.tasks),
    ackEvents: senior ? s.ackEvents : mgr || auth ? s.ackEvents.filter((x) => x.kind === 'notice' || x.personId === me || auth) : mine(s.ackEvents),
    notices: mgr ? s.notices : s.notices.filter((n) => n.sentAt && n.recipientIds.includes(me)),
    attendance: mgr ? s.attendance : mine(s.attendance),
    cover: mgr ? s.cover : mine(s.cover),
    feedback: auth ? s.feedback : s.feedback.filter((f) => f.fromId === me),
    joinRequests: mgr ? s.joinRequests : [],
    issues: mgr ? s.issues : mine(s.issues),
    audit: senior ? s.audit.slice(0, 2000) : auth ? s.audit.filter((x) => x.action.startsWith('sop.')).slice(0, 500) : mgr ? s.audit.filter((x) => x.action.startsWith('task.')).slice(0, 200) : [],
  }
}

export type { CoverKind }
