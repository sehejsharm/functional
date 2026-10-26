import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Portal, RoleGrant, Tier } from './types'
import { useDB } from './db'

const ENV_PASSPHRASE = import.meta.env.VITE_DEMO_PASSPHRASE as string | undefined
const PASSPHRASE = ENV_PASSPHRASE || 'miseauroragrand26'
export const usingDefaultPassphrase = !ENV_PASSPHRASE
export const PASSPHRASE_LENGTH = PASSPHRASE.length

interface Session {
  accountId: string | null
  portal: Portal | null
  propertyId: string | null
  /** Demo-only tier override so reviewers can preview gated screens. */
  demoTier: Tier | null
  demoPaused: boolean
  switching: string | null
  signIn: (passphrase: string) => Portal | null
  signOut: () => void
  setPortal: (p: Portal) => void
  setSwitching: (name: string | null) => void
  setDemoTier: (t: Tier | null) => void
  toggleDemoPaused: () => void
}

export const useSession = create<Session>()(
  persist(
    (set) => ({
      accountId: null, portal: null, propertyId: null, demoTier: null, demoPaused: false, switching: null,
      signIn: (pass) => {
        // Demo: one shared passphrase. Production swaps this for Firebase Auth + custom claims.
        if (pass.trim().toLowerCase() !== PASSPHRASE.toLowerCase()) return null
        const acct = useDB.getState().accounts[0]
        set({ accountId: acct.id, portal: acct.primary, propertyId: acct.grants[0].propertyId })
        return acct.primary
      },
      signOut: () => set({ accountId: null, portal: null, demoTier: null }),
      setPortal: (portal) => set({ portal }),
      setSwitching: (switching) => set({ switching }),
      setDemoTier: (demoTier) => set({ demoTier }),
      toggleDemoPaused: () => set((s) => ({ demoPaused: !s.demoPaused })),
    }),
    { name: 'mise-session-v1', partialize: ({ switching: _s, ...rest }) => rest },
  ),
)

export function useGrants(): RoleGrant[] {
  const accountId = useSession((s) => s.accountId)
  const propertyId = useSession((s) => s.propertyId)
  const accounts = useDB((s) => s.accounts)
  return accounts.find((a) => a.id === accountId)?.grants.filter((g) => g.propertyId === propertyId) ?? []
}

export function useGrant(portal: Portal): RoleGrant | undefined {
  const grants = useGrants()
  const demoTier = useSession((s) => s.demoTier)
  const g = grants.find((x) => x.portal === portal)
  return g && demoTier ? { ...g, tier: demoTier } : g
}
