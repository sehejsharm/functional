// Thin client for the Mise API on Cloudflare Workers.
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787').replace(/\/$/, '')

export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
/** Network failure (no response at all) — the caller may queue and retry. */
export class OfflineError extends Error {}

let token: string | null = null
export const setToken = (t: string | null) => { token = t }
let onUnauthorized: () => void = () => {}
export const setOnUnauthorized = (f: () => void) => { onUnauthorized = f }

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
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
export const photoUrl = (key: string) => `${API_URL}/photos/${key}?token=${encodeURIComponent(token ?? '')}`
export const uid = (p: string) => `${p}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
