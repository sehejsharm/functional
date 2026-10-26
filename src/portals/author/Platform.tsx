import clsx from 'clsx'
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar, Button, Drawer, Empty, PageHeader, Pill, Section, Tabs } from '@/components/ui'
import { api, uid } from '@/lib/api'
import { byId, useDB } from '@/lib/db'
import { tierLabel } from '@/lib/permissions'
import { fDateTime } from '@/lib/time'
import type { Person, Portal, Room, Shift, Tier } from '@/lib/types'

type Grant = { portal: Portal; tier: Tier }
type AccountRow = { id: string; personId: string; name: string; grants: Grant[]; disabled: boolean }
type TabId = 'people' | 'shifts' | 'rooms' | 'roles' | 'property' | 'requests'
const PORTALS: Portal[] = ['employee', 'manager', 'author']
import { TIME_ZONES as ZONES } from '@/lib/zones'

export function PlatformFoundation() {
  const [tab, setTab] = useState<TabId>('people')
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Platform foundation" tagline="Who works here, where, and when." />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'people', label: 'People & access' }, { id: 'shifts', label: 'Shifts' }, { id: 'rooms', label: 'Rooms' },
        { id: 'roles', label: 'Job roles' }, { id: 'property', label: 'Property' }, { id: 'requests', label: 'Access requests' },
      ]} />
      {tab === 'people' && <People />}
      {tab === 'shifts' && <Shifts />}
      {tab === 'rooms' && <Rooms />}
      {tab === 'roles' && <Roles />}
      {tab === 'property' && <PropertySettings />}
      {tab === 'requests' && <AccessRequests />}
    </div>
  )
}

function PasskeyReveal({ passkey, name, onClose }: { passkey: string | null; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Drawer open={!!passkey} onClose={onClose} title={`Passkey for ${name}`}>
      <p className="text-sm text-sage-300">Give this to {name} in person. It is shown once and cannot be looked up again — reset it if it is lost.</p>
      <div className="mt-4 rounded-xl bg-sage-100 p-4 text-center font-mono text-2xl tracking-[0.2em] text-ink">{passkey?.replace(/(.{6})(.{6})(.{5})/, '$1 $2 $3')}</div>
      <Button variant="gold" className="mt-4 w-full" onClick={() => { void navigator.clipboard.writeText(passkey ?? ''); setCopied(true) }}><Copy size={16} /> {copied ? 'Copied' : 'Copy passkey'}</Button>
    </Drawer>
  )
}

function GrantPicker({ value, onChange }: { value: Grant[]; onChange: (g: Grant[]) => void }) {
  return (
    <div className="space-y-2">
      {PORTALS.map((p) => {
        const g = value.find((x) => x.portal === p)
        return (
          <div key={p} className="flex items-center gap-3">
            <label className="flex w-28 items-center gap-2 text-sm capitalize text-white">
              <input type="checkbox" className="accent-[rgb(201,162,75)]" checked={!!g} onChange={(e) => onChange(e.target.checked ? [...value, { portal: p, tier: 'base' }] : value.filter((x) => x.portal !== p))} />{p}
            </label>
            {g && <select className="input !w-auto !py-1.5" value={g.tier} onChange={(e) => onChange(value.map((x) => (x.portal === p ? { ...x, tier: e.target.value as Tier } : x)))}>
              {(['base', 'senior', 'admin'] as Tier[]).map((t) => <option key={t} value={t}>{p === 'manager' ? tierLabel[t] : t === 'base' ? 'Standard' : t === 'senior' ? 'Senior' : 'Property admin'}</option>)}
            </select>}
          </div>
        )
      })}
    </div>
  )
}

