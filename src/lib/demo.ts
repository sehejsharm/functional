// Demo mode: a hotel kept in this browser, written through the same domain rules the Cloudflare server runs.
// It plays the server's part (authoritative copy, revision number, change notifications across tabs), so the
// client store, its outbox and the screens behave exactly as they do against the live API.
import { apply, DomainError, emptyState, normalizeState, type Action, type Actor, type State } from './domain'
import { buildSeed, PROPERTY } from './seed'
import { hotelDateKey, hotelHm } from './time'
import type { RoleGrant } from './types'

const KEY = 'mise-demo-hub-v1'
export const DEMO_PASSPHRASE = ((import.meta.env.VITE_DEMO_PASSPHRASE as string | undefined) || 'miseauroragrand26').trim().toLowerCase()

/** One shared account that opens all three portals, each as a different staff member. */
export const DEMO_ACCOUNT = {
  id: 'shared-demo', personId: 'elena', name: 'Shared demo', propertyId: PROPERTY.id,
  grants: [
    { propertyId: PROPERTY.id, portal: 'employee', tier: 'base', personId: 'maya' },
    { propertyId: PROPERTY.id, portal: 'manager', tier: 'base', personId: 'elena' },
    { propertyId: PROPERTY.id, portal: 'author', tier: 'base', personId: 'amina' },
  ] as RoleGrant[],
}

interface Hub { rev: number; seededFor: string; state: State }

function seed(): Hub {
  const { properties: _p, accounts: _a, shifts, ...rest } = buildSeed()
  // The server stores shifts as recurring hotel-local times.
  const state = normalizeState({ ...emptyState(PROPERTY), ...rest, shifts: shifts.map((sh) => ({ ...sh, start: hotelHm(sh.start), end: hotelHm(sh.end) })) })
  return { rev: 1, seededFor: hotelDateKey(), state }
}

let hub: Hub | null = null
const listeners = new Set<(rev: number) => void>()

function load(): Hub {
  if (hub) return hub
  try {
    const h = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Hub | null
    // The shared demo re-seeds each hotel day so Today always has live work in it.
    if (h?.state && h.seededFor === hotelDateKey()) { hub = { ...h, state: normalizeState(h.state) }; return hub }
  } catch { /* corrupt or blocked storage: start fresh */ }
  hub = seed(); save()
  return hub
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(hub)) } catch { /* storage full or blocked */ } }

if (typeof window !== 'undefined') {
  // Another tab wrote: pick up its copy and tell this tab's store.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    hub = null
    const h = load()
    listeners.forEach((f) => f(h.rev))
  })
}

export const demoHub = {
  read(): { rev: number; state: State } { const h = load(); return { rev: h.rev, state: h.state } },
  act(actor: Actor, action: Action): unknown {
    const h = load()
    const { state, value } = apply(h.state, actor, action, new Date().toISOString())
    hub = { ...h, rev: h.rev + 1, state }; save()
    listeners.forEach((f) => f(hub!.rev))
    return value
  },
  reset() { hub = seed(); save(); listeners.forEach((f) => f(hub!.rev)) },
  subscribe(f: (rev: number) => void) { listeners.add(f); return () => { listeners.delete(f) } },
}
export { DomainError }
