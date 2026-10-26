import { Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button, PageHeader } from '@/components/ui'
import { canAccess, tierLabel } from '@/lib/permissions'
import { useGrant, useSession } from '@/lib/session'
import type { Portal, Tier } from '@/lib/types'

/** Client-side mirror of the server rule (firestore.rules): no grant → no portal shell at all. */
export function RequirePortal({ portal, children }: { portal: Portal; children: ReactNode }) {
  const accountId = useSession((s) => s.accountId)
  const grant = useGrant(portal)
  if (!accountId) return <Navigate to="/" replace />
  if (!grant) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Tiered gate: the capability stays visible, but opens a request-access prompt below the tier. */
export function TierGate({ portal, need, feature, children }: { portal: Portal; need: Tier; feature: string; children: ReactNode }) {
  const grant = useGrant(portal)
  const [requested, setRequested] = useState(false)
  if (canAccess(grant?.tier, need)) return <>{children}</>
  return (
    <div>
      <PageHeader title={feature} />
      <div className="card mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-gold-50 text-gold-700 ring-8 ring-gold-50/50"><Lock size={22} /></span>
        <h2 className="text-xl font-semibold text-ink">{feature} needs {tierLabel[need]} access</h2>
        <p className="mt-2 text-sm text-ink-2">
          You are signed in as a {tierLabel[grant?.tier ?? 'base']}. This screen holds the property's compliance and cross-shift data,
          so it is reserved for whoever owns that for {`the property`}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="primary" disabled={requested} onClick={() => setRequested(true)}>{requested ? 'Request sent to your property admin' : 'Request access'}</Button>
          <Link to="/screens"><Button variant="secondary">All screens</Button></Link>
        </div>
        <p className="mt-4 text-xs text-muted">Demo: open “Demo controls” at the bottom of the sidebar and pick a higher access tier.</p>
      </div>
    </div>
  )
}
