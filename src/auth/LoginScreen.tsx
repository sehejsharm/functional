import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Minimize2, Pause, Play } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, HelpBadge, IconBadge, Logo } from '@/components/ui'
import { HelpDrawer } from '@/shell/HelpDrawer'
import { PASSPHRASE_LENGTH, usingDefaultPassphrase, useSession } from '@/lib/session'
import { PassphraseGrid } from './PassphraseGrid'
import { firebaseEnabled } from '@/lib/env'

// Warm hospitality photography (brass bell / linens / golden light). Swap for property imagery in production.
const HERO = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80'

export function LoginScreen() {
  const nav = useNavigate()
  const signIn = useSession((s) => s.signIn)
  const demoPaused = useSession((s) => s.demoPaused)
  const toggleDemo = useSession((s) => s.toggleDemoPaused)
  const [value, setValue] = useState('')
  const [error, setError] = useState(0)
  const [help, setHelp] = useState(false)
  const [compact, setCompact] = useState(false)

  const submit = () => {
    const portal = signIn(value)
    if (portal) nav(`/${portal}`)
    else setError((n) => n + 1)
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
            {/* Demo: running/paused indicator for the shared demo. Production: compact the brand panel. */}
            {firebaseEnabled
              ? <IconBadge icon={Minimize2} label="Compact brand panel" onClick={() => setCompact((c) => !c)} active={compact} />
              : <IconBadge icon={demoPaused ? Play : Pause} label={demoPaused ? 'Shared demo paused — resume' : 'Shared demo running — pause'} onClick={toggleDemo} active={demoPaused} />}
          </div>
          <HelpBadge onClick={() => setHelp(true)} />
        </div>

        <div className="relative z-10 mx-auto my-auto w-full max-w-md py-10">
          <div className="eyebrow mb-3">Aurora Grand Colombo</div>
          <h1 className="mb-3 text-5xl font-bold leading-[1.02] text-white sm:text-6xl">Every shift,<br />a little better.</h1>
          <p className="mb-8 text-sage-300">Step inside your hotel workspace.</p>

          <form onSubmit={(e) => { e.preventDefault(); submit() }}>
            <PassphraseGrid length={PASSPHRASE_LENGTH} value={value} error={error > 0}
              onChange={(v) => { setValue(v); if (error) setError(0) }} onSubmit={submit} />
            <AnimatePresence>
              {error > 0 && (
                <motion.div id="passkey-error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-3 flex items-center justify-between rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  <span>That passkey did not match. Try again.</span>
                  <span className="flex items-center gap-1 text-xs opacity-80"><CornerDownLeft size={12} /> Press Enter to retry.</span>
                </motion.div>
              )}
            </AnimatePresence>
            <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={!value}>Enter workspace</Button>
          </form>
          {usingDefaultPassphrase && <p className="mt-4 text-center text-xs text-sage-300/70">Shared demo · passkey <code className="text-gold-400">miseauroragrand26</code></p>}
        </div>
      </main>
      <HelpDrawer open={help} onClose={() => setHelp(false)} portal="login" />
    </div>
  )
}

