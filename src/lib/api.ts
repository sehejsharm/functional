// Thin client for the Mise API on Cloudflare Workers.
// With no VITE_API_URL at build time the app runs in demo mode: the same rules, on a hotel kept in this browser.
const configured = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim().replace(/\/$/, '')
export const DEMO = !configured || configured === 'demo'
export const API_URL = DEMO ? '' : configured

export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
/** Network failure (no response at all) — the caller may queue and retry. */
export class OfflineError extends Error {}

let token: string | null = null
export const setToken = (t: string | null) => { token = t }
let onUnauthorized: () => void = () => {}
export const setOnUnauthorized = (f: () => void) => { onUnauthorized = f }

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  if (DEMO) throw new ApiError('Not available in demo mode', 501)
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (token) headers.Authorization = `Bearer ${token}`
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(API_URL + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body })
  } catch {
    throw new OfflineError('The hotel server cannot be reached')
  }
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 && token) onUnauthorized()
  if (!res.ok || body?.ok === false) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status)
  return body as T
}

export const wsUrl = (t: string) => `${API_URL.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(t)}`

/** Demo photos live in memory for this tab (there is no photo store without the server). */
export const demoPhotos = new Map<string, string>()
export const photoUrl = (key: string) => (DEMO ? demoPhotos.get(key) ?? '' : `${API_URL}/photos/${key}?token=${encodeURIComponent(token ?? '')}`)
/** Client-generated record id, so the optimistic copy and the server agree on it. */
export const uid = (p: string) => { const b = new Uint8Array(8); crypto.getRandomValues(b); return `${p}-${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}` }
