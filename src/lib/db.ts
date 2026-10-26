// Local demo backend. Mirrors the Firestore collections one-to-one (see firestore.rules) and is
// persisted to localStorage so every portal sees the same live data; components subscribe to it
// the way they would to Firestore snapshot listeners.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildSeed, type Seed } from './seed'
import type { AttendanceMark, CoverItem, FeedbackLane, Issue, IssueCategory, IssueSeverity, IssueStatus, Notice, Priority, ReviewDecision, SopStep, SopVersion, Task } from './types'
import { hotelDateKey, iso } from './time'

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const nowIso = () => iso(Date.now())

/** Queued writes made while the hotel connection is down; flushed on reconnect. */
type OutboxItem = { id: string; kind: 'step' | 'checkin'; taskId?: string; stepId?: string; at: string }

interface Connection { hotel: 'online' | 'offline'; checkin: 'ok' | 'attention' }

export const APPROVALS_REQUIRED = 2

interface Actions {
  reset: () => void
  setConnection: (c: Partial<Connection>) => void
  flushOutbox: () => void
  log: (actorId: string, action: string, detail: string) => void

  startTask: (taskId: string) => void
  toggleStep: (taskId: string, stepId: string) => void
  attachPhoto: (taskId: string, stepId: string) => void
  requestVerification: (taskId: string) => void
  verifyTask: (taskId: string, actorId: string) => void
  markUrgentSeen: (taskId: string) => void
  /** Raises an incident (from a room or free-standing). Returns the created issue. */
  reportIssue: (taskId: string | null, personId: string, text: string, o?: { category?: IssueCategory; severity?: IssueSeverity; title?: string; roomId?: string }) => Issue
  updateIssue: (id: string, actorId: string, patch: { status?: IssueStatus; assignedToId?: string | null; note?: string; severity?: IssueSeverity }) => void
  /** Verifier sends a room back to the employee with a reason. */
  returnTask: (taskId: string, actorId: string, note: string) => boolean
  cancelTask: (taskId: string, actorId: string, reason: string) => boolean
  /** Moves a not-yet-finished room to another person; progress is kept. */
  reassignTask: (taskId: string, personId: string, actorId: string) => boolean
  checkIn: (personId: string, mark?: AttendanceMark) => void
  endShift: (personId: string, early: boolean) => void

  openRef: (personId: string, kind: 'sop' | 'notice', refId: string) => void
  acknowledge: (personId: string, kind: 'sop' | 'notice', refId: string, reply?: string) => void

  assignTask: (t: Pick<Task, 'shiftId' | 'personId' | 'roomId' | 'start' | 'end' | 'priority' | 'assignedById'> & { sopId: string; notes?: string }) => Task | null
  /** Why a room can't take this assignment right now, or null when it can. */
  assignBlocker: (t: { sopId: string; roomId: string; shiftId: string; start: string }) => string | null
  bulkAssign: (items: (Pick<Task, 'shiftId' | 'personId' | 'roomId' | 'start' | 'end' | 'priority' | 'assignedById'> & { sopId: string; notes?: string })[]) => { created: Task[]; skipped: { roomId: string; reason: string }[] }
  setTaskMode: (taskId: string, mode: Task['mode']) => void
  decideCover: (id: string, status: CoverItem['status']) => void
  approveBackup: (o: { shiftId: string; date: string; personId: string; backupId: string }) => void
  sendNotice: (n: Omit<Notice, 'id' | 'propertyId' | 'sentAt' | 'sample'> & { sentById: string }) => void
  decideJoin: (id: string, status: 'approved' | 'declined') => void

