import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, setOnUnauthorized, setToken } from './api'
import type { Portal, RoleGrant, Tier } from './types'

export const PASSPHRASE_LENGTH = 17

export interface SessionAccount { id: string; personId: string; name: string; propertyId: string; grants: RoleGrant[] }

interface Session {
  token: string | null
  account: SessionAccount | null
  portal: Portal | null
  switching: string | null
  signIn: (passkey: string) => Promise<Portal>
  signOut: () => Promise<void>
  refreshAccount: () => Promise<void>
  setPortal: (p: Portal) => void
  setSwitching: (name: string | null) => void
}

const ORDER: Portal[] = ['manager', 'author', 'employee']
export const primaryPortal = (grants: RoleGrant[]): Portal => ORDER.find((p) => grants.some((g) => g.portal === p)) ?? 'employee'

export const useSession = create<Session>()(
  persist(
    (set, get) => ({
      token: null, account: null, portal: null, switching: null,
      signIn: async (passkey) => {
        const r = await api<{ token: string; account: SessionAccount }>('/auth/login', { method: 'POST', json: { passkey } })
        setToken(r.token)
        const portal = primaryPortal(r.account.grants)
        set({ token: r.token, account: r.account, portal })
        return portal
      },
      signOut: async () => {
        try { if (get().token) await api('/auth/logout', { method: 'POST' }) } catch { /* already gone */ }
        setToken(null)
        set({ token: null, account: null, portal: null })
      },
      refreshAccount: async () => {
        try { const r = await api<{ account: SessionAccount }>('/me'); set({ account: r.account }) } catch { /* handled by 401 hook */ }
      },
      setPortal: (portal) => set({ portal }),
      setSwitching: (switching) => set({ switching }),
    }),
    {
      name: 'mise-session-v2',
      partialize: ({ token, account, portal }) => ({ token, account, portal }),
      onRehydrateStorage: () => (s) => { if (s?.token) setToken(s.token) },
    },
  ),
)

setOnUnauthorized(() => { setToken(null); useSession.setState({ token: null, account: null, portal: null }) })

export function useGrants(): RoleGrant[] {
  return useSession((s) => s.account?.grants) ?? []
}

export function useGrant(portal: Portal): RoleGrant | undefined {
  return useGrants().find((x) => x.portal === portal)
}
export const tierOf = (g?: { tier: Tier }) => g?.tier