function People() {
  const { people, jobRoles, send } = useDB()
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState<{ person: Person; grants: Grant[]; account?: AccountRow } | null>(null)
  const [reveal, setReveal] = useState<{ passkey: string; name: string } | null>(null)
  const reload = () => api<{ accounts: AccountRow[] }>('/admin/accounts').then((r) => setAccounts(r.accounts)).catch((e) => setErr(e.message))
  useEffect(() => { void reload() }, [])

  const openNew = () => setEdit({ person: { id: uid('person'), propertyId: '', name: '', initials: '', jobRoleId: jobRoles[0]?.id ?? '', title: '', catalogue: ['pilot', 'whole'] }, grants: [{ portal: 'employee', tier: 'base' }] })
  const save = async () => {
    if (!edit) return
    setErr('')
    try {
      await send({ type: 'upsertPerson', person: edit.person })
      if (edit.account) await api(`/admin/accounts/${edit.account.id}/grants`, { method: 'POST', json: { grants: edit.grants } })
      else if (edit.grants.length) {
        const r = await api<{ passkey: string }>('/admin/accounts', { method: 'POST', json: { personId: edit.person.id, name: edit.person.name, grants: edit.grants } })
        setReveal({ passkey: r.passkey, name: edit.person.name })
      }
      setEdit(null); void reload()
    } catch (e) { setErr((e as Error).message) }
  }
  const reset = async (a: AccountRow) => {
    if (!confirm(`Reset ${a.name}'s passkey? Their current passkey stops working and they are signed out everywhere.`)) return
    try { const r = await api<{ passkey: string }>(`/admin/accounts/${a.id}/passkey`, { method: 'POST' }); setReveal({ passkey: r.passkey, name: a.name }) } catch (e) { setErr((e as Error).message) }
  }
  const toggle = async (a: AccountRow) => { try { await api(`/admin/accounts/${a.id}/disable`, { method: 'POST', json: { disabled: !a.disabled } }); void reload() } catch (e) { setErr((e as Error).message) } }

  return (
    <Section title={`Roster · ${people.length} people`} right={<Button variant="gold" disabled={!jobRoles.length} onClick={openNew}><Plus size={16} /> Add person</Button>}>
      {err && <p className="mb-3 text-sm text-danger">{err}</p>}
      {!jobRoles.length && <p className="mb-3 text-sm text-amber">Add a job role first.</p>}
      <ul className="divide-y divide-white/5">
        {people.map((p) => {
          const a = accounts.find((x) => x.personId === p.id)
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar initials={p.initials} size={34} />
              <div className="min-w-0 flex-1"><div className="font-semibold text-white">{p.name}</div><div className="text-xs text-sage-300">{byId(jobRoles, p.jobRoleId)?.name}{p.title && p.title !== byId(jobRoles, p.jobRoleId)?.name ? ` · ${p.title}` : ''}</div></div>
              <div className="flex flex-wrap gap-1">{a ? a.grants.map((g) => <Pill key={g.portal} tone={g.tier === 'base' ? 'neutral' : 'gold'}>{g.portal}{g.tier !== 'base' ? ` · ${g.tier}` : ''}</Pill>) : <Pill tone="warn">No sign-in</Pill>}
                {a?.disabled && <Pill tone="danger">Disabled</Pill>}</div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEdit({ person: p, grants: a?.grants ?? [{ portal: 'employee', tier: 'base' }], account: a })}>Edit</Button>
                {a && <Button size="sm" variant="ghost" onClick={() => void reset(a)}><KeyRound size={14} /> New passkey</Button>}
                {a && <Button size="sm" variant="ghost" onClick={() => void toggle(a)}>{a.disabled ? 'Enable' : 'Disable'}</Button>}
              </div>
            </li>
          )
        })}
      </ul>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.account || people.some((p) => p.id === edit?.person.id) ? 'Edit person' : 'Add person'}>
        {edit && <div className="space-y-4">
          <label className="block"><span className="label">Full name</span><input className="input" value={edit.person.name} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, name: e.target.value } })} /></label>
          <label className="block"><span className="label">Job role</span><select className="input" value={edit.person.jobRoleId} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, jobRoleId: e.target.value } })}>
            {jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="block"><span className="label">Title shown in the app (optional)</span><input className="input" placeholder="e.g. Housekeeping shift manager" value={edit.person.title} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, title: e.target.value } })} /></label>
          <div><span className="label">Sign-in access</span><GrantPicker value={edit.grants} onChange={(grants) => setEdit({ ...edit, grants })} />
            <p className="mt-2 text-xs text-sage-300">{edit.account ? 'Changes apply at their next screen load.' : edit.grants.length ? 'A passkey is created when you save.' : 'Without access they appear on the roster but cannot sign in.'}</p></div>
          <Button variant="gold" className="w-full" disabled={!edit.person.name.trim()} onClick={() => void save()}>Save</Button>
        </div>}
      </Drawer>
      <PasskeyReveal passkey={reveal?.passkey ?? null} name={reveal?.name ?? ''} onClose={() => setReveal(null)} />
    </Section>
  )
}

