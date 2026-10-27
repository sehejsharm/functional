// Author-portal data helpers: selectors over the shared store, plus the few mutations the shared store doesn't
// have (duplicate an SOP, keep the library record in step with a draft, link feedback to the revision it started).
// Every mutation writes to the audit trail.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { APPROVALS_REQUIRED, byId, useDB, type DB } from '@/lib/db'
import { hotelDateKey } from '@/lib/time'
import type { AuditEntry, Feedback, Sop, SopStep, SopVersion, VersionStatus } from '@/lib/types'

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`
const nowIso = () => new Date().toISOString()
const DAY = 86_400_000

// ── Selectors ────────────────────────────────────────────────────────────────

/** Independent approvals: overall decisions (not step comments) by anyone other than the author. */
export const approversOf = (v: SopVersion) =>
  [...new Set(v.reviews.filter((r) => r.decision === 'approve' && !r.stepId && r.reviewerId !== v.authorId).map((r) => r.reviewerId))]
export const approvalCount = (v: SopVersion) => approversOf(v).length
export const quorumMet = (v: SopVersion) => approvalCount(v) >= APPROVALS_REQUIRED

export const OPEN: VersionStatus[] = ['draft', 'changes_requested', 'in_review']
const ORDER: Record<VersionStatus, number> = { published: 0, superseded: 1, rejected: 2, in_review: 3, changes_requested: 4, draft: 5 }

export function versionsOf(s: Pick<DB, 'sopVersions'>, sopId: string) {
  return s.sopVersions.filter((v) => v.sopId === sopId).sort((a, b) => (b.createdAt.localeCompare(a.createdAt)) || ORDER[a.status] - ORDER[b.status])
}
export const currentOf = (s: Pick<DB, 'sops' | 'sopVersions'>, sopId: string) => {
  const sop = byId(s.sops, sopId)
  const v = byId(s.sopVersions, sop?.currentVersionId)
  return v?.status === 'published' ? v : undefined
}
/** The revision in flight for an SOP, if any (draft, changes requested or in review). */
export const openRevisionOf = (s: Pick<DB, 'sopVersions'>, sopId: string) =>
  versionsOf(s, sopId).find((v) => OPEN.includes(v.status))

export type RowStatus = 'published' | 'in_review' | 'changes_requested' | 'draft' | 'rejected' | 'retired'
export interface SopRow {
  sopId: string; sop?: Sop; code: string; title: string; department: string; roleId: string
  current?: SopVersion; latest: SopVersion; open?: SopVersion
  status: RowStatus; version: string; authorId: string; updatedAt: string
  tasks14: number; ack: { acked: number; audience: number; pct: number | null }
  flags: { published: boolean; inReview: boolean; draft: boolean; retired: boolean }
}

export function ackRate(s: Pick<DB, 'ackEvents' | 'people'>, v: SopVersion | undefined) {
  if (!v) return { acked: 0, audience: 0, pct: null as number | null }
  const audience = s.people.filter((p) => p.jobRoleId === v.jobRoleId && p.status !== 'inactive')
  const acked = audience.filter((p) => s.ackEvents.some((a) => a.kind === 'sop' && a.refId === v.id && a.personId === p.id && a.acknowledgedAt)).length
  return { acked, audience: audience.length, pct: audience.length ? Math.round((acked / audience.length) * 100) : null }
}

export function departmentOf(s: Pick<DB, 'sops' | 'jobRoles'>, sopId: string, roleId: string) {
  return byId(s.sops, sopId)?.department ?? s.jobRoles.find((r) => r.id === roleId)?.team ?? 'Unassigned'
}

export function sopRows(s: DB, now = Date.now()): SopRow[] {
  const ids = [...new Set([...s.sops.map((x) => x.id), ...s.sopVersions.map((v) => v.sopId)])]
  return ids.flatMap((sopId) => {
    const all = versionsOf(s, sopId)
    if (!all.length) return []
    const sop = byId(s.sops, sopId)
    const current = currentOf(s, sopId)
    const open = all.find((v) => OPEN.includes(v.status))
    const latest = all[0]
    const shown = current ?? open ?? latest
    const status: RowStatus = sop?.retiredAt ? 'retired' : current ? 'published'
      : (open?.status ?? (latest.status === 'rejected' ? 'rejected' : 'draft')) as RowStatus
    const vids = new Set(all.map((v) => v.id))
    const tasks14 = s.tasks.filter((t) => vids.has(t.sopVersionId) && t.status !== 'cancelled' && Date.parse(t.start) > now - 14 * DAY && Date.parse(t.start) <= now).length
    const updatedAt = all.reduce((m, v) => (v.updatedAt > m ? v.updatedAt : m), sop?.retiredAt ?? '')
    return [{
      sopId, sop, code: shown.code || sop?.code || 'No code', title: shown.title || 'Untitled SOP', department: departmentOf(s, sopId, shown.jobRoleId), roleId: shown.jobRoleId,
      current, latest, open, status, version: shown.version, authorId: shown.authorId, updatedAt, tasks14, ack: ackRate(s, current),
      flags: { published: !!current && !sop?.retiredAt, inReview: all.some((v) => v.status === 'in_review'), draft: all.some((v) => v.status === 'draft' || v.status === 'changes_requested'), retired: !!sop?.retiredAt },
    }]
  })
}

/** Tasks currently pinned to a version that haven't finished (they keep that version after a release). */
export const pinnedTasks = (s: Pick<DB, 'tasks'>, versionId: string | undefined) =>
  versionId ? s.tasks.filter((t) => t.sopVersionId === versionId && (t.status === 'scheduled' || t.status === 'in_progress' || t.status === 'awaiting_verification')) : []

// ── Author-local links: which feedback started which revision ────────────────

interface Links { byDraft: Record<string, string[]>; link: (draftId: string, feedbackId: string) => void; unlink: (draftId: string, feedbackId: string) => void }
export const useRevisionLinks = create<Links>()(persist((set) => ({
  byDraft: {},
  link: (d, f) => set((s) => ({ byDraft: { ...s.byDraft, [d]: [...new Set([...(s.byDraft[d] ?? []), f])] } })),
  unlink: (d, f) => set((s) => ({ byDraft: { ...s.byDraft, [d]: (s.byDraft[d] ?? []).filter((x) => x !== f) } })),
}), { name: 'mise-author-links-v1' }))

// ── Mutations ────────────────────────────────────────────────────────────────

const db = () => useDB.getState()

/** Saves a draft and keeps the library record (code, department) in step. Returns the saved version. */
export function saveSopDraft(v: SopVersion, actorId: string, department?: string, created = false): SopVersion {
  const s = db()
  const saved = s.saveDraft(v)
  useDB.setState((st) => {
    const sop = byId(st.sops, v.sopId)
    if (!sop) return { sops: [...st.sops, { id: v.sopId, propertyId: v.propertyId, code: v.code, currentVersionId: null, department: department || undefined }] }
    return { sops: st.sops.map((x) => (x.id !== v.sopId ? x : { ...x, department: department || x.department, code: x.currentVersionId ? x.code : v.code || x.code })) }
  })
  s.log(actorId, created ? 'sop.draft_created' : 'sop.draft_saved', `${v.code || 'Untitled'} ${v.version}`)
  return saved
}

/** Opens the author's existing draft of this SOP, or starts a revision from its current published version. */
export function startRevision(sopId: string, actorId: string): { version: SopVersion; reused: boolean } | { blocked: SopVersion } {
  const s = db()
  const open = openRevisionOf(s, sopId)
  if (open && (open.status === 'draft' || open.status === 'changes_requested') && open.authorId === actorId) return { version: open, reused: true }
  if (open?.status === 'in_review') return { blocked: open }
  const cur = currentOf(s, sopId)
  if (cur) {
    const d = s.newDraftFrom(cur.id, actorId)
    s.log(actorId, 'sop.revision_started', `${d.code} ${d.version} from ${cur.version}`)
    return { version: d, reused: false }
  }
  // Never published (e.g. a rejected first version): rework it as a fresh 1.0 of the same SOP.
  const src = versionsOf(s, sopId)[0]
  const at = nowIso()
  const d: SopVersion = src ? {
    ...src, id: uid('v'), version: '1.0', baseVersionId: null, status: 'draft', authorId: actorId, createdAt: at, updatedAt: at, reviews: [],
    submittedAt: undefined, publishedAt: undefined, effectiveAt: undefined,
  } : s.newDraftFrom(null, actorId)
  if (src) useDB.setState((st) => ({ sopVersions: [...st.sopVersions, d] }))
  s.log(actorId, 'sop.revision_started', `${d.code} ${d.version} reworked`)
  return { version: d, reused: false }
}

/** Copies an SOP's latest content into a brand-new SOP (fresh id and a code suffix), as a 1.0 draft. */
export function duplicateSop(sopId: string, actorId: string): SopVersion | null {
  const s = db()
  const src = currentOf(s, sopId) ?? versionsOf(s, sopId)[0]
  if (!src) return null
  const taken = new Set([...s.sops.map((x) => x.code), ...s.sopVersions.map((v) => v.code)].map((c) => c.toUpperCase()))
  let n = 2, code = `${src.code}-${n}`
  while (taken.has(code.toUpperCase())) code = `${src.code}-${++n}`
  const at = nowIso()
  const d: SopVersion = {
    ...src, id: uid('v'), sopId: uid('sop'), version: '1.0', baseVersionId: null, status: 'draft', code, title: `${src.title} (copy)`,
    steps: src.steps.map((st): SopStep => ({ ...st, id: uid('st') })), authorId: actorId, createdAt: at, updatedAt: at, reviews: [],
    submittedAt: undefined, publishedAt: undefined, effectiveAt: undefined,
  }
  const department = byId(s.sops, sopId)?.department
  useDB.setState((st) => ({ sopVersions: [...st.sopVersions, d], sops: [...st.sops, { id: d.sopId, propertyId: d.propertyId, code, currentVersionId: null, department }] }))
  s.log(actorId, 'sop.duplicated', `${src.code} ${src.version} → ${code} 1.0`)
  return d
}

/** Deletes a draft; a brand-new SOP that only ever had this draft leaves the library too. */
export function deleteSopDraft(versionId: string, actorId: string) {
  const s = db()
  const v = byId(s.sopVersions, versionId)
  if (!v || v.status !== 'draft') return false
  s.deleteDraft(versionId)
  useDB.setState((st) => (st.sopVersions.some((x) => x.sopId === v.sopId) ? {} : { sops: st.sops.filter((x) => x.id !== v.sopId) }))
  s.log(actorId, 'sop.draft_deleted', `${v.code || 'Untitled'} ${v.version}`)
  return true
}

/**
 * Starts (or reuses) a revision from a feedback item. The note lands on the step it was about, marked
 * "[Feedback]" so the author resolves it before sending for review; the item is marked done.
 */
export function startRevisionWithFeedback(f: Feedback, actorId: string): { version: SopVersion; reused: boolean } | { blocked: SopVersion } | null {
  const s = db()
  const fv = byId(s.sopVersions, f.sopVersionId)
  if (!fv) return null
  const open = openRevisionOf(s, fv.sopId)
  if (open?.status === 'in_review') return { blocked: open }
  let version: SopVersion, reused = false
  if (open && open.authorId === actorId) {
    reused = true
    version = s.saveDraft({ ...open, steps: open.steps.map((st) => (st.id === f.stepId ? { ...st, guestCare: `${st.guestCare}\n[Feedback] ${f.text}`.trim() } : st)) })
    s.resolveFeedback(f.id)
  } else {
    const from = currentOf(s, fv.sopId) ?? fv
    version = s.newDraftFrom(from.id, actorId, { feedbackId: f.id, text: f.text, stepId: f.stepId })
    s.log(actorId, 'sop.revision_started', `${version.code} ${version.version} from feedback`)
  }
  useRevisionLinks.getState().link(version.id, f.id)
  s.log(actorId, 'feedback.applied', `${fv.code}: ${f.text.slice(0, 60)}`)
  return { version, reused }
}

export function markFeedbackDone(f: Feedback, actorId: string) {
  const s = db()
  s.resolveFeedback(f.id)
  s.log(actorId, 'feedback.resolved', `${byId(s.sopVersions, f.sopVersionId)?.code ?? ''}: ${f.text.slice(0, 60)}`)
}
export function reopenFeedback(id: string) {
  useDB.setState((st) => ({ feedback: st.feedback.map((x) => (x.id === id ? { ...x, status: 'open' } : x)) }))
}

// ── Audit trail, humanised ───────────────────────────────────────────────────

const ACTIONS: Record<string, string> = {
  'sop.submitted': 'Sent for review', 'sop.review.approve': 'Approved a version', 'sop.review.request_changes': 'Requested changes', 'sop.review.reject': 'Rejected a version',
  'sop.released': 'Released a version', 'sop.retired': 'Retired an SOP', 'sop.restored': 'Restored an SOP', 'sop.draft_created': 'Created a draft', 'sop.draft_saved': 'Saved a draft',
  'sop.draft_deleted': 'Deleted a draft', 'sop.revision_started': 'Started a revision', 'sop.duplicated': 'Duplicated an SOP', 'sop.acknowledged': 'Acknowledged an SOP',
  'feedback.applied': 'Applied feedback to a draft', 'feedback.resolved': 'Marked feedback done',
  'task.assigned': 'Assigned a room', 'task.started': 'Started a room', 'task.completed': 'Completed a room', 'task.verification_requested': 'Asked for verification',
  'task.verified': 'Verified a room', 'task.returned': 'Returned a room', 'task.cancelled': 'Cancelled a room', 'task.reassigned': 'Reassigned a room',
  'issue.reported': 'Reported an incident', 'issue.open': 'Reopened an incident', 'issue.in_progress': 'Took on an incident', 'issue.resolved': 'Resolved an incident', 'issue.updated': 'Updated an incident',
  'notice.sent': 'Sent a notice', 'notice.acknowledged': 'Acknowledged a notice', 'attendance.checkin': 'Checked in', 'shift.ended': 'Ended a shift', 'shift.went_early': 'Left a shift early',
  'cover.backup_approved': 'Approved a backup',
}
export const humanAction = (a: string) => ACTIONS[a] ?? (a.split('.').slice(1).join(' ').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) || a)

export type AuditArea = 'sop' | 'task' | 'issue' | 'notice' | 'cover'
export const AREA_LABEL: Record<AuditArea, string> = { sop: 'SOPs', task: 'Tasks', issue: 'Incidents', notice: 'Notices', cover: 'Shift & cover' }
export const auditArea = (a: string): AuditArea => {
  const p = a.split('.')[0]
  return p === 'sop' || p === 'feedback' ? 'sop' : p === 'task' ? 'task' : p === 'issue' ? 'issue' : p === 'notice' ? 'notice' : 'cover'
}

/** Replaces record ids in an audit detail with names people recognise. */
export function humanDetail(s: DB, e: AuditEntry): string {
  return e.detail
    .replace(/→\s*([a-z]+)\b/g, (m, id) => { const p = byId(s.people, id); return p ? `→ ${p.name}` : m })
    .replace(/\b(v-[a-z0-9]+|[a-z]+-[a-z0-9]+-\d+)\b/g, (m) => { const v = byId(s.sopVersions, m); return v ? `${v.code} ${v.version}` : m })
    .replace(/\b(t-[a-z0-9]+|h-\d+-[a-z]+(?:-\d+)?)\b/g, (m) => { const t = byId(s.tasks, m); const r = t && byId(s.rooms, t.roomId); return r ? `Room ${r.number}` : m })
    .replace(/\br(\d{3})\b/g, (m, n) => (s.rooms.some((r) => r.number === n) ? `Room ${n}` : m))
    .replace(/\b(is-[a-z0-9]+)\b/g, (m) => byId(s.issues, m)?.title ?? m)
    .replace(/\b(n-[a-z0-9]+)\b/g, (m) => byId(s.notices, m)?.title ?? m)
}

/** Audit entries that concern one SOP (by code, or by one of its version ids). */
export function auditFor(s: DB, sopId: string) {
  const vs = versionsOf(s, sopId)
  const codes = new Set(vs.map((v) => v.code).filter(Boolean))
  const ids = new Set(vs.map((v) => v.id))
  return s.audit.filter((a) => [...codes].some((c) => new RegExp(`(^|[^A-Z0-9-])${c.replace(/[-]/g, '\\-')}($|[^A-Z0-9-])`).test(a.detail)) || [...ids].some((id) => a.detail.includes(id)))
}

export const sinceDays = (iso: string | undefined, days: number, now = Date.now()) => !!iso && Date.parse(iso) > now - days * DAY
export const dayKey = hotelDateKey
