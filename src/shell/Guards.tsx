import { Lock, WifiOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, ButtonLink, Logo, PageHeader, Skeleton } from '@/components/ui'
import { useDB } from '@/lib/db'
import { canAccess, TIER_LABELS } from '@/lib/permissions'
import { useGrant, useSession } from '@/lib/session'
import type { Portal, Tier } from '@/lib/types'

/** Mirrors the API's own checks: an account without this portal's grant never gets its shell. */
export function RequirePortal({ portal, children }: { portal: Portal; children: ReactNode }) {
  const token = useSession((s) => s.token)
  const grant = useGrant(portal)
  if (!token || !grant) return <Navigate to="/" replace />
  return <DataGate>{children}</DataGate>
}

/** Tiered gate: the capability stays visible, but opens a request-access prompt below the tier. */
export function TierGate({ portal, need, feature, children }: { portal: Portal; need: Tier; feature: string; children: ReactNode }) {
  const grant = useGrant(portal)
  const [requested, setRequested] = useState(false)
  const dispatch = useDB((s) => s.dispatch)
  const demo = useDB((s) => s.mode === 'demo')
  if (canAccess(grant?.tier, need)) return <>{children}</>
  const labels = TIER_LABELS[portal]
  return (
    <div>
      <PageHeader title={feature} />
      <div className="card mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-gold-50 text-gold-700 ring-8 ring-gold-50/50"><Lock size={22} /></span>
        <h2 className="text-xl font-semibold text-ink">{feature} needs {labels[need]} access</h2>
        <p className="mt-2 text-sm text-ink-2">
          You are signed in as a {labels[grant?.tier ?? 'base']}. {feature} shows property-wide data, so it is limited to {labels[need]}s{need === 'senior' ? ' and Property admins' : ''}.
          {!demo && ' Your property admin can raise your access in Platform & audit.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="primary" disabled={requested} onClick={() => { dispatch({ type: 'requestAccess', feature, tier: need }); setRequested(true) }}>{requested ? 'Request sent to your property admin' : 'Request access'}</Button>
          <ButtonLink to="/screens" variant="secondary">All screens</ButtonLink>
        </div>
        {demo && <p className="mt-4 text-xs text-muted">Demo: open “Demo” at the bottom of the sidebar and pick a higher access tier.</p>}
      </div>
    </div>
  )
}

/** Loads this property's data once per sign-in and keeps it live (WebSocket on the server, other tabs in demo). */
function DataGate({ children }: { children: ReactNode }) {
  const ready = useDB((s) => s.ready)
  const load = useDB((s) => s.load)
  const hotel = useDB((s) => s.connection.hotel)
  const token = useSession((s) => s.token)
  useEffect(() => { void load() }, [load, token])
  if (ready) return <>{children}</>
  return (
    <div className="grid min-h-full place-items-center bg-canvas p-6">
      <div className="card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center" role="status" aria-live="polite">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-forest-900"><Logo size={30} wordmark={false} /></span>
        {hotel === 'offline' ? <>
          <span className="flex items-center gap-2 font-semibold text-ink"><WifiOff size={16} className="text-danger" /> Hotel system is offline</span>
          <p className="text-sm text-ink-2">Your hotel's data stays hidden until the server confirms this signed-in account. Check the connection and try again.</p>
          <Button variant="primary" onClick={() => void load()}>Try again</Button>
        </> : <>
          <span className="text-sm font-medium text-ink">Loading your hotel…</span>
          <Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-28" />
        </>}
      </div>
    </div>
  )
}
