import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, HelpBadge, IconBadge, Logo } from '@/components/ui'
import { HelpDrawer } from '@/shell/HelpDrawer'
import { PASSPHRASE_LENGTH, useSession } from '@/lib/session'
import { api, ApiError } from '@/lib/api'
import { PassphraseGrid } from './PassphraseGrid'

// Warm hospitality photography (brass bell / linens / golden light). Swap for property imagery in production.
const HERO = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80'

export function LoginScreen() {
  const nav = useNavigate()
  const signIn = useSession((s) => s.signIn)
  const [value, setValue] = useState('')
  const [error, setError] = useState(0)
  const [message, setMessage] = useState('That passkey did not match. Try again.')
  const [busy, setBusy] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  useEffect(() => { api<{ needsSetup: boolean }>('/setup/status').then((r) => setNeedsSetup(r.needsSetup)).catch(() => {}) }, [])
  const [help, setHelp] = useState(false)
  const [compact, setCompact] = useState(false)

  const submit = async () => {
    if (!value || busy) return
    setBusy(true)
    try {
      const portal = await signIn(value)
      nav(`/${portal}`)
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'The hotel server cannot be reached. Check the connection and try again.')
      setError((n) => n + 1)
    } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <motion.div layout className={`relative overflow-hidden ${compact ? 'h-24 lg:h-auto lg:w-[18%]' : 'h-56 lg:h-auto lg:w-1/2'}`}>
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_20%,rgb(var(--gold-500)/0.45),rgb(var(--forest-800))_60%,rgb(var(--forest-950)))]" />
        <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/80 via-forest-950/20 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-forest-950/70" />
      </motion.div>

      <main className="brand-sheen noise relative flex flex-1 flex-col px-6 py-8 sm:px-12 lg:py-12">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <IconBadge icon={Minimize2} label="Compact brand panel" onClick={() => setCompact((c) => !c)} active={compact} />
          </div>
          <HelpBadge onClick={() => setHelp(true)} />
        </div>

        <div className="relative z-10 mx-auto my-auto w-full max-w-md py-10">
          <div className="eyebrow mb-3">Aurora Grand Colombo</div>
          <h1 className="mb-3 text-5xl font-bold leading-[1.02] text-white sm:text-6xl">Every shift,<br />a little better.</h1>
          <p className="mb-8 text-sage-300">Step inside your hotel workspace.</p>

          <form onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <PassphraseGrid length={PASSPHRASE_LENGTH} value={value} error={error > 0}
              onChange={(v) => { setValue(v); if (error) setError(0) }} onSubmit={() => void submit()} />
            <AnimatePresence>
              {error > 0 && (
                <motion.div id="passkey-error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-3 flex items-center justify-between rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  <span>{message}</span>
                  <span className="flex items-center gap-1 text-xs opacity-80"><CornerDownLeft size={12} /> Press Enter to retry.</span>
                </motion.div>
              )}
            </AnimatePresence>
            <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={!value || busy}>{busy ? 'Checking…' : 'Enter workspace'}</Button>
          </form>
          {needsSetup
            ? <p className="mt-4 text-center text-sm text-sage-300">New to Mise? <Link to="/setup" className="text-gold-400 hover:underline">Set up your hotel</Link></p>
            : <p className="mt-4 text-center text-xs text-sage-300/70">Your passkey comes from your property admin.</p>}
        </div>
      </main>
      <HelpDrawer open={help} onClose={() => setHelp(false)} portal="login" />
    </div>
  )
}

