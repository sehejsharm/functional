import type { Tier } from './types'

const RANK: Record<Tier, number> = { base: 0, senior: 1, admin: 2 }
export const tierLabel: Record<Tier, string> = { base: 'Shift manager', senior: 'Senior manager', admin: 'Property admin' }

/** Tier names as each portal's people know them. */
export const TIER_LABELS: Record<'employee' | 'manager' | 'author', Record<Tier, string>> = {
  employee: { base: 'Team member', senior: 'Senior team member', admin: 'Property admin' },
  manager: tierLabel,
  author: { base: 'Standards author', senior: 'Senior author', admin: 'Property admin' },
}

/** Compliance, analytics and lead-operations screens need Senior manager or Property admin. */
export const canAccess = (have: Tier | undefined, need: Tier) => !!have && RANK[have] >= RANK[need]
