import { useState } from 'react'
import { Gauge } from '@/components/Charts'
import { Avatar, Button, Count, Empty, PageHeader, Pill, SearchBox, Section, Tabs } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, hotelDateKey } from '@/lib/time'
import type { CoverKind } from '@/lib/types'
import { useLiveShift } from './AssignRooms'

type Tab = 'backup' | CoverKind | 'policy'
const LABEL: Record<Exclude<Tab, 'backup' | 'policy'>, string> = {
  time_off: 'Time off', arrival: 'Arrival review', early_departure: 'Early departures', early_close: 'Early-close reviews', ended: 'Ended shifts',
}

export function ShiftCover() {
  const { cover, people, shifts, attendance, decideCover } = useDB()
  const [tab, setTab] = useState<Tab>('backup')
  const pending = (k: CoverKind) => cover.filter((c) => c.kind === k && c.status === 'pending').length
  const items: { id: Tab; label: React.ReactNode }[] = [
    { id: 'backup', label: 'Backup cover' },
    ...(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => ({ id: k as Tab, label: <>{LABEL[k]}{k !== 'ended' && pending(k) > 0 && <Count n={pending(k)} />}</> })),
    { id: 'policy', label: 'Notice policy' },
  ]
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager" title="Shift cover & time off" tagline="Every gap covered before it becomes a problem." />
      <Tabs value={tab} onChange={setTab} items={items} />
      {tab === 'backup' ? <Backup /> : tab === 'policy' ? <Policy /> : (
        <Section title={LABEL[tab]}>
          {cover.filter((c) => c.kind === tab).length === 0 ? <Empty title="Nothing here" body="New items appear as soon as staff raise them." /> : (
            <ul className="divide-y divide-white/5">
              {cover.filter((c) => c.kind === tab).map((c) => {
                const p = byId(people, c.personId)
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-4 py-3">
                    <Avatar initials={p?.initials ?? '?'} size={32} />
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{p?.name}</div><div className="text-xs text-sage-300">{byId(shifts, c.shiftId)?.name} · {fDate(c.date + 'T06:00:00Z')} · {c.note}</div>
                      {tab === 'arrival' && <div className="text-xs text-sage-300">Check-ins on record: {attendance.filter((a) => a.personId === c.personId).length}</div>}</div>
                    {c.status === 'pending' ? (
                      <div className="flex gap-2"><Button size="sm" variant="gold" onClick={() => decideCover(c.id, 'approved')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decideCover(c.id, 'declined')}>Decline</Button></div>
                    ) : <Pill tone={c.status === 'approved' ? 'ok' : 'danger'}>{c.status}</Pill>}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}

function Backup() {
  const now = useNow()
  const { shifts, people, attendance, approveBackup, tasks } = useDB()
  const live = useLiveShift(now, shifts)
  const [shiftId, setShiftId] = useState(live?.id ?? shifts[0].id)
  const [date, setDate] = useState(hotelDateKey(now))
  const [needQ, setNeedQ] = useState(''); const [backQ, setBackQ] = useState('')
  const [needId, setNeedId] = useState(''); const [backupId, setBackupId] = useState('')
  const [msg, setMsg] = useState('')
  const shift = byId(shifts, shiftId)!
  const confirmed = shift.memberIds.filter((id) => attendance.some((a) => a.personId === id && a.date === date)).length
  const need = byId(people, needId)
  // Eligible = same job role, not already on this shift, not working an overlapping shift.
  const eligible = (pid: string) => {
    const p = byId(people, pid)
    return !!p && !!need && p.jobRoleId === need.jobRoleId && !shift.memberIds.includes(pid) && !shifts.some((s) => s.id !== shiftId && s.memberIds.includes(pid) && s.start < shift.end && shift.start < s.end)
  }
  const match = (q: string) => (p: { name: string }) => p.name.toLowerCase().includes(q.toLowerCase())
  const approve = () => {
    if (!eligible(backupId)) { setMsg('That person is no longer eligible. Choose someone else.'); return } // re-checked at approval time
    approveBackup({ shiftId, date, personId: needId, backupId }); setMsg(`${byId(people, backupId)?.name} now covers ${need?.name}.`); setNeedId(''); setBackupId('')
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Section>
        <div className="flex items-center gap-4">
          <Gauge value={confirmed} max={shift.staffTarget} label="Confirmed attendance" />
          <div><div className="font-semibold text-white">{shift.name} shift</div><div className="text-xs text-sage-300">{fDate(date + 'T06:00:00Z')}</div>
            <div className="mt-2 text-xs text-sage-300">{confirmed < shift.staffTarget ? 'Unavailable' : 'Confirmed'} attendance · {shift.staffTarget} staff target</div></div>
        </div>
        <p className="mt-3 text-xs text-sage-300">{tasks.filter((t) => t.shiftId === shiftId && t.status !== 'done').length} open rooms on this shift.</p>
      </Section>
      <Section title="Approve one shift's backup">
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="label">Shift</span><select className="input" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label><span className="label">Date</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div><span className="label">Employee needing cover</span><SearchBox value={needQ} onChange={setNeedQ} placeholder="Search rostered staff" />
            <PersonList ids={shift.memberIds.filter((id) => match(needQ)(byId(people, id)!))} selected={needId} onPick={(id) => { setNeedId(id); setBackupId('') }} /></div>
          <div><span className="label">Backup employee</span><SearchBox value={backQ} onChange={setBackQ} placeholder="Search eligible staff" />
            {need ? <PersonList ids={people.filter((p) => eligible(p.id) && match(backQ)(p)).map((p) => p.id)} selected={backupId} onPick={setBackupId} />
              : <p className="mt-3 text-xs text-sage-300">Choose who needs cover first. Only qualified, free staff are shown.</p>}</div>
        </div>
        <p className="mt-4 text-xs text-sage-300">Eligibility is checked again at the moment you approve.</p>
        <div className="mt-3 flex items-center gap-3"><Button variant="gold" disabled={!needId || !backupId} onClick={approve}>Approve backup</Button>{msg && <span className="text-sm text-ok">{msg}</span>}</div>
      </Section>
    </div>
  )
}

function PersonList({ ids, selected, onPick }: { ids: string[]; selected: string; onPick: (id: string) => void }) {
  const people = useDB((s) => s.people)
  if (!ids.length) return <p className="mt-3 text-xs text-sage-300">No one matches.</p>
  return (
    <ul className="mt-3 space-y-1.5">
      {ids.map((id) => { const p = byId(people, id)!; return (
        <li key={id}><button onClick={() => onPick(id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected === id ? 'border-gold-500 bg-gold-500/10' : 'border-white/10 hover:border-white/20'}`}>
          <Avatar initials={p.initials} size={28} /><div><div className="text-sm text-white">{p.name}</div><div className="text-xs text-sage-300">{p.title}</div></div>
        </button></li>) })}
    </ul>
  )
}

function Policy() {
  return (
    <Section title="Notice policy">
      <ul className="space-y-3 text-sm text-sage-200">
        <li><b className="text-white">Time off</b> — request at least 7 days ahead. Shorter notice goes to the senior manager.</li>
        <li><b className="text-white">Arrival</b> — check-in more than 10 minutes late is reviewed, never auto-penalised.</li>
        <li><b className="text-white">Early departure</b> — "Go early" in the app always notifies the shift manager; open rooms are reassigned.</li>
        <li><b className="text-white">Early close</b> — a shift closed with unverified rooms is reviewed by the next shift's manager.</li>
      </ul>
    </Section>
  )
}
