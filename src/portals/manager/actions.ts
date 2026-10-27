// Manager-only mutations that the shared store doesn't provide yet. Each one writes through
// useDB.setState and leaves an audit entry, exactly like the built-in store actions.
import { useDB } from '@/lib/db'
import type { CoverItem, Priority, Task } from '@/lib/types'

const db = () => useDB.getState()
const nowIso = () => new Date().toISOString()

export function setTaskPriority(taskId: string, priority: Priority, actorId: string): boolean {
  const t = db().tasks.find((x) => x.id === taskId)
  if (!t || t.status === 'done' || t.status === 'cancelled' || t.priority === priority) return false
  useDB.setState((s) => ({ tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, priority } : x)) }))
  db().log(actorId, 'task.priority_changed', `${taskId}: ${priority}`)
  return true
}

/** Verify with the self-verification rule checked up front so the UI can explain a refusal. */
export function verifyAs(taskId: string, actorId: string): { ok: true } | { ok: false; reason: string } {
  const t = db().tasks.find((x) => x.id === taskId)
  if (!t) return { ok: false, reason: 'This room no longer exists.' }
  if (t.personId === actorId) return { ok: false, reason: 'You can’t verify a room you worked yourself. Ask another manager.' }
  if (t.status !== 'awaiting_verification') return { ok: false, reason: 'This room is no longer waiting for verification.' }
  db().verifyTask(taskId, actorId)
  return db().tasks.find((x) => x.id === taskId)?.status === 'done' ? { ok: true } : { ok: false, reason: 'Verification could not be recorded.' }
}

/** Sets Guided/Standard on a person's open rooms and records one audit line for the change. */
export function setModeForTasks(tasks: Task[], mode: Task['mode'], actorId: string, personName: string) {
  const changed = tasks.filter((t) => t.mode !== mode)
  changed.forEach((t) => db().setTaskMode(t.id, mode))
  if (changed.length) db().log(actorId, 'task.mode_changed', `${personName} to ${mode === 'standard' ? 'Standard' : 'Guided'} on ${changed.length} room${changed.length === 1 ? '' : 's'}`)
  return changed.length
}

export function decideCoverAs(item: CoverItem, status: 'approved' | 'declined', actorId: string, label: string) {
  // A stale tab must not re-decide an item someone already handled.
  if (db().cover.find((c) => c.id === item.id)?.status !== 'pending') return false
  db().decideCover(item.id, status)
  db().log(actorId, `cover.${status}`, label)
  return true
}

export function decideJoinAs(id: string, status: 'approved' | 'declined', actorId: string) {
  const j = db().joinRequests.find((x) => x.id === id)
  if (!j || j.status !== 'pending') return false
  db().decideJoin(id, status)
  db().log(actorId, `join.${status}`, j.name)
  return true
}

/** Nudge people to acknowledge a published version. Delivery is simulated; the audit line is real. */
export function sendAckReminder(actorId: string, personIds: string[], what: string) {
  if (!personIds.length) return 0
  const names = personIds.map((id) => db().people.find((p) => p.id === id)?.name.split(' ')[0] ?? id)
  db().log(actorId, 'ack.reminder_sent', `${what} → ${names.join(', ')}`)
  return personIds.length
}

export function requestSopChange(actorId: string, versionId: string, text: string, stepId?: string) {
  const v = db().sopVersions.find((x) => x.id === versionId)
  db().addFeedback('manager_request', versionId, actorId, text.trim(), stepId ? { stepId } : {})
  db().log(actorId, 'sop.change_requested', v ? `${v.code} v${v.version}` : versionId)
}

export const stamp = nowIso
