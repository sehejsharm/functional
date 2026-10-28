import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, ApiError, DEMO, setOnUnauthorized, setToken } from './api'
import { DEMO_ACCOUNT, DEMO_PASSPHRASE } from './demo'
import type { Portal, RoleGrant, Tier } from './types'

export const PASSPHRASE_LENGTH = 17
/** Demo mode with the published demo passkey: the login screen shows it. */
export const usingDefaultPassphrase = DEMO && !import.meta.env.VITE_DEMO_PASSPHRASE

export interface SessionAccount { id: string; personId: string; name: string; propertyId: string; grants: RoleGrant[] }

interface Session {
  token: string | null
  account: SessionAccount | null
  portal: Portal | null
  switching: string | null
  /** Demo only: tier override so reviewers can preview gated screens. */
  demoTier: Tier | null
  /** Demo only: which staff member the Employee portal shows, so any role's work can be tried. */
  demoEmployeeId: string | null
  /** Notification ids this browser has already seen. */
  seenNotifications: string[]
  commandOpen: boolean
  signIn: (passkey: string) => Promise<Portal>
  signOut: () => Promise<void>
  refreshAccount: () => Promise<void>
  setPortal: (p: Portal) => void
  setSwitching: (name: string | null) => void
  setDemoTier: (t: Tier | null) => void
  setDemoEmployee: (id: string | null) => void
  markNotificationsSeen: (ids: string[]) => void
  setCommandOpen: (v: boolean) => void
}

const ORDER: Portal[] = ['manager', 'author', 'employee']
export const primaryPortal = (grants: RoleGrant[]): Portal => (DEMO ? 'employee' : ORDER.find((p) => grants.some((g) => g.portal === p)) ?? 'employee')
const normalize = (p: string) => p.trim().toLowerCase().replace(/\s+/g, '')

export const useSession = create<Session>()(
  persist(
    (set, get) => ({
      token: null, account: null, portal: null, switching: null, demoTier: null, demoEmployeeId: null, seenNotifications: [], commandOpen: false,
      signIn: async (passkey) => {
        if (DEMO) {
          if (normalize(passkey) !== DEMO_PASSPHRASE) throw new ApiError('That passkey did not match. Try again.', 401)
          const portal = primaryPortal(DEMO_ACCOUNT.grants)
          set({ token: 'demo', account: DEMO_ACCOUNT, portal })
          return portal
        }
        const r = await api<{ token: string; account: SessionAccount }>('/auth/login', { method: 'POST', json: { passkey } })
        setToken(r.token)
        const portal = primaryPortal(r.account.grants)
        set({ token: r.token, account: r.account, portal })
        return portal
      },
      signOut: async () => {
        try { if (!DEMO && get().token) await api('/auth/logout', { method: 'POST' }) } catch { /* already gone */ }
        setToken(null)
        set({ token: null, account: null, portal: null, demoTier: null, demoEmployeeId: null })
      },
      refreshAccount: async () => {
        if (DEMO) return
        try { const r = await api<{ account: SessionAccount }>('/me'); set({ account: r.account }) } catch { /* handled by 401 hook */ }
      },
      setPortal: (portal) => set({ portal }),
      setSwitching: (switching) => set({ switching }),
      setDemoTier: (demoTier) => set({ demoTier }),
      setDemoEmployee: (demoEmployeeId) => set({ demoEmployeeId }),
      markNotificationsSeen: (ids) => set((s) => ({ seenNotifications: [...new Set([...s.seenNotifications, ...ids])].slice(-400) })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
    }),
    {
      // Demo and live sessions never mix: a build switched between them starts signed out.
      name: DEMO ? 'mise-session-demo-v1' : 'mise-session-v2',
      partialize: ({ token, account, portal, demoTier, demoEmployeeId, seenNotifications }) => ({ token, account, portal, demoTier, demoEmployeeId, seenNotifications }),
      onRehydrateStorage: () => (s) => { if (s?.token && !DEMO) setToken(s.token) },
    },
  ),
)

setOnUnauthorized(() => { setToken(null); useSession.setState({ token: null, account: null, portal: null }) })

export function useGrants(): RoleGrant[] {
  const account = useSession((s) => s.account)
  return account?.grants.filter((g) => g.propertyId === account.propertyId) ?? []
}

/** The signed-in grant for a portal. In demo mode it carries the demo tier and "viewing as" choices. */
export function useGrant(portal: Portal): RoleGrant | undefined {
  const grants = useGrants()
  const demoTier = useSession((s) => s.demoTier)
  const demoEmployeeId = useSession((s) => s.demoEmployeeId)
  const g = grants.find((x) => x.portal === portal)
  if (!g || !DEMO) return g
  if (portal === 'employee') return demoEmployeeId ? { ...g, personId: demoEmployeeId } : g
  return demoTier ? { ...g, tier: demoTier } : g
}
export const tierOf = (g?: { tier: Tier }) => g?.tier
