import type { SopVersion, Task } from './types'
import { hotelDateKey, minutesBetween } from './time'

export interface Stats { completed: number; onTimePct: number; avgDelta: number; overdue: number; verifyPassPct: number }

/** On time = finished within the SOP's time target of starting. */
export function stats(tasks: Task[], versions: SopVersion[], now = Date.now()): Stats {
  const done = tasks.filter((t) => t.status === 'done' && t.startedAt && t.completedAt)
  const target = (t: Task) => versions.find((v) => v.id === t.sopVersionId)?.timeTargetMin ?? 27
  const durations = done.map((t) => minutesBetween(t.startedAt!, t.completedAt!) - target(t))
  const onTime = durations.filter((d) => d <= 0).length
  const overdue = tasks.filter((t) => t.status !== 'done' && Date.parse(t.end) < now).length + tasks.filter((t) => t.priority === 'urgent').length
  const checked = tasks.filter((t) => t.status === 'done' || t.status === 'awaiting_verification')
  return {
    completed: done.length,
    onTimePct: done.length ? Math.round((onTime / done.length) * 100) : 0,
    avgDelta: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : 0,
    overdue,
    verifyPassPct: checked.length ? Math.round((checked.filter((t) => t.status === 'done').length / checked.length) * 100) : 0,
  }
}

export function byDay(tasks: Task[], versions: SopVersion[], days: number, now = Date.now()) {
  return Array.from({ length: days }, (_, i) => {
    const key = hotelDateKey(now - (days - i) * 86_400_000)
    const s = stats(tasks.filter((t) => hotelDateKey(t.start) === key), versions, now)
    return { key, ...s }
  })
}

export function durationHistogram(tasks: Task[]) {
  const buckets = new Map<number, number>()
  tasks.filter((t) => t.startedAt && t.completedAt).forEach((t) => {
    const m = minutesBetween(t.startedAt!, t.completedAt!); const b = Math.floor(m / 3) * 3
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  })
  return [...buckets.entries()].sort((a, b) => a[0] - b[0])
}
