// In-app notifications are derived from live data (nothing extra to store) so they can never drift
// from what the screens show. Only "seen" state is kept, per browser, in the session store.
import { useMemo } from 'react'
import { useDB } from './db'
import { useNow } from './hooks'
import { fDate, fTime, hotelDateKey } from './time'
import type { Portal } from './types'

export type NotificationKind = 'verify' | 'overdue' | 'incident' | 'cover' | 'join' | 'notice' | 'returned' | 'urgent' | 'review' | 'changes' | 'feedback' | 'assigned'
export interface AppNotification { id: string; kind: NotificationKind; title: string; body?: string; at: string; to: string; tone: 'info' | 'warning' | 'danger' | 'success' | 'neutral' }

export function useNotifications(portal: Portal, personId: string | undefined): AppNotification[] {
  const s = useDB()
  const clock = useNow(60_000)
  return useMemo(() => {
    if (!personId) return []
    const name = (id?: string) => s.people.find((p) => p.id === id)?.name ?? 'Someone'
    const room = (id?: string) => s.rooms.find((r) => r.id === id)?.number ?? '—'
    const today = hotelDateKey()
    const now = clock
    const out: AppNotification[] = []
    if (portal === 'manager') {
      s.tasks.filter((t) => t.status === 'awaiting_verification').forEach((t) =>
        out.push({ id: `verify-${t.id}`, kind: 'verify', title: `Room ${room(t.roomId)} is ready for verification`, body: `${name(t.personId)} finished the steps`, at: t.startedAt ?? t.start, to: `/manager/tasks?task=${t.id}`, tone: 'warning' }))
      s.tasks.filter((t) => (t.status === 'scheduled' || t.status === 'in_progress') && Date.parse(t.end) < now && hotelDateKey(t.start) === today).forEach((t) =>
        out.push({ id: `overdue-${t.id}`, kind: 'overdue', title: `Room ${room(t.roomId)} is overdue`, body: `${name(t.personId)} · due ${fTime(t.end)}`, at: t.end, to: `/manager/tasks?task=${t.id}`, tone: 'danger' }))
      s.issues.filter((i) => i.status !== 'resolved').forEach((i) =>
        out.push({ id: `incident-${i.id}-${i.updates.length}`, kind: 'incident', title: i.title, body: `${i.severity[0].toUpperCase()}${i.severity.slice(1)} · reported by ${name(i.reportedById)}`, at: i.updates[i.updates.length - 1].at, to: `/manager/incidents?id=${i.id}`, tone: i.severity === 'critical' || i.severity === 'high' ? 'danger' : 'warning' }))
      s.cover.filter((c) => c.status === 'pending').forEach((c) => {
        const forDay = `${c.date}T06:00:00.000Z`
        out.push({ id: `cover-${c.id}`, kind: 'cover', title: `${name(c.personId)} · ${c.kind.replace('_', ' ')}`, body: `${c.note} · for ${fDate(forDay)}`,
          at: forDay > new Date(now).toISOString() ? new Date(now - 60 * 60_000).toISOString() : forDay, to: '/manager/shift-cover', tone: 'info' })
      })
      s.joinRequests.filter((j) => j.status === 'pending').forEach((j) =>
        out.push({ id: `join-${j.id}`, kind: 'join', title: `${j.name} asked to join`, body: s.jobRoles.find((r) => r.id === j.jobRoleId)?.name, at: j.at, to: '/manager/join-requests', tone: 'neutral' }))
    }
    if (portal === 'employee') {
      s.tasks.filter((t) => t.personId === personId && t.returned && t.status === 'in_progress').forEach((t) =>
        out.push({ id: `returned-${t.id}-${t.returned!.at}`, kind: 'returned', title: `Room ${room(t.roomId)} was sent back`, body: t.returned!.note, at: t.returned!.at, to: `/employee/tasks/${t.id}`, tone: 'warning' }))
      s.tasks.filter((t) => t.personId === personId && t.priority === 'urgent' && t.status === 'scheduled' && hotelDateKey(t.start) === today).forEach((t) =>
        out.push({ id: `urgent-${t.id}`, kind: 'urgent', title: `Urgent: room ${room(t.roomId)}`, body: 'Start this room next', at: t.start, to: `/employee/tasks/${t.id}`, tone: 'danger' }))
      s.notices.filter((n) => n.sentAt && n.recipientIds.includes(personId) && !s.ackEvents.some((a) => a.personId === personId && a.kind === 'notice' && a.refId === n.id && a.acknowledgedAt)).forEach((n) =>
        out.push({ id: `notice-${n.id}`, kind: 'notice', title: n.title, body: n.replyNeeded ? 'Reply needed' : n.body, at: n.sentAt!, to: '/employee/me?tab=notices', tone: n.priority === 'urgent' ? 'danger' : 'info' }))
      s.issues.filter((i) => i.reportedById === personId && i.updates.length > 1 && i.updates[i.updates.length - 1].byId !== personId).forEach((i) =>
        out.push({ id: `incident-${i.id}-${i.updates.length}`, kind: 'incident', title: `Update on “${i.title}”`, body: i.updates[i.updates.length - 1].text, at: i.updates[i.updates.length - 1].at, to: `/employee/reports?id=${i.id}`, tone: i.status === 'resolved' ? 'success' : 'info' }))
    }
    if (portal === 'author') {
      s.sopVersions.filter((v) => v.status === 'in_review').forEach((v) =>
        out.push({ id: `review-${v.id}-${v.reviews.length}`, kind: 'review', title: `${v.code} ${v.version} is waiting for review`, body: v.title, at: v.submittedAt ?? v.updatedAt, to: `/author/reviews/${v.id}`, tone: 'info' }))
      s.sopVersions.filter((v) => v.status === 'changes_requested' && v.authorId === personId).forEach((v) =>
        out.push({ id: `changes-${v.id}-${v.reviews.length}`, kind: 'changes', title: `Changes requested on ${v.code}`, body: v.reviews[v.reviews.length - 1]?.comment, at: v.reviews[v.reviews.length - 1]?.at ?? v.updatedAt, to: `/author/reviews/${v.id}`, tone: 'warning' }))
      s.feedback.filter((f) => f.status === 'open' && f.lane !== 'rating').forEach((f) =>
        out.push({ id: `feedback-${f.id}`, kind: 'feedback', title: f.lane === 'manager_request' ? `Change request from ${name(f.fromId)}` : `Suggestion from ${name(f.fromId)}`, body: f.text, at: f.at, to: '/author/feedback', tone: 'neutral' }))
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40)
  }, [s, portal, personId, clock])
}
