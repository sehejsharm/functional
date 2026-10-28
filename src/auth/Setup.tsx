import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, ButtonLink, Field, Input, Logo, Select } from '@/components/ui'
import { api, DEMO } from '@/lib/api'
import { useSession } from '@/lib/session'
import { TIME_ZONES as ZONES } from '@/lib/zones'

function Frame({ title, tagline, children }: { title: string; tagline: string; children: ReactNode }) {
  return (
    <div className="brand-sheen noise relative flex min-h-full items-center justify-center px-4 py-12 sm:px-6">
      <div className="relative z-10 w-full max-w-md">
        <Link to="/" aria-label="Back to sign in"><Logo /></Link>
        <h1 className="mt-8 font-display text-4xl font-bold text-white">{title}</h1>
        <p className="mb-6 mt-2 text-sage-200">{tagline}</p>
        <div className="rounded-2xl bg-surface p-6 text-ink shadow-lift">{children}</div>
      </div>
    </div>
  )
}

const DemoNote = () => (
  <Frame title="Demo mode" tagline="This build runs on sample data in your browser, so there is no hotel server to set up.">
    <p className="text-sm text-ink-2">Sign in with the shared demo passkey to try every portal. To run Mise for a real hotel, deploy the Cloudflare API and set <code className="rounded bg-surface-2 px-1">VITE_API_URL</code>.</p>
    <ButtonLink to="/" variant="primary" block className="mt-5">Go to sign in</ButtonLink>
  </Frame>
)

/** First run only: creates the property and its first Property admin. */
export function SetupScreen() {
  const nav = useNavigate()
  const signIn = useSession((s) => s.signIn)
  const [f, setF] = useState({ setupToken: '', propertyName: '', city: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, adminName: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [passkey, setPasskey] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  useEffect(() => { if (!DEMO) api<{ needsSetup: boolean }>('/setup/status').then((r) => setNeedsSetup(r.needsSetup)).catch(() => setErr('The hotel server cannot be reached.')) }, [])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  if (DEMO) return <DemoNote />
  if (passkey) return (
    <Frame title="Your hotel is ready." tagline="This is your Property admin passkey. Write it down — it is shown only once.">
      <div className="rounded-card border border-line bg-surface-2 p-5 text-center font-mono text-2xl tracking-[0.2em] text-ink" aria-label="Your passkey">{passkey.replace(/(.{6})(.{6})(.{5})/, '$1 $2 $3')}</div>
      <Button variant="secondary" block className="mt-3" icon={copied ? Check : Copy} onClick={() => { void navigator.clipboard?.writeText(passkey); setCopied(true) }}>{copied ? 'Copied' : 'Copy passkey'}</Button>
      <Button variant="primary" size="lg" block className="mt-3" onClick={async () => nav(`/${await signIn(passkey)}`)}>I’ve saved it — continue</Button>
      <p className="mt-4 text-xs text-muted">Next: Platform & audit, to add job roles, rooms, shifts and your team.</p>
    </Frame>
  )
  if (needsSetup === false) return (
    <Frame title="Already set up" tagline="This Mise server already has a property. Sign in with your passkey.">
      <ButtonLink to="/" variant="primary" block>Go to sign in</ButtonLink>
    </Frame>
  )

  return (
    <Frame title="Set up your hotel." tagline="One-time setup. You need the setup token your administrator configured on the server.">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('')
        try { setPasskey((await api<{ passkey: string }>('/setup', { method: 'POST', json: f })).passkey) } catch (e2) { setErr((e2 as Error).message) } finally { setBusy(false) }
      }}>
        <Field label="Setup token" htmlFor="su-token" required><Input id="su-token" type="password" autoComplete="off" value={f.setupToken} onChange={set('setupToken')} required /></Field>
        <Field label="Property name" htmlFor="su-name" required><Input id="su-name" placeholder="Aurora Grand Colombo" value={f.propertyName} onChange={set('propertyName')} required /></Field>
        <Field label="City" htmlFor="su-city"><Input id="su-city" value={f.city} onChange={set('city')} /></Field>
        <Field label="Hotel time zone" htmlFor="su-tz"><Select id="su-tz" value={f.timeZone} onChange={set('timeZone')}>{ZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
        <Field label="Your name" htmlFor="su-admin" required><Input id="su-admin" value={f.adminName} onChange={set('adminName')} required /></Field>
        {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy || needsSetup === null}>{busy ? 'Creating…' : 'Create property'}</Button>
      </form>
    </Frame>
  )
}

/** Public: a new hire asks to join a shift team. */
export function JoinScreen() {
  const { propertyId } = useParams()
  const [info, setInfo] = useState<{ property: { name: string }; jobRoles: { id: string; name: string }[]; shifts: { id: string; name: string }[] } | null>(null)
  const [f, setF] = useState({ name: '', jobRoleId: '', shiftId: '' })
  const [err, setErr] = useState(''); const [done, setDone] = useState(false)
  useEffect(() => {
    if (DEMO) return
    api<typeof info>(`/join/${propertyId}`).then((r) => { setInfo(r); setF((x) => ({ ...x, jobRoleId: r?.jobRoles[0]?.id ?? '', shiftId: r?.shifts[0]?.id ?? '' })) }).catch((e) => setErr(e.message))
  }, [propertyId])
  if (DEMO) return <DemoNote />
  if (done) return <Frame title="Request sent." tagline={`A manager at ${info?.property.name} will review it and give you a passkey.`}><ButtonLink to="/" variant="secondary" block>Back to sign in</ButtonLink></Frame>
  return (
    <Frame title={info ? `Join ${info.property.name}` : 'Join your team'} tagline="Tell your manager who you are and which shift you work.">
      {err && <p role="alert" className="mb-3 text-sm font-medium text-danger">{err}</p>}
      {!info && !err && <p className="text-sm text-muted">Loading…</p>}
      {info && <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await api(`/join/${propertyId}`, { method: 'POST', json: f }); setDone(true) } catch (e2) { setErr((e2 as Error).message) } }}>
        <Field label="Your full name" htmlFor="jn-name" required><Input id="jn-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Your job" htmlFor="jn-role"><Select id="jn-role" value={f.jobRoleId} onChange={(e) => setF({ ...f, jobRoleId: e.target.value })}>{info.jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Shift" htmlFor="jn-shift"><Select id="jn-shift" value={f.shiftId} onChange={(e) => setF({ ...f, shiftId: e.target.value })}>{info.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Button type="submit" variant="primary" size="lg" block disabled={!f.name.trim() || !f.shiftId}>Ask to join</Button>
      </form>}
    </Frame>
  )
}