  saveDraft: (v: SopVersion) => SopVersion
  newDraftFrom: (versionId: string | null, authorId: string, seedNote?: { feedbackId: string; text: string; stepId?: string }) => SopVersion
  deleteDraft: (versionId: string) => void
  submitForReview: (versionId: string) => void
  review: (versionId: string, d: Omit<ReviewDecision, 'id' | 'at'>) => void
  release: (versionId: string, actorId: string) => string | null
  addFeedback: (lane: FeedbackLane, sopVersionId: string, fromId: string, text: string, o?: { stepId?: string; rating?: number }) => void
  resolveFeedback: (id: string) => void
  retireSop: (sopId: string, actorId: string) => void
  restoreSop: (sopId: string, actorId: string) => void
}

export type DB = Seed & { connection: Connection; outbox: OutboxItem[]; seededFor: string } & Actions

export function proposeVersion(draft: SopVersion, base: SopVersion | undefined): { label: string; structural: boolean } {
  if (!base) return { label: '1.0', structural: true }
  const [maj, min] = base.version.split('.').map(Number)
  const structural =
    draft.steps.length !== base.steps.length ||
    draft.timeTargetMin !== base.timeTargetMin ||
    draft.steps.some((s, i) => s.requireCheck !== base.steps[i]?.requireCheck)
  return { label: structural ? `${maj + 1}.0` : `${maj}.${min + 1}`, structural }
}

