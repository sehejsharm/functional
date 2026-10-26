// All operational times are hotel time, never the device's. The zone comes from the property record.
export let HOTEL_TZ = 'Asia/Colombo'
export function setHotelTimeZone(tz: string) { if (tz && tz !== HOTEL_TZ) { HOTEL_TZ = tz; cache.clear() } }

export const MIN = 60_000
export const HOUR = 60 * MIN
const DAY = 24 * HOUR

const cache = new Map<string, Intl.DateTimeFormat>()
const fmt = (opts: Intl.DateTimeFormatOptions) => {
  const k = JSON.stringify(opts) + HOTEL_TZ
  let f = cache.get(k)
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: HOTEL_TZ, ...opts }); cache.set(k, f) }
  return f
}

/** Offset of hotel local time from UTC at instant `at`, in minutes (DST-aware). */
export function hotelOffsetMin(at: number): number {
  const p = Object.fromEntries(fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((x) => [x.type, x.value]))
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return Math.round((local - Math.floor(at / MIN) * MIN) / MIN)
}

/** Epoch ms of hotel-local midnight for the hotel date containing `at`. */
export function hotelMidnight(at = Date.now()): number {
  const local = at + hotelOffsetMin(at) * MIN
  const d = new Date(local)
  const midLocal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return midLocal - hotelOffsetMin(midLocal - 12 * HOUR) * MIN
}

export function hotelDateKey(at: number | string = Date.now()): string {
  const t = typeof at === 'string' ? Date.parse(at) : at
  return new Date(t + hotelOffsetMin(t) * MIN).toISOString().slice(0, 10)
}

const ts = (v: string | number) => (typeof v === 'string' ? Date.parse(v) : v)
export const fTime = (v: string | number) => fmt({ hour: '2-digit', minute: '2-digit', hour12: true }).format(ts(v)).toUpperCase()
export const fDate = (v: string | number) => fmt({ month: 'short', day: 'numeric' }).format(ts(v))
export const fDateTime = (v: string | number) => fmt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(ts(v)).replace(/am|pm/, (m) => m.toUpperCase())
export const fLongDate = (v: string | number) => fmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(ts(v))

/** datetime-local input value in hotel time */
export function toHotelInput(v: string | number): string {
  const t = ts(v)
  return new Date(t + hotelOffsetMin(t) * MIN).toISOString().slice(0, 16)
}
export function fromHotelInput(s: string): string {
  const asUtc = Date.parse(s + ':00Z')
  return new Date(asUtc - hotelOffsetMin(asUtc) * MIN).toISOString()
}

export const iso = (ms: number) => new Date(ms).toISOString()
export const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MIN)

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h * 60 + m) * MIN }

/** The concrete window of a recurring shift on the hotel day starting at `dayStart`. */
export function shiftWindowOn(shift: { start: string; end: string }, dayStart: number) {
  const start = dayStart + hm(shift.start)
  let end = dayStart + hm(shift.end)
  if (end <= start) end += DAY
  return { start, end }
}

/** The shift instance running at `now`, else today's instance. */
export function shiftWindow(shift: { start: string; end: string }, now = Date.now()) {
  const today = hotelMidnight(now)
  const y = shiftWindowOn(shift, today - DAY)
  if (y.start <= now && now < y.end) return y
  return shiftWindowOn(shift, today)
}
export const isLive = (shift: { start: string; end: string }, now = Date.now()) => { const w = shiftWindow(shift, now); return w.start <= now && now < w.end }