function Shifts() {
  const { shifts, people, dispatch } = useDB()
  const [edit, setEdit] = useState<Shift | null>(null)
  const blank = (): Shift => ({ id: uid('shift'), propertyId: '', name: '', start: '06:00', end: '14:00', staffTarget: 2, team: 'Housekeeping', memberIds: [] })
  return (
    <Section title="Shifts" right={<Button variant="gold" onClick={() => setEdit(blank())}><Plus size={16} /> Add shift</Button>}>
      {!shifts.length ? <Empty title="No shifts yet" body="Add the shifts your team works, e.g. Morning 06:00–14:00." /> : (
        <ul className="divide-y divide-white/5">{shifts.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex-1"><div className="font-semibold text-white">{s.name} · {s.start}–{s.end}</div><div className="text-xs text-sage-300">{s.team} · {s.memberIds.length} rostered · target {s.staffTarget}</div></div>
            <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${s.name}?`)) dispatch({ type: 'deleteShift', shiftId: s.id }) }}><Trash2 size={14} /></Button>
          </li>))}</ul>
      )}
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.name || 'Shift'}>
        {edit && <div className="space-y-4">
          <label className="block"><span className="label">Name</span><input className="input" placeholder="Morning" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Starts (hotel time)</span><input type="time" className="input" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></label>
            <label><span className="label">Ends</span><input type="time" className="input" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></label>
            <label><span className="label">Team</span><input className="input" value={edit.team} onChange={(e) => setEdit({ ...edit, team: e.target.value })} /></label>
            <label><span className="label">Staff target</span><input type="number" min={0} className="input" value={edit.staffTarget} onChange={(e) => setEdit({ ...edit, staffTarget: Number(e.target.value) })} /></label>
          </div>
          <div><span className="label">Rostered people</span>
            <div className="grid gap-1.5">{people.map((p) => (
              <label key={p.id} className={clsx('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm', edit.memberIds.includes(p.id) ? 'border-gold-500 bg-gold-500/10' : 'border-white/10')}>
                <input type="checkbox" className="accent-[rgb(201,162,75)]" checked={edit.memberIds.includes(p.id)} onChange={(e) => setEdit({ ...edit, memberIds: e.target.checked ? [...edit.memberIds, p.id] : edit.memberIds.filter((x) => x !== p.id) })} />{p.name}
              </label>))}</div></div>
          <p className="text-xs text-sage-300">An end time before the start time runs past midnight.</p>
          <Button variant="gold" className="w-full" disabled={!edit.name.trim()} onClick={() => { dispatch({ type: 'upsertShift', shift: edit }); setEdit(null) }}>Save shift</Button>
        </div>}
      </Drawer>
    </Section>
  )
}

function Rooms() {
  const { rooms, dispatch } = useDB()
  const [n, setN] = useState(''); const [floor, setFloor] = useState(''); const [wing, setWing] = useState('')
  const [bulk, setBulk] = useState('')
  const add = () => { if (!n.trim()) return; dispatch({ type: 'upsertRoom', room: { id: uid('room'), propertyId: '', number: n.trim(), floor: Number(floor) || Number(n.trim()[0]) || 0, wing } as Room }); setN('') }
  const addBulk = () => {
    bulk.split(/[\s,]+/).filter(Boolean).forEach((num) => { if (!rooms.some((r) => r.number === num)) dispatch({ type: 'upsertRoom', room: { id: uid('room'), propertyId: '', number: num, floor: Number(num[0]) || 0, wing } as Room }) })
    setBulk('')
  }
  return (
    <Section title={`Rooms · ${rooms.length}`}>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <input className="input" placeholder="Room number" value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <input className="input" placeholder="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} />
        <input className="input" placeholder="Wing (optional)" value={wing} onChange={(e) => setWing(e.target.value)} />
        <Button variant="gold" onClick={add}><Plus size={16} /> Add</Button>
      </div>
      <div className="mt-3 flex gap-3"><input className="input" placeholder="Add many: 101 102 103 201 202…" value={bulk} onChange={(e) => setBulk(e.target.value)} /><Button variant="primary" onClick={addBulk} disabled={!bulk.trim()}>Add all</Button></div>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-10">
        {[...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map((r) => (
          <div key={r.id} className="group relative rounded-xl border border-white/10 px-2 py-2 text-center">
            <div className="font-display text-lg font-bold text-white">{r.number}</div><div className="text-[10px] text-sage-300">Floor {r.floor}{r.wing ? ` · ${r.wing}` : ''}</div>
            <button aria-label={`Delete room ${r.number}`} onClick={() => dispatch({ type: 'deleteRoom', roomId: r.id })} className="absolute right-1 top-1 hidden text-sage-300 hover:text-danger group-hover:block"><Trash2 size={12} /></button>
          </div>))}
      </div>
    </Section>
  )
}

function Roles() {
  const { jobRoles, dispatch } = useDB()
  const [name, setName] = useState(''); const [team, setTeam] = useState('Housekeeping')
  return (
    <Section title="Job roles">
      <ul className="mb-4 divide-y divide-white/5">{jobRoles.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-2">
          <input className="input" defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && dispatch({ type: 'upsertJobRole', role: { ...r, name: e.target.value } })} aria-label="Role name" />
          <input className="input" defaultValue={r.team} onBlur={(e) => e.target.value !== r.team && dispatch({ type: 'upsertJobRole', role: { ...r, team: e.target.value } })} aria-label="Team" />
        </li>))}</ul>
      <div className="flex gap-3">
        <input className="input" placeholder="New role, e.g. Front desk colleague" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Team" value={team} onChange={(e) => setTeam(e.target.value)} />
        <Button variant="gold" disabled={!name.trim()} onClick={() => { dispatch({ type: 'upsertJobRole', role: { id: uid('role'), propertyId: '', name: name.trim(), team } }); setName('') }}><Plus size={16} /> Add</Button>
      </div>
    </Section>
  )
}

function PropertySettings() {
  const { property, dispatch } = useDB()
  const [p, setP] = useState(property)
  useEffect(() => setP(property), [property])
  const joinLink = `${location.origin}/join/${property.id}`
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Property">
        <div className="space-y-3">
          <label className="block"><span className="label">Name</span><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
          <label className="block"><span className="label">City</span><input className="input" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></label>
          <label className="block"><span className="label">Hotel time zone</span><select className="input" value={p.timeZone} onChange={(e) => setP({ ...p, timeZone: e.target.value })}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
          <label className="block"><span className="label">SOP code numbering</span><input className="input" value={p.codeScheme} onChange={(e) => setP({ ...p, codeScheme: e.target.value })} /></label>
          <label className="block"><span className="label">Default time target (minutes)</span><input type="number" min={1} className="input" value={p.defaultTimeTargetMin} onChange={(e) => setP({ ...p, defaultTimeTargetMin: Number(e.target.value) })} />
            <span className="mt-1 block text-xs text-sage-300">A time target must never override safety or guest privacy.</span></label>
          <Button variant="gold" onClick={() => dispatch({ type: 'updateProperty', patch: { name: p.name, city: p.city, timeZone: p.timeZone, codeScheme: p.codeScheme, defaultTimeTargetMin: p.defaultTimeTargetMin } })}>Save property</Button>
        </div>
      </Section>
      <Section title="Join link">
        <p className="text-sm text-sage-300">New staff open this link to ask to join a shift team. Requests appear in Manager → Join requests.</p>
        <div className="mt-3 flex gap-2"><input className="input" readOnly value={joinLink} /><Button variant="primary" onClick={() => void navigator.clipboard.writeText(joinLink)}><Copy size={14} /></Button></div>
      </Section>
    </div>
  )
}

function AccessRequests() {
  const { audit, people } = useDB()
  const reqs = audit.filter((a) => a.action === 'access.requested')
  return (
    <Section title="Access requests">
      {!reqs.length ? <Empty title="No requests" body="When someone asks for a locked screen, it shows here. Raise their access in People & access." /> : (
        <ul className="divide-y divide-white/5 text-sm">{reqs.map((r) => <li key={r.id} className="flex justify-between py-2"><span><b className="text-white">{byId(people, r.actorId)?.name}</b> asked for {r.detail}</span><span className="text-xs text-sage-300">{fDateTime(r.at)}</span></li>)}</ul>
      )}
    </Section>
  )
}
