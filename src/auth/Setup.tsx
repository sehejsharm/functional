import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Logo } from '@/components/ui'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'

import { TIME_ZONES as ZONES } from '@/lib/zones'

function Frame({ title, tagline, children }: { title: string; tagline: string; children: React.ReactNode }) {
  return (
    <div className="brand-sheen noise relative flex min-h-full items-center justify-center px-6 py-12">
      <div className="relative z-10 w-full max-w-md">
        <Link to="/"><Logo /></Link>
        <h1 className="mt-8 text-4xl font-bold text-white">{title}</h1>
        <p className="mb-6 mt-2 text-sage-300">{tagline}</p>
        {children}
      </div>
    </div>
  )
}

/** First run only: creates the property and its first Property admin. */
export function SetupScreen() {
  const nav = useNavigate()
  const signIn = useSession((s) => s.signIn)
  const [f, setF] = useState({ setupToken: '', propertyName: '', city: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, adminName: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [passkey, setPasskey] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  useEffect(() => { api<{ needsSetup: boolean }>('/setup/status').then((r) => setNeedsSetup(r.needsSetup)).catch(() => setErr('The hotel server cannot be reached.')) }, [])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  if (passkey) return (
    <Frame title="Your hotel is ready." tagline="This is your Property admin passkey. Write it down — it is shown only once.">
      <div className="rounded-xl bg-sage-100 p-5 text-center font-mono text-2xl tracking-[0.2em] text-ink">{passkey.replace(/(.{6})(.{6})(.{5})/, '$1 $2 $3')}</div>
      <Button variant="ghost" className="mt-3 w-full" onClick={() => void navigator.clipboard.writeText(passkey)}><Copy size={16} /> Copy</Button>
      <Button variant="gold" size="lg" className="mt-3 w-full" onClick={async () => nav(`/${await signIn(passkey)}`)}>I've saved it — continue</Button>
      <p className="mt-4 text-xs text-sage-300">Next: Author → Platform foundation to add job roles, rooms, shifts and your team.</p>
    </Frame>
  )
  if (needsSetup === false) return <Frame title="Already set up" tagline="This Mise server already has a property. Sign in with your passkey."><Link to="/"><Button variant="gold">Go to sign in</Button></Link></Frame>

  return (
    <Frame title="Set up your hotel." tagline="One-time setup. You need the setup token your administrator configured on the server.">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('')
        try { setPasskey((await api<{ passkey: string }>('/setup', { method: 'POST', json: f })).passkey) } catch (e2) { setErr((e2 as Error).message) } finally { setBusy(false) }
      }}>
        <label className="block"><span className="label">Setup token</span><input className="input" type="password" autoComplete="off" value={f.setupToken} onChange={set('setupToken')} required /></label>
        <label className="block"><span className="label">Property name</span><input className="input" placeholder="Aurora Grand Colombo" value={f.propertyName} onChange={set('propertyName')} required /></label>
        <label className="block"><span className="label">City</span><input className="input" value={f.city} onChange={set('city')} /></label>
        <label className="block"><span className="label">Hotel time zone</span><select className="input" value={f.timeZone} onChange={set('timeZone')}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className="block"><span className="label">Your name</span><input className="input" value={f.adminName} onChange={set('adminName')} required /></label>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy || needsSetup === null}>{busy ? 'Creating…' : 'Create property'}</Button>
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
    api<typeof info>(`/join/${propertyId}`).then((r) => { setInfo(r); setF((x) => ({ ...x, jobRoleId: r?.jobRoles[0]?.id ?? '', shiftId: r?.shifts[0]?.id ?? '' })) }).catch((e) => setErr(e.message))
  }, [propertyId])
  if (done) return <Frame title="Request sent." tagline={`A manager at ${info?.property.name} will review it and give you a passkey.`}><span /></Frame>
  return (
    <Frame title={info ? `Join ${info.property.name}` : 'Join your team'} tagline="Tell your manager who you are and which shift you work.">
      {err && <p className="mb-3 text-sm text-danger">{err}</p>}
      {info && <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await api(`/join/${propertyId}`, { method: 'POST', json: f }); setDone(true) } catch (e2) { setErr((e2 as Error).message) } }}>
        <label className="block"><span className="label">Your full name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label className="block"><span className="label">Your job</span><select className="input" value={f.jobRoleId} onChange={(e) => setF({ ...f, jobRoleId: e.target.value })}>{info.jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="block"><span className="label">Shift</span><select className="input" value={f.shiftId} onChange={(e) => setF({ ...f, shiftId: e.target.value })}>{info.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={!f.name.trim() || !f.shiftId}>Ask to join</Button>
      </form>}
    </Frame>
  )
}