export const useDB = create<DB>()(
  persist(
    (set, get) => {
      const patchTask = (id: string, fn: (t: Task) => Partial<Task>) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)) }))
      const offline = () => get().connection.hotel === 'offline'

      return {
        ...buildSeed(),
        connection: { hotel: 'online', checkin: 'ok' },
        outbox: [],
        seededFor: hotelDateKey(),

        reset: () => set({ ...buildSeed(), connection: { hotel: 'online', checkin: 'ok' }, outbox: [], seededFor: hotelDateKey() }),
        setConnection: (c) => {
          set((s) => ({ connection: { ...s.connection, ...c } }))
          if (c.hotel === 'online') get().flushOutbox()
        },
        flushOutbox: () => set({ outbox: [] }),
        log: (actorId, action, detail) =>
          set((s) => ({ audit: [{ id: uid('au'), propertyId: s.properties[0].id, actorId, action, detail, at: nowIso() }, ...s.audit] })),

        startTask: (id) => {
          if (get().tasks.find((x) => x.id === id)?.status !== 'scheduled') return
          patchTask(id, () => ({ status: 'in_progress', startedAt: nowIso() }))
          const t = get().tasks.find((x) => x.id === id)
          if (t) get().log(t.personId, 'task.started', id)
        },
        toggleStep: (id, stepId) => {
          if (get().tasks.find((x) => x.id === id)?.status !== 'in_progress') return
          // Optimistic: the tick lands immediately; if offline it is also queued for sync.
          patchTask(id, (t) => ({
            doneStepIds: t.doneStepIds.includes(stepId) ? t.doneStepIds.filter((x) => x !== stepId) : [...t.doneStepIds, stepId],
          }))
          if (offline()) set((s) => ({ outbox: [...s.outbox, { id: uid('ob'), kind: 'step', taskId: id, stepId, at: nowIso() }] }))
        },
        attachPhoto: (id, stepId) => patchTask(id, (t) => ({ photoStepIds: [...new Set([...t.photoStepIds, stepId])] })),
        requestVerification: (id) => {
          const t = get().tasks.find((x) => x.id === id)
          const v = t && get().sopVersions.find((x) => x.id === t.sopVersionId)
          if (!t || !v || t.status !== 'in_progress') return
          const required = t.mode === 'standard' ? v.steps.filter((s, i) => s.requireCheck || i === v.steps.length - 1) : v.steps
          if (!required.every((s) => t.doneStepIds.includes(s.id))) return
          // Only SOPs with recorded checks need an independent verifier; the rest finish here.
          if (v.steps.some((s) => s.requireCheck)) {
            patchTask(id, () => ({ status: 'awaiting_verification', returned: undefined }))
            get().log(t.personId, 'task.verification_requested', id)
          } else {
            patchTask(id, () => ({ status: 'done', completedAt: nowIso(), returned: undefined }))
            get().log(t.personId, 'task.completed', id)
          }
        },
        verifyTask: (id, actorId) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t || t.status !== 'awaiting_verification' || t.personId === actorId) return
          patchTask(id, () => ({ status: 'done', completedAt: nowIso(), verifiedById: actorId, verifiedAt: nowIso() }))
          get().log(actorId, 'task.verified', id)
        },
        markUrgentSeen: (id) => patchTask(id, (t) => ({ urgentEnded: t.urgentEnded && { ...t.urgentEnded, seen: true } })),
        reportIssue: (taskId, personId, text, o = {}) => {
          const t = taskId ? get().tasks.find((x) => x.id === taskId) : undefined
          const at = nowIso()
          const issue: Issue = {
            id: uid('is'), propertyId: get().properties[0].id, taskId: taskId ?? undefined, roomId: o.roomId ?? t?.roomId, reportedById: personId,
            category: o.category ?? 'other', severity: o.severity ?? 'medium', title: (o.title ?? text).slice(0, 80), text,
            status: 'open', at, updates: [{ at, byId: personId, text: 'Reported', status: 'open' }],
          }
          set((s) => ({ issues: [issue, ...s.issues] }))
          get().log(personId, 'issue.reported', `${issue.title}${t ? ` · ${taskId}` : ''}`)
          return issue
        },
        updateIssue: (id, actorId, { status, assignedToId, note, severity }) => {
          const at = nowIso()
          set((s) => ({
            issues: s.issues.map((i) => i.id !== id ? i : {
              ...i, ...(status ? { status } : {}), ...(severity ? { severity } : {}),
              ...(assignedToId !== undefined ? { assignedToId: assignedToId ?? undefined } : {}),
              ...(status === 'resolved' ? { resolvedAt: at, resolvedById: actorId } : status ? { resolvedAt: undefined, resolvedById: undefined } : {}),
              updates: [...i.updates, { at, byId: actorId, text: note || (status ? `Status → ${status.replace('_', ' ')}` : assignedToId !== undefined ? 'Reassigned' : 'Updated'), status }],
            }),
          }))
          get().log(actorId, `issue.${status ?? 'updated'}`, id)
        },
        returnTask: (id, actorId, note) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t || t.status !== 'awaiting_verification' || t.personId === actorId || !note.trim()) return false
          patchTask(id, () => ({ status: 'in_progress', returned: { byId: actorId, at: nowIso(), note: note.trim() } }))
          get().log(actorId, 'task.returned', `${id}: ${note.trim()}`)
          return true
        },
        cancelTask: (id, actorId, reason) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t || t.status === 'done' || t.status === 'cancelled') return false
          patchTask(id, () => ({ status: 'cancelled', cancelled: { byId: actorId, at: nowIso(), reason } }))
          get().log(actorId, 'task.cancelled', `${id}: ${reason}`)
          return true
        },
        reassignTask: (id, personId, actorId) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t || t.status === 'done' || t.status === 'cancelled' || t.personId === personId) return false
          patchTask(id, () => ({ personId, assignedById: actorId }))
          get().log(actorId, 'task.reassigned', `${id} → ${personId}`)
          return true
        },
        checkIn: (personId, mark = 'checkin') => {
          if (offline()) {
            set((s) => ({ connection: { ...s.connection, checkin: 'attention' }, outbox: [...s.outbox, { id: uid('ob'), kind: 'checkin', at: nowIso() }] }))
            return
          }
          const date = hotelDateKey()
          set((s) => ({
            attendance: [...s.attendance.filter((a) => !(a.personId === personId && a.date === date)),
              { id: uid('at'), propertyId: s.properties[0].id, personId, date, mark, at: nowIso() }],
            connection: { ...s.connection, checkin: 'ok' },
          }))
          get().log(personId, 'attendance.checkin', date)
        },
        endShift: (personId, early) => {
          const live = get().tasks.find((t) => t.personId === personId)?.shiftId ?? 'morning'
          set((s) => ({
            cover: [...s.cover, { id: uid('c'), propertyId: s.properties[0].id, kind: early ? 'early_departure' : 'ended', personId, shiftId: live,
              date: hotelDateKey(), note: early ? 'Went early from the Employee app' : 'Ended shift from the Employee app', status: early ? 'pending' : 'approved' }],
          }))
          get().log(personId, early ? 'shift.went_early' : 'shift.ended', live)
        },

        openRef: (personId, kind, refId) =>
          set((s) => {
            const ex = s.ackEvents.find((a) => a.personId === personId && a.kind === kind && a.refId === refId)
            if (ex?.openedAt) return {}
            const ev = ex ? { ...ex, openedAt: nowIso() } : { id: uid('ack'), propertyId: s.properties[0].id, personId, kind, refId, openedAt: nowIso(), acknowledgedAt: null }
            return { ackEvents: ex ? s.ackEvents.map((a) => (a.id === ex.id ? ev : a)) : [...s.ackEvents, ev] }
          }),
        acknowledge: (personId, kind, refId, reply) => {
          get().openRef(personId, kind, refId)
          set((s) => ({
            ackEvents: s.ackEvents.map((a) =>
              a.personId === personId && a.kind === kind && a.refId === refId
                ? { ...a, acknowledgedAt: a.acknowledgedAt ?? nowIso(), ...(reply !== undefined ? { repliedAt: nowIso(), reply } : {}) }
                : a),
          }))
          get().log(personId, `${kind}.acknowledged`, refId)
        },

        assignBlocker: ({ sopId, roomId, shiftId, start }) => {
          const sop = get().sops.find((s) => s.id === sopId)
          if (!sop?.currentVersionId) return 'This SOP has no published version'
          if (sop.retiredAt) return 'This SOP is retired'
          const v = get().sopVersions.find((x) => x.id === sop.currentVersionId)
          if (v?.status !== 'published') return 'This SOP has no published version'
          const room = get().rooms.find((r) => r.id === roomId)
          if (room?.occupancy === 'out_of_order') return `Room ${room.number} is out of order`
          // One open task per room per shift.
          if (get().tasks.some((x) => x.roomId === roomId && x.shiftId === shiftId && x.status !== 'done' && x.status !== 'cancelled' && hotelDateKey(x.start) === hotelDateKey(start)))
            return `Room ${room?.number ?? roomId} already has open work on this shift`
          return null
        },
        bulkAssign: (items) => {
          const created: Task[] = [], skipped: { roomId: string; reason: string }[] = []
          for (const it of items) {
            const why = get().assignBlocker(it)
            if (why) { skipped.push({ roomId: it.roomId, reason: why }); continue }
            const t = get().assignTask(it)
            if (t) created.push(t); else skipped.push({ roomId: it.roomId, reason: 'Could not be assigned' })
          }
          return { created, skipped }
        },
        assignTask: ({ sopId, ...t }) => {
          if (get().assignBlocker({ sopId, roomId: t.roomId, shiftId: t.shiftId, start: t.start })) return null
          const sop = get().sops.find((s) => s.id === sopId)!
          const task: Task = {
            ...t, id: uid('t'), propertyId: get().properties[0].id, sopVersionId: sop.currentVersionId!, status: 'scheduled',
            doneStepIds: [], photoStepIds: [], mode: 'guided', reviewedVersionConfirmed: true,
          }
          set((s) => ({ tasks: [...s.tasks, task] }))
          get().log(t.assignedById, 'task.assigned', `${t.roomId} → ${t.personId} (${sop.currentVersionId})`)
          return task
        },
        setTaskMode: (id, mode) => patchTask(id, () => ({ mode })),
        decideCover: (id, status) => set((s) => ({ cover: s.cover.map((c) => (c.id === id ? { ...c, status } : c)) })),
        approveBackup: ({ shiftId, date, personId, backupId }) => {
          set((s) => ({
            cover: [...s.cover, { id: uid('c'), propertyId: s.properties[0].id, kind: 'backup', personId, backupId, shiftId, date, note: 'Backup approved', status: 'approved' }],
            shifts: s.shifts.map((sh) => (sh.id === shiftId ? { ...sh, memberIds: [...new Set([...sh.memberIds.filter((m) => m !== personId), backupId])] } : sh)),
          }))
          get().log('elena', 'cover.backup_approved', `${backupId} covers ${personId} on ${shiftId} ${date}`)
        },
        sendNotice: (n) => {
          const notice: Notice = { ...n, id: uid('n'), propertyId: get().properties[0].id, sentAt: nowIso(), sample: false }
          set((s) => ({ notices: [notice, ...s.notices] }))
          get().log(n.sentById, 'notice.sent', `${n.title} → ${n.recipientIds.length}`)
        },
        decideJoin: (id, status) => set((s) => ({ joinRequests: s.joinRequests.map((j) => (j.id === id ? { ...j, status } : j)) })),

        saveDraft: (v) => {
          const next = { ...v, updatedAt: nowIso() }
          set((s) => ({ sopVersions: s.sopVersions.some((x) => x.id === v.id) ? s.sopVersions.map((x) => (x.id === v.id ? next : x)) : [...s.sopVersions, next] }))
          return next
        },
        newDraftFrom: (versionId, authorId, seedNote) => {
          const base = versionId ? get().sopVersions.find((v) => v.id === versionId) : undefined
          const sopId = base?.sopId ?? uid('sop')
          const d: SopVersion = {
            id: uid('v'), sopId, propertyId: get().properties[0].id, version: base ? proposeVersion(base, base).label : '1.0', baseVersionId: base?.id ?? null,
            status: 'draft', title: base?.title ?? '', code: base?.code ?? '', jobRoleId: base?.jobRoleId ?? 'room-attendant', language: base?.language ?? 'English',
            tags: base?.tags ?? [], timeTargetMin: base?.timeTargetMin ?? 15,
            steps: base ? base.steps.map((s) => ({ ...s, guestCare: seedNote && s.id === seedNote.stepId ? `${s.guestCare}\n[Feedback] ${seedNote.text}`.trim() : s.guestCare }))
              : [{ id: uid('st'), icon: 'check', instruction: '', guestCare: '', requireCheck: false, allowPhoto: false } satisfies SopStep],
            authorId, createdAt: nowIso(), updatedAt: nowIso(), reviews: [], catalogue: base?.catalogue ?? ['pilot', 'whole'],
          }
          set((s) => ({ sopVersions: [...s.sopVersions, d] }))
          if (seedNote) get().resolveFeedback(seedNote.feedbackId)
          return d
        },
        deleteDraft: (id) => set((s) => ({ sopVersions: s.sopVersions.filter((v) => !(v.id === id && v.status === 'draft')) })),
        submitForReview: (id) => {
          set((s) => ({
            sopVersions: s.sopVersions.map((v) => {
              if (v.id !== id) return v
              const base = s.sopVersions.find((b) => b.id === v.baseVersionId)
              return { ...v, status: 'in_review', submittedAt: nowIso(), reviews: [], version: proposeVersion(v, base).label }
            }),
            sops: s.sops.some((x) => x.id === s.sopVersions.find((v) => v.id === id)?.sopId) ? s.sops
              : [...s.sops, (() => { const v = s.sopVersions.find((x) => x.id === id)!; return { id: v.sopId, propertyId: v.propertyId, code: v.code, currentVersionId: null } })()],
          }))
          const v = get().sopVersions.find((x) => x.id === id)!
          get().log(v.authorId, 'sop.submitted', `${v.code} ${v.version}`)
        },
        review: (id, d) => {
          set((s) => ({
            sopVersions: s.sopVersions.map((v) => {
              if (v.id !== id || d.reviewerId === v.authorId) return v // authors never review their own version
              const reviews = [...v.reviews.filter((r) => !(r.reviewerId === d.reviewerId && !r.stepId && !d.stepId)), { ...d, id: uid('rv'), at: nowIso() }]
              const status = d.stepId ? v.status : d.decision === 'reject' ? 'rejected' : d.decision === 'request_changes' ? 'changes_requested' : v.status === 'changes_requested' ? 'in_review' : v.status
              return { ...v, reviews, status }
            }),
          }))
          get().log(d.reviewerId, `sop.review.${d.decision}`, id)
        },
        release: (id, actorId) => {
          const v = get().sopVersions.find((x) => x.id === id)
          if (!v || v.status !== 'in_review') return null
          const approvers = new Set(v.reviews.filter((r) => r.decision === 'approve' && !r.stepId && r.reviewerId !== v.authorId).map((r) => r.reviewerId))
          if (approvers.size < APPROVALS_REQUIRED) return null
          const sop = get().sops.find((s) => s.id === v.sopId)
          const current = get().sopVersions.find((x) => x.id === sop?.currentVersionId)
          const label = proposeVersion(v, current).label
          const at = nowIso()
          // In-flight tasks keep their pinned sopVersionId; only new assignments pick this up.
          set((s) => ({
            sopVersions: s.sopVersions.map((x) =>
              x.id === id ? { ...x, status: 'published', version: label, publishedAt: at, effectiveAt: at }
                : x.id === current?.id ? { ...x, status: 'superseded' } : x),
            sops: s.sops.map((x) => (x.id === v.sopId ? { ...x, currentVersionId: id } : x)),
          }))
          get().log(actorId, 'sop.released', `${v.code} ${label}`)
          return label
        },
        addFeedback: (lane, sopVersionId, fromId, text, o = {}) =>
          set((s) => ({ feedback: [{ id: uid('f'), propertyId: s.properties[0].id, lane, sopVersionId, fromId, text, at: nowIso(), status: 'open', ...o }, ...s.feedback] })),
        resolveFeedback: (id) => set((s) => ({ feedback: s.feedback.map((f) => (f.id === id ? { ...f, status: 'done' } : f)) })),
        retireSop: (sopId, actorId) => {
          set((s) => ({ sops: s.sops.map((x) => (x.id === sopId ? { ...x, retiredAt: nowIso(), retiredById: actorId } : x)) }))
          get().log(actorId, 'sop.retired', get().sops.find((x) => x.id === sopId)?.code ?? sopId)
        },
        restoreSop: (sopId, actorId) => {
          set((s) => ({ sops: s.sops.map((x) => (x.id === sopId ? { ...x, retiredAt: undefined, retiredById: undefined } : x)) }))
          get().log(actorId, 'sop.restored', get().sops.find((x) => x.id === sopId)?.code ?? sopId)
        },
      }
    },
    {
      name: 'mise-db-v3',
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { connection: _c, ...rest } = s
        return rest
      },
    },
  ),
)

// The shared demo re-seeds each hotel day so Today always has live work in it.
if (useDB.getState().seededFor !== hotelDateKey()) useDB.getState().reset()

// Cross-tab "real-time": another tab's write lands here without a reload.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === 'mise-db-v3') useDB.persist.rehydrate() })
  window.addEventListener('online', () => useDB.getState().setConnection({ hotel: 'online' }))
  window.addEventListener('offline', () => useDB.getState().setConnection({ hotel: 'offline' }))
}

// Selectors
export const byId = <T extends { id: string }>(xs: T[], id?: string | null) => xs.find((x) => x.id === id)
export const priorityLabel: Record<Priority, string> = { standard: 'Standard priority', high: 'High priority', urgent: 'Urgent priority' }
