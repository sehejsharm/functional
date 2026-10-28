// Platform & audit (Property admin): who works here and how they sign in, shifts, rooms, job roles, property
// settings, plus the audit log and release policy. Roster, rooms and shifts go through the shared domain rules;
// sign-in accounts and passkeys live in the server database (the /admin API), so they need the live server.
import { Building2, CalendarClock, Copy, DoorOpen, KeyRound, Link2, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, DataTable, Drawer, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, type Column,
} from '@/components/ui'
import { api, uid } from '@/lib/api'
import { byId, useDB } from '@/lib/db'
import { tierLabel } from '@/lib/permissions'
import { useGrants } from '@/lib/session'
import { fDateTime } from '@/lib/time'
import { confirm, toast } from '@/lib/toast'
import type { Occupancy, Person, Portal, Room, Shift, Tier } from '@/lib/types'
import { TIME_ZONES } from '@/lib/zones'
import { relTime } from '@/shell/PortalShell'
import { AuditLog, DataTab, Policy, RolesOverview } from './Gated'

type Grant = { portal: Portal; tier: Tier }
type AccountRow = { id: string; personId: string; name: string; grants: Grant[]; disabled: boolean }
type TabId = 'people' | 'shifts' | 'rooms' | 'roles' | 'property' | 'audit' | 'policy' | 'data'
const PORTALS: Portal[] = ['employee', 'manager', 'author']
const PORTAL_NAME: Record<Portal, string> = { employee: 'Employee', manager: 'Manager', author: 'Author' }
const tierName = (p: Portal, t: Tier) => (p === 'manager' ? tierLabel[t] : t === 'base' ? 'Standard' : t === 'senior' ? 'Senior' : 'Property admin')
const OCC: Record<Occupancy, string> = { vacant_clean: 'Vacant clean', vacant_dirty: 'Vacant dirty', occupied: 'Occupied', due_out: 'Due out', arrival: 'Arrival', out_of_order: 'Out of order' }

export function PlatformFoundation() {
  const db = useDB()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) || 'people'
  const setTab = (t: TabId) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n }, { replace: true })
  const requests = db.audit.filter((a) => a.action === 'access.requested').length
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Platform & audit" description={`Who works at ${db.property.name || 'this property'}, where and when — and the permanent record of every change.`}>
        <Tabs value={tab} onChange={setTab} items={[
          { id: 'people', label: 'People & access', count: db.people.length }, { id: 'shifts', label: 'Shifts', count: db.shifts.length }, { id: 'rooms', label: 'Rooms', count: db.rooms.length },
          { id: 'roles', label: 'Job roles' }, { id: 'property', label: 'Property', count: requests || undefined }, { id: 'audit', label: 'Audit log', count: db.audit.length },
          { id: 'policy', label: 'Release policy' }, { id: 'data', label: 'Data' },
        ]} />
      </PageHeader>
      {tab === 'people' && <People />}
      {tab === 'shifts' && <Shifts />}
      {tab === 'rooms' && <Rooms />}
      {tab === 'roles' && <><JobRoles /><RolesOverview /></>}
      {tab === 'property' && <PropertySettings />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'policy' && <Policy />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}

// ── People & access ─────────────────────────────────────────────────────────

function PasskeyReveal({ passkey, name, onClose }: { passkey: string | null; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal open={!!passkey} onClose={() => { setCopied(false); onClose() }} size="sm" title={`Passkey for ${name}`}
      description="Give it to them in person. It is shown once and can’t be looked up again — issue a new one if it is lost."
      footer={<><Button variant="secondary" onClick={() => { setCopied(false); onClose() }}>Done</Button>
        <Button variant="primary" icon={Copy} onClick={() => { void navigator.clipboard?.writeText(passkey ?? ''); setCopied(true) }}>{copied ? 'Copied' : 'Copy passkey'}</Button></>}>
      <div className="rounded-card border border-line bg-surface-2 p-5 text-center font-mono text-2xl tracking-[0.2em] text-ink" aria-label="Passkey">{passkey?.replace(/(.{6})(.{6})(.{5})/, '$1 $2 $3')}</div>
    </Modal>
  )
}

