import { Lock } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button, Logo, PageHeader, Skeleton } from '@/components/ui'
import { useDB } from '@/lib/db'
import { canAccess, tierLabel } from '@/lib/permissions'
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
  if (canAccess(grant?.tier, need)) return <>{children}</>
  return (
    <div>
      <PageHeader title={feature} />
      <div className="card mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-gold-500/40 bg-forest-900 text-gold-400"><Lock size={22} /></span>
        <h2 className="text-2xl font-bold text-white">{feature} needs {tierLabel[need]} access</h2>
        <p className="mt-2 text-sage-300">
          You are signed in as a {tierLabel[grant?.tier ?? 'base']}. This screen holds the property's compliance and cross-shift data,
          so it is reserved for whoever owns that for the property. Your property admin can raise your access in Platform foundation.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="gold" disabled={requested} onClick={() => { dispatch({ type: 'requestAccess', feature, tier: need }); setRequested(true) }}>{requested ? 'Request sent to your property admin' : 'Request access'}</Button>
          <Link to="/screens"><Button variant="ghost">All screens</Button></Link>
        </div>
      </div>
    </div>
  )
}

/** Loads this property's data from the hotel server once per sign-in and keeps it live. */
function DataGate({ children }: { children: ReactNode }) {
  const ready = useDB((s) => s.ready)
  const load = useDB((s) => s.load)
  const hotel = useDB((s) => s.connection.hotel)
  const token = useSession((s) => s.token)
  useEffect(() => { void load() }, [load, token])
  if (!ready) return (
    <div className="brand-sheen grid min-h-full place-items-center p-6">
      <div className="card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
        <Logo size={40} wordmark={false} />
        {hotel === 'offline' ? <>
          <div className="font-semibold text-white">Hotel system is offline</div>
          <p className="text-sm text-sage-300">Saved hotel-system details stay hidden until the server confirms this signed-in account.</p>
          <Button variant="light" onClick={() => void load()}>Try again</Button>
        </> : <><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-28" /></>}
      </div>
    </div>
  )
  return <><ErrorToast />{children}</>
}

function ErrorToast() {
  const error = useDB((s) => s.error)
  const clear = useDB((s) => s.clearError)
  useEffect(() => { if (error) { const t = setTimeout(clear, 6000); return () => clearTimeout(t) } }, [error, clear])
  return (
    <AnimatePresence>
      {error && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 lg:bottom-6">
          <motion.div role="alert" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="pointer-events-auto w-full max-w-md rounded-xl border border-danger/40 bg-forest-950 px-4 py-3 text-sm text-sage-50 shadow-lift">
            <div className="flex items-start justify-between gap-3"><span>{error}</span><button onClick={clear} className="text-sage-300">Dismiss</button></div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
