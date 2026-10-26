// All operational times are hotel time, never the device's. Aurora Grand Colombo is UTC+05:30 (no DST).
export const HOTEL_TZ = 'Asia/Colombo'
const HOTEL_OFFSET_MIN = 330

export const MIN = 60_000
export const HOUR = 60 * MIN

/** Epoch ms of hotel-local midnight for the hotel date containing `at`. */
export function hotelMidnight(at = Date.now()): number {
  const local = at + HOTEL_OFFSET_MIN * MIN
  const d = new Date(local)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - HOTEL_OFFSET_MIN * MIN
}

export function hotelDateKey(at: number | string = Date.now()): string {
  const t = typeof at === 'string' ? Date.parse(at) : at
  return new Date(t + HOTEL_OFFSET_MIN * MIN).toISOString().slice(0, 10)
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: HOTEL_TZ, ...opts })
const tf = fmt({ hour: '2-digit', minute: '2-digit', hour12: true })
const df = fmt({ month: 'short', day: 'numeric' })
const dtf = fmt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
const wf = fmt({ weekday: 'long', month: 'long', day: 'numeric' })

const ts = (v: string | number) => (typeof v === 'string' ? Date.parse(v) : v)
export const fTime = (v: string | number) => tf.format(ts(v)).toUpperCase()
export const fDate = (v: string | number) => df.format(ts(v))
export const fDateTime = (v: string | number) => dtf.format(ts(v)).replace(/am|pm/, (m) => m.toUpperCase())
export const fLongDate = (v: string | number) => wf.format(ts(v))

/** datetime-local input value in hotel time */
export function toHotelInput(v: string | number): string {
  return new Date(ts(v) + HOTEL_OFFSET_MIN * MIN).toISOString().slice(0, 16)
}
export function fromHotelInput(s: string): string {
  return new Date(Date.parse(s + ':00Z') - HOTEL_OFFSET_MIN * MIN).toISOString()
}

export const iso = (ms: number) => new Date(ms).toISOString()
export const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MIN)