function GrantPicker({ value, onChange, disabled }: { value: Grant[]; onChange: (g: Grant[]) => void; disabled?: boolean }) {
  return (
    <div className="divide-y divide-line rounded-card border border-line">
      {PORTALS.map((p) => {
        const g = value.find((x) => x.portal === p)
        return (
          <div key={p} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <Checkbox checked={!!g} disabled={disabled} label={`${PORTAL_NAME[p]} portal`} onChange={(on) => onChange(on ? [...value, { portal: p, tier: 'base' }] : value.filter((x) => x.portal !== p))} />
            {g && <Select aria-label={`${PORTAL_NAME[p]} access tier`} className="h-9 w-auto py-1.5" disabled={disabled} value={g.tier} onChange={(e) => onChange(value.map((x) => (x.portal === p ? { ...x, tier: e.target.value as Tier } : x)))}>
              {(['base', 'senior', 'admin'] as Tier[]).map((t) => <option key={t} value={t}>{tierName(p, t)}</option>)}
            </Select>}
          </div>
        )
      })}
    </div>
  )
}

type Edit = { person: Person; grants: Grant[]; account?: AccountRow; isNew: boolean }

function People() {
  const { people, jobRoles, send, mode } = useDB()
  const demo = mode === 'demo'
  const demoGrants = useGrants()
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [edit, setEdit] = useState<Edit | null>(null)
  const [saving, setSaving] = useState(false)
  const [reveal, setReveal] = useState<{ passkey: string; name: string } | null>(null)
  const reload = useCallback(() => {
    if (demo) {
      // The shared demo has one account that opens each portal as a different person.
      setAccounts(demoGrants.map((g) => ({ id: `demo-${g.portal}`, personId: g.personId, name: byId(people, g.personId)?.name ?? g.personId, grants: [{ portal: g.portal, tier: g.tier }], disabled: false })))
      return
    }
    api<{ accounts: AccountRow[] }>('/admin/accounts').then((r) => { setAccounts(r.accounts); setLoadErr('') }).catch((e) => setLoadErr((e as Error).message))
  }, [demo, demoGrants, people])
  useEffect(() => { reload() }, [reload])

  const openNew = () => setEdit({ isNew: true, person: { id: uid('person'), propertyId: '', name: '', initials: '', jobRoleId: jobRoles[0]?.id ?? '', title: '', catalogue: ['pilot', 'whole'], status: 'active' }, grants: [{ portal: 'employee', tier: 'base' }] })
  const save = async () => {
    if (!edit) return
    setSaving(true)
    try {
      await send({ type: 'upsertPerson', person: edit.person })
      if (!demo) {
        if (edit.account) await api(`/admin/accounts/${edit.account.id}/grants`, { method: 'POST', json: { grants: edit.grants } })
        else if (edit.grants.length) {
          const r = await api<{ passkey: string }>('/admin/accounts', { method: 'POST', json: { personId: edit.person.id, name: edit.person.name, grants: edit.grants } })
          setReveal({ passkey: r.passkey, name: edit.person.name })
        }
      }
      toast.success(edit.isNew ? `${edit.person.name} added` : 'Changes saved', { description: !demo && edit.account ? 'New access applies at their next screen load.' : undefined })
      setEdit(null); reload()
    } catch (e) { toast.error('Not saved', { description: (e as Error).message }) } finally { setSaving(false) }
  }
  const newPasskey = async (a: AccountRow) => {
    if (!await confirm({ title: `Issue a new passkey for ${a.name}?`, body: 'Their current passkey stops working straight away and they are signed out on every device.', confirmLabel: 'Issue new passkey', tone: 'danger' })) return
    try { const r = await api<{ passkey: string }>(`/admin/accounts/${a.id}/passkey`, { method: 'POST' }); setReveal({ passkey: r.passkey, name: a.name }) } catch (e) { toast.error('Not changed', { description: (e as Error).message }) }
  }
  const toggle = async (a: AccountRow) => {
    if (!a.disabled && !await confirm({ title: `Disable ${a.name}’s sign-in?`, body: 'They are signed out everywhere and can’t sign in until you enable them again. Their history stays.', confirmLabel: 'Disable sign-in', tone: 'danger' })) return
    try { await api(`/admin/accounts/${a.id}/disable`, { method: 'POST', json: { disabled: !a.disabled } }); toast.success(a.disabled ? `${a.name} can sign in again` : `${a.name} can no longer sign in`); reload() } catch (e) { toast.error('Not changed', { description: (e as Error).message }) }
  }

  type Row = Person & { role: string; account?: AccountRow; grants: Grant[] }
  const rows: Row[] = people.map((p) => {
    const own = accounts.filter((a) => a.personId === p.id)
    return { ...p, role: byId(jobRoles, p.jobRoleId)?.name ?? '—', account: own[0], grants: own.flatMap((a) => a.grants) }
  })
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Person', sort: (r) => r.name, csv: (r) => r.name, cell: (r) => (
      <div className="flex items-center gap-3"><Avatar name={r.name} size={32} /><div className="min-w-0"><div className="truncate font-medium text-ink">{r.name}</div><div className="truncate text-xs text-muted">{r.title || r.role}</div></div></div>
    ) },
    { key: 'role', header: 'Job role', sort: (r) => r.role, csv: (r) => r.role, hideOnMobile: true, cell: (r) => <span className="text-ink-2">{r.role}</span> },
    { key: 'status', header: 'Status', sort: (r) => r.status ?? 'active', hideOnMobile: true, cell: (r) => <Badge tone={r.status === 'on_leave' ? 'warning' : r.status === 'inactive' ? 'neutral' : 'success'} dot>{r.status === 'on_leave' ? 'On leave' : r.status === 'inactive' ? 'Inactive' : 'Active'}</Badge> },
    { key: 'access', header: 'Sign-in access', csv: (r) => r.grants.map((g) => `${g.portal}:${g.tier}`).join(' '), cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.grants.length ? r.grants.map((g) => <Badge key={g.portal} tone={g.tier === 'base' ? 'neutral' : 'gold'}>{PORTAL_NAME[g.portal]}{g.tier !== 'base' ? ` · ${tierName(g.portal, g.tier)}` : ''}</Badge>) : <Badge tone="warning">No sign-in</Badge>}
        {r.account?.disabled && <Badge tone="danger">Disabled</Badge>}
      </div>
    ) },
    { key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', cell: (r) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEdit({ isNew: false, person: r, grants: r.account?.grants ?? (demo ? r.grants : [{ portal: 'employee', tier: 'base' }]), account: demo ? undefined : r.account })}>Edit</Button>
        {!demo && r.account && <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => void newPasskey(r.account!)}>New passkey</Button>}
        {!demo && r.account && <Button size="sm" variant="ghost" onClick={() => void toggle(r.account!)}>{r.account.disabled ? 'Enable' : 'Disable'}</Button>}
      </div>
    ) },
  ]
  return (
    <div className="space-y-4">
      {demo && <p className="rounded-card border border-dashed border-line-strong bg-surface px-4 py-3 text-sm text-ink-2">Demo mode: everyone shares one demo passkey. On the live server each person gets their own passkey here, with the portals and tier you choose.</p>}
      {loadErr && <p role="alert" className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">Sign-in accounts could not be loaded: {loadErr}</p>}
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} search={(r) => `${r.name} ${r.role} ${r.title} ${r.employeeNo ?? ''}`} searchPlaceholder="Search people"
        initialSort={{ key: 'name', dir: 'asc' }} pageSize={12} exportName="mise-people" caption="People and sign-in access"
        actions={<Button variant="primary" icon={UserPlus} disabled={!jobRoles.length} onClick={openNew}>Add person</Button>}
        empty={<EmptyState compact icon={Users} title="No one on the roster yet" description={jobRoles.length ? 'Add your team, then give each person the portals they need.' : 'Add a job role first (Job roles tab).'} />} />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? 'Add person' : `Edit ${edit?.person.name ?? ''}`}
        description={edit?.isNew ? 'They appear on the roster straight away.' : undefined}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={saving} disabled={!edit?.person.name.trim() || !edit?.person.jobRoleId} onClick={() => void save()}>Save</Button></>}>
        {edit && <div className="space-y-4">
          <Field label="Full name" htmlFor="pf-name" required><Input id="pf-name" value={edit.person.name} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, name: e.target.value } })} autoFocus /></Field>
          <Field label="Job role" htmlFor="pf-role" required><Select id="pf-role" value={edit.person.jobRoleId} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, jobRoleId: e.target.value } })}>
            {jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="Title shown in the app" htmlFor="pf-title" hint="Optional, e.g. Housekeeping shift manager"><Input id="pf-title" value={edit.person.title} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, title: e.target.value } })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee number" htmlFor="pf-no"><Input id="pf-no" value={edit.person.employeeNo ?? ''} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, employeeNo: e.target.value } })} /></Field>
            <Field label="Status" htmlFor="pf-status"><Select id="pf-status" value={edit.person.status ?? 'active'} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, status: e.target.value as Person['status'] } })}>
              <option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></Select></Field>
            <Field label="Email" htmlFor="pf-email"><Input id="pf-email" type="email" value={edit.person.email ?? ''} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, email: e.target.value } })} /></Field>
            <Field label="Phone" htmlFor="pf-phone"><Input id="pf-phone" value={edit.person.phone ?? ''} onChange={(e) => setEdit({ ...edit, person: { ...edit.person, phone: e.target.value } })} /></Field>
          </div>
          <div>
            <div className="label">Sign-in access</div>
            <GrantPicker value={edit.grants} disabled={demo} onChange={(grants) => setEdit({ ...edit, grants })} />
            <p className="hint">{demo ? 'Fixed in the shared demo.' : edit.account ? 'Applies at their next screen load.' : edit.grants.length ? 'A personal passkey is created when you save.' : 'Without access they are on the roster but can’t sign in.'}</p>
          </div>
        </div>}
      </Drawer>
      <PasskeyReveal passkey={reveal?.passkey ?? null} name={reveal?.name ?? ''} onClose={() => setReveal(null)} />
    </div>
  )
}

// ── Shifts ──────────────────────────────────────────────────────────────────

/** The stored (recurring) form of a shift, for editing. */
const stored = (s: Shift): Shift => ({ id: s.id, propertyId: s.propertyId, name: s.name, start: s.startTime ?? s.start, end: s.endTime ?? s.end, staffTarget: s.staffTarget, team: s.team, memberIds: s.rosterIds ?? s.memberIds })

function Shifts() {
  const { shifts, people, jobRoles, tasks, dispatch } = useDB()
  const [edit, setEdit] = useState<{ shift: Shift; isNew: boolean } | null>(null)
  const blank = (): Shift => ({ id: uid('shift'), propertyId: '', name: '', start: '06:00', end: '14:00', staffTarget: 4, team: 'Housekeeping', memberIds: [] })
  const save = () => {
    if (!edit) return
    if (dispatch({ type: 'upsertShift', shift: edit.shift }).ok) { toast.success(edit.isNew ? `${edit.shift.name} shift added` : `${edit.shift.name} shift saved`); setEdit(null) }
  }
  const remove = async (s: Shift) => {
    if (!await confirm({ title: `Delete the ${s.name} shift?`, body: 'Its roster goes with it. Shifts with open rooms can’t be deleted.', confirmLabel: 'Delete shift', tone: 'danger' })) return
    if (dispatch({ type: 'deleteShift', shiftId: s.id }).ok) toast.success(`${s.name} shift deleted`)
  }
  const columns: Column<Shift>[] = [
    { key: 'name', header: 'Shift', sort: (s) => s.startTime ?? s.start, csv: (s) => s.name, cell: (s) => <div><div className="font-medium text-ink">{s.name}</div><div className="text-xs text-muted">{s.team}</div></div> },
    { key: 'time', header: 'Hours (hotel time)', csv: (s) => `${s.startTime}–${s.endTime}`, cell: (s) => <span className="tabular text-ink-2">{s.startTime} – {s.endTime}{(s.endTime ?? '') <= (s.startTime ?? '') && <span className="ml-1 text-xs text-muted">(overnight)</span>}</span> },
    { key: 'roster', header: 'Rostered', align: 'right', sort: (s) => (s.rosterIds ?? s.memberIds).length, csv: (s) => (s.rosterIds ?? s.memberIds).length, cell: (s) => <span className="tabular">{(s.rosterIds ?? s.memberIds).length} <span className="text-muted">/ {s.staffTarget}</span></span> },
    { key: 'open', header: 'Open rooms', align: 'right', hideOnMobile: true, sort: (s) => tasks.filter((t) => t.shiftId === s.id && t.status !== 'done' && t.status !== 'cancelled').length, cell: (s) => tasks.filter((t) => t.shiftId === s.id && t.status !== 'done' && t.status !== 'cancelled').length },
    { key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', cell: (s) => (
      <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit({ shift: stored(s), isNew: false })}>Edit</Button><Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${s.name}`} onClick={() => void remove(s)} /></div>
    ) },
  ]
  const e = edit?.shift
  return (
    <div className="space-y-4">
      <DataTable rows={shifts} columns={columns} rowKey={(s) => s.id} initialSort={{ key: 'name', dir: 'asc' }} exportName="mise-shifts" caption="Shifts"
        actions={<Button variant="primary" icon={Plus} onClick={() => setEdit({ shift: blank(), isNew: true })}>Add shift</Button>}
        empty={<EmptyState compact icon={CalendarClock} title="No shifts yet" description="Add the shifts your team works, e.g. Morning 06:00–14:00." />} />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? 'Add shift' : `Edit ${e?.name ?? 'shift'}`} description="A recurring shift. An end time before the start runs past midnight."
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" disabled={!e?.name.trim()} onClick={save}>Save shift</Button></>}>
        {edit && e && <div className="space-y-4">
          <Field label="Name" htmlFor="sf-name" required><Input id="sf-name" placeholder="Morning" value={e.name} onChange={(x) => setEdit({ ...edit, shift: { ...e, name: x.target.value } })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" htmlFor="sf-start"><Input id="sf-start" type="time" value={e.start} onChange={(x) => setEdit({ ...edit, shift: { ...e, start: x.target.value } })} /></Field>
            <Field label="Ends" htmlFor="sf-end"><Input id="sf-end" type="time" value={e.end} onChange={(x) => setEdit({ ...edit, shift: { ...e, end: x.target.value } })} /></Field>
            <Field label="Team" htmlFor="sf-team"><Input id="sf-team" value={e.team} onChange={(x) => setEdit({ ...edit, shift: { ...e, team: x.target.value } })} /></Field>
            <Field label="Staff target" htmlFor="sf-target"><Input id="sf-target" type="number" min={0} value={e.staffTarget} onChange={(x) => setEdit({ ...edit, shift: { ...e, staffTarget: Number(x.target.value) } })} /></Field>
          </div>
          <div>
            <div className="label">Standing roster <span className="font-normal text-muted">· {e.memberIds.length} selected</span></div>
            <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-card border border-line">
              {[...people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <div key={p.id} className="px-3 py-2">
                  <Checkbox checked={e.memberIds.includes(p.id)} label={p.name} description={byId(jobRoles, p.jobRoleId)?.name}
                    onChange={(on) => setEdit({ ...edit, shift: { ...e, memberIds: on ? [...e.memberIds, p.id] : e.memberIds.filter((x) => x !== p.id) } })} />
                </div>
              ))}
            </div>
            <p className="hint">One-day cover is arranged in Shift cover and doesn’t change the standing roster.</p>
          </div>
        </div>}
      </Drawer>
    </div>
  )
}

// ── Rooms ───────────────────────────────────────────────────────────────────

function Rooms() {
  const { rooms, tasks, dispatch } = useDB()
  const [add, setAdd] = useState(false)
  const [edit, setEdit] = useState<Room | null>(null)
  const [bulk, setBulk] = useState('')
  const [wing, setWing] = useState('')
  const [type, setType] = useState('')
  const sorted = useMemo(() => [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })), [rooms])
  const addAll = () => {
    const nums = [...new Set(bulk.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))]
    let n = 0
    nums.forEach((num) => { if (!rooms.some((r) => r.number === num) && dispatch({ type: 'upsertRoom', room: { id: uid('room'), propertyId: '', number: num, floor: Number(num.slice(0, -2)) || Number(num[0]) || 0, wing, type: type || undefined, occupancy: 'vacant_clean' } }).ok) n++ })
    if (n) toast.success(`${n} room${n === 1 ? '' : 's'} added`, { description: nums.length > n ? `${nums.length - n} already existed.` : undefined })
    setBulk(''); setAdd(false)
  }
  const remove = async (r: Room) => {
    if (!await confirm({ title: `Delete room ${r.number}?`, body: 'Rooms with open work can’t be deleted. Its past rooms stay in the history.', confirmLabel: 'Delete room', tone: 'danger' })) return
    if (dispatch({ type: 'deleteRoom', roomId: r.id }).ok) { toast.success(`Room ${r.number} deleted`); setEdit(null) }
  }
  const columns: Column<Room>[] = [
    { key: 'number', header: 'Room', sort: (r) => r.number.padStart(6, '0'), csv: (r) => r.number, cell: (r) => <span className="font-semibold tabular text-ink">{r.number}{r.vip && <Badge tone="gold" className="ml-2">VIP</Badge>}</span> },
    { key: 'floor', header: 'Floor', sort: (r) => r.floor, align: 'right', cell: (r) => r.floor },
    { key: 'wing', header: 'Wing', sort: (r) => r.wing, hideOnMobile: true, cell: (r) => r.wing || <span className="text-muted">—</span> },
    { key: 'type', header: 'Type', sort: (r) => r.type ?? '', hideOnMobile: true, cell: (r) => r.type || <span className="text-muted">—</span> },
    { key: 'occ', header: 'Status', sort: (r) => r.occupancy ?? '', csv: (r) => (r.occupancy ? OCC[r.occupancy] : ''), cell: (r) => r.occupancy ? <Badge tone={r.occupancy === 'out_of_order' ? 'danger' : r.occupancy === 'occupied' ? 'info' : 'neutral'}>{OCC[r.occupancy]}</Badge> : <span className="text-muted">—</span> },
    { key: 'open', header: 'Open rooms', align: 'right', hideOnMobile: true, sort: (r) => tasks.filter((t) => t.roomId === r.id && t.status !== 'done' && t.status !== 'cancelled').length, cell: (r) => tasks.filter((t) => t.roomId === r.id && t.status !== 'done' && t.status !== 'cancelled').length },
  ]
  return (
    <div className="space-y-4">
      <DataTable rows={sorted} columns={columns} rowKey={(r) => r.id} search={(r) => `${r.number} ${r.wing} ${r.type ?? ''} ${r.guestName ?? ''}`} searchPlaceholder="Search rooms" pageSize={15}
        exportName="mise-rooms" caption="Rooms" onRowClick={(r) => setEdit(r)}
        actions={<Button variant="primary" icon={Plus} onClick={() => setAdd(true)}>Add rooms</Button>}
        empty={<EmptyState compact icon={DoorOpen} title="No rooms yet" description="Add your room numbers — one at a time or many at once." />} />
      <Modal open={add} onClose={() => setAdd(false)} title="Add rooms" description="Type one or many room numbers, separated by spaces or commas."
        footer={<><Button variant="secondary" onClick={() => setAdd(false)}>Cancel</Button><Button variant="primary" disabled={!bulk.trim()} onClick={addAll}>Add rooms</Button></>}>
        <div className="space-y-4">
          <Field label="Room numbers" htmlFor="rf-nums" hint="Floor is taken from the number (e.g. 1204 → floor 12)."><Input id="rf-nums" placeholder="101 102 103 201 202" value={bulk} onChange={(e) => setBulk(e.target.value)} autoFocus /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Wing" htmlFor="rf-wing"><Input id="rf-wing" placeholder="Optional" value={wing} onChange={(e) => setWing(e.target.value)} /></Field>
            <Field label="Room type" htmlFor="rf-type"><Input id="rf-type" placeholder="e.g. Deluxe King" value={type} onChange={(e) => setType(e.target.value)} /></Field>
          </div>
        </div>
      </Modal>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit ? `Room ${edit.number}` : ''}
        footer={edit && <><Button variant="ghost" icon={Trash2} className="mr-auto text-danger" onClick={() => void remove(edit)}>Delete</Button><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="primary" disabled={!edit.number.trim()} onClick={() => { if (dispatch({ type: 'upsertRoom', room: edit }).ok) { toast.success(`Room ${edit.number} saved`); setEdit(null) } }}>Save</Button></>}>
        {edit && <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Number" htmlFor="re-num" required><Input id="re-num" value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} /></Field>
            <Field label="Floor" htmlFor="re-floor"><Input id="re-floor" type="number" value={edit.floor} onChange={(e) => setEdit({ ...edit, floor: Number(e.target.value) })} /></Field>
            <Field label="Wing" htmlFor="re-wing"><Input id="re-wing" value={edit.wing} onChange={(e) => setEdit({ ...edit, wing: e.target.value })} /></Field>
            <Field label="Room type" htmlFor="re-type"><Input id="re-type" value={edit.type ?? ''} onChange={(e) => setEdit({ ...edit, type: e.target.value })} /></Field>
          </div>
          <Field label="Status" htmlFor="re-occ" hint="Out-of-order rooms can’t be assigned work."><Select id="re-occ" value={edit.occupancy ?? ''} onChange={(e) => setEdit({ ...edit, occupancy: (e.target.value || undefined) as Occupancy | undefined })}>
            <option value="">Not set</option>{(Object.keys(OCC) as Occupancy[]).map((k) => <option key={k} value={k}>{OCC[k]}</option>)}</Select></Field>
          <Field label="Guest name" htmlFor="re-guest" hint="Optional. Shown to managers only."><Input id="re-guest" value={edit.guestName ?? ''} onChange={(e) => setEdit({ ...edit, guestName: e.target.value })} /></Field>
          <Checkbox checked={!!edit.vip} label="VIP guest" description="Flags the room on the property board." onChange={(vip) => setEdit({ ...edit, vip })} />
        </div>}
      </Drawer>
    </div>
  )
}

// ── Job roles ───────────────────────────────────────────────────────────────

function JobRoles() {
  const { jobRoles, dispatch } = useDB()
  const [name, setName] = useState(''); const [team, setTeam] = useState('Housekeeping')
  const [edit, setEdit] = useState<{ id: string; name: string; team: string } | null>(null)
  return (
    <Card className="mb-6">
      <CardHeader icon={Building2} title="Job roles" description="Each SOP is written for one job role; only people in that role can be assigned it." />
      <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-end">
        <Field label="New role" htmlFor="jr-name" className="flex-1"><Input id="jr-name" placeholder="e.g. Front desk colleague" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Team" htmlFor="jr-team" className="sm:w-56"><Input id="jr-team" value={team} onChange={(e) => setTeam(e.target.value)} /></Field>
        <Button variant="primary" icon={Plus} disabled={!name.trim()} onClick={() => { if (dispatch({ type: 'upsertJobRole', role: { id: uid('role'), propertyId: '', name: name.trim(), team } }).ok) { toast.success(`${name.trim()} added`); setName('') } }}>Add role</Button>
      </div>
      <ul className="divide-y divide-line">
        {jobRoles.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            {edit?.id === r.id ? <>
              <Input aria-label="Role name" className="h-9 flex-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <Input aria-label="Team" className="h-9 sm:w-56" value={edit.team} onChange={(e) => setEdit({ ...edit, team: e.target.value })} />
              <Button size="sm" variant="primary" disabled={!edit.name.trim()} onClick={() => { if (dispatch({ type: 'upsertJobRole', role: { ...r, name: edit.name.trim(), team: edit.team } }).ok) setEdit(null) }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            </> : <>
              <span className="flex-1 font-medium text-ink">{r.name}</span><span className="text-sm text-ink-2">{r.team}</span>
              <Button size="sm" variant="ghost" onClick={() => setEdit({ id: r.id, name: r.name, team: r.team })}>Rename</Button>
            </>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ── Property ────────────────────────────────────────────────────────────────

function PropertySettings() {
  const { property, dispatch, audit, people, mode } = useDB()
  const [p, setP] = useState(property)
  useEffect(() => setP(property), [property])
  const joinLink = location.hash.startsWith('#/') ? `${location.origin}${location.pathname}#/join/${property.id}` : `${location.origin}/join/${property.id}`
  const requests = audit.filter((a) => a.action === 'access.requested')
  const dirty = JSON.stringify(p) !== JSON.stringify(property)
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Card>
        <CardHeader icon={Building2} title="Property" description="Used across every portal. Times everywhere are this hotel’s local time." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="pp-name" required><Input id="pp-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="City" htmlFor="pp-city"><Input id="pp-city" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></Field>
          <Field label="Hotel time zone" htmlFor="pp-tz"><Select id="pp-tz" value={p.timeZone} onChange={(e) => setP({ ...p, timeZone: e.target.value })}>{TIME_ZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          <Field label="SOP code numbering" htmlFor="pp-code" hint="e.g. {TEAM}-{NUMBER}"><Input id="pp-code" value={p.codeScheme} onChange={(e) => setP({ ...p, codeScheme: e.target.value })} /></Field>
          <Field label="Default time target (minutes)" htmlFor="pp-tt" hint="A time target never overrides safety or guest privacy."><Input id="pp-tt" type="number" min={1} max={240} value={p.defaultTimeTargetMin} onChange={(e) => setP({ ...p, defaultTimeTargetMin: Number(e.target.value) })} /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" disabled={!dirty} onClick={() => setP(property)}>Discard</Button>
          <Button variant="primary" disabled={!dirty || !p.name.trim()} onClick={() => { if (dispatch({ type: 'updateProperty', patch: { name: p.name.trim(), city: p.city, timeZone: p.timeZone, codeScheme: p.codeScheme, defaultTimeTargetMin: p.defaultTimeTargetMin } }).ok) toast.success('Property saved') }}>Save property</Button>
        </div>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader icon={Link2} title="Join link" description="New staff open this to ask to join a shift team. Requests appear in Manager → Join requests." />
          <div className="flex gap-2 p-5"><Input readOnly aria-label="Join link" value={joinLink} onFocus={(e) => e.target.select()} />
            <Button variant="secondary" icon={Copy} aria-label="Copy join link" disabled={mode === 'demo'} onClick={() => { void navigator.clipboard?.writeText(joinLink); toast.success('Join link copied') }} /></div>
          {mode === 'demo' && <p className="px-5 pb-4 text-xs text-muted">Join links work on the live server.</p>}
        </Card>
        <Card>
          <CardHeader icon={KeyRound} title="Access requests" description="People asking for a locked screen. Raise their access in People & access." />
          {!requests.length ? <EmptyState compact title="No requests" description="When someone asks for a locked screen, it shows here." /> : (
            <ul className="divide-y divide-line">{requests.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <span><b className="font-medium text-ink">{byId(people, r.actorId)?.name ?? 'Someone'}</b> <span className="text-ink-2">asked for {r.detail}</span></span>
                <span className="shrink-0 text-xs text-muted" title={fDateTime(r.at)}>{relTime(r.at)}</span>
              </li>))}</ul>
          )}
        </Card>
      </div>
    </div>
  )
}
