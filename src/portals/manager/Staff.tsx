import { Lock, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, DataTable, PageHeader, StatCard, type Column, type Tone, ButtonLink } from '@/components/ui'
import { stats } from '@/lib/analytics'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { canAccess } from '@/lib/permissions'
import { hotelDateKey } from '@/lib/time'
import type { JobRole, Person, Shift } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { Callout, FilterSelect, Meter } from './components'
import { DAY, ackCompliance, offOn } from './model'

export type StaffStatus = 'active' | 'time_off' | 'on_leave' | 'inactive'
export const STAFF_STATUS: Record<StaffStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' }, time_off: { label: 'Time off today', tone: 'warning' }, on_leave: { label: 'On leave', tone: 'warning' }, inactive: { label: 'Inactive', tone: 'neutral' },
}

interface Row { p: Person; role?: JobRole; shift?: Shift; shiftLabel: string; status: StaffStatus; today: number; doneToday: number; onTime: number | null; completed: number; ack: { pct: number | null; acked: number; total: number } }

export function useStaffRows(): Row[] {
  const now = useNow(60_000)
  const db = useDB()
  const { people, jobRoles, shifts, tasks, sopVersions } = db
  return useMemo(() => {
    const today = hotelDateKey(now)
    return people.map((p) => {
      const mine = tasks.filter((t) => t.personId === p.id)
      const td = mine.filter((t) => hotelDateKey(t.start) === today && t.status !== 'cancelled')
      const st = stats(mine.filter((t) => Date.parse(t.start) > now - 14 * DAY), sopVersions, now)
      const status: StaffStatus = p.status === 'on_leave' ? 'on_leave' : p.status === 'inactive' ? 'inactive' : offOn(db, p.id, today) ? 'time_off' : 'active'
      return { p, role: byId(jobRoles, p.jobRoleId), shift: shifts.find((s) => s.memberIds.includes(p.id)), shiftLabel: shifts.filter((s) => s.memberIds.includes(p.id)).map((s) => s.name).join(' & '), status, today: td.length, doneToday: td.filter((t) => t.status === 'done').length, onTime: st.completed ? st.onTimePct : null, completed: st.completed, ack: ackCompliance(db, p) }
    })
  }, [db, people, jobRoles, shifts, tasks, sopVersions, now])
}

export function StaffDirectory() {
  const nav = useNavigate()
  const { jobRoles, shifts } = useDB()
  const { grant } = usePersona('manager')
  const rows = useStaffRows()
  const [team, setTeam] = useState('')
  const [role, setRole] = useState('')
  const [shift, setShift] = useState('')
  const [status, setStatus] = useState('')
  const senior = canAccess(grant?.tier, 'senior')
  const teams = [...new Set(jobRoles.map((r) => r.team))]
  const shown = rows.filter((r) => (!team || r.role?.team === team) && (!role || r.p.jobRoleId === role) && (!shift || (shift === 'none' ? !r.shift : byId(shifts, shift)?.memberIds.includes(r.p.id))) && (!status || r.status === status))
  const acks = rows.filter((r) => r.ack.pct != null)
  const ackAvg = acks.length ? Math.round(acks.reduce((a, r) => a + (r.ack.pct ?? 0), 0) / acks.length) : 0

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', sort: (r) => r.p.name, csv: (r) => r.p.name, cell: (r) => (
      <span className="flex min-w-0 items-center gap-2.5"><Avatar name={r.p.name} size={30} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{r.p.name}</span><span className="block truncate text-xs text-muted">{r.p.email}</span></span></span>) },
    { key: 'emp', header: 'Employee no', hideOnMobile: true, sort: (r) => r.p.employeeNo, csv: (r) => r.p.employeeNo, cell: (r) => <span className="text-sm tabular text-ink-2">{r.p.employeeNo}</span> },
    { key: 'role', header: 'Role', sort: (r) => r.role?.name, csv: (r) => r.role?.name, cell: (r) => <div className="min-w-0"><div className="truncate text-sm text-ink">{r.role?.name}</div><div className="text-xs text-muted">{r.role?.team}</div></div> },
    { key: 'shift', header: 'Shift today', hideOnMobile: true, sort: (r) => r.shiftLabel || 'zz', csv: (r) => r.shiftLabel, cell: (r) => r.shift ? <span className="text-sm text-ink-2">{r.shiftLabel}</span> : <span className="text-xs text-muted">Not rostered</span> },
    { key: 'status', header: 'Status', sort: (r) => r.status, csv: (r) => STAFF_STATUS[r.status].label, cell: (r) => <Badge tone={STAFF_STATUS[r.status].tone} dot>{STAFF_STATUS[r.status].label}</Badge> },
    { key: 'today', header: 'Rooms today', align: 'right', hideOnMobile: true, sort: (r) => r.today, csv: (r) => `${r.doneToday}/${r.today}`, cell: (r) => r.today ? <span className="tabular"><b>{r.doneToday}</b><span className="text-muted">/{r.today}</span></span> : <span className="text-muted">—</span> },
    { key: 'ontime', header: 'On-time 14d', align: 'right', hideOnMobile: true, sort: (r) => r.onTime ?? -1, csv: (r) => r.onTime ?? '', cell: (r) => r.onTime == null ? <span className="text-xs text-muted">No history</span> : <span className={r.onTime < 50 ? 'font-semibold text-danger' : 'text-ink'}>{r.onTime}%</span> },
    { key: 'ack', header: 'SOP acks', hideOnMobile: true, sort: (r) => r.ack.pct ?? -1, csv: (r) => r.ack.pct ?? '', cell: (r) => r.ack.pct == null ? <span className="text-xs text-muted">No SOP for role</span> : (
      <div className="flex min-w-[110px] items-center gap-2"><Meter value={r.ack.acked} max={r.ack.total} tone={r.ack.pct === 100 ? 'success' : r.ack.pct >= 50 ? 'warning' : 'danger'} label={`${r.p.name} acknowledged ${r.ack.acked} of ${r.ack.total}`} /><span className="w-9 text-right text-xs tabular text-ink-2">{r.ack.pct}%</span></div>) },
  ]

  return (
    <div>
      <PageHeader title="Staff directory" description="Everyone at the property, what they’re rostered on today and how they’re doing against the standards."
        actions={<ButtonLink to="/manager/join-requests" variant="secondary" icon={UserPlus}>Join requests</ButtonLink>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Staff" value={rows.length} hint={`${rows.filter((r) => r.status === 'active').length} active today`} />
        <StatCard label="Rostered today" value={rows.filter((r) => r.shift).length} hint={`across ${shifts.length} shifts`} />
        <StatCard label="Away" value={rows.filter((r) => r.status !== 'active').length} hint="on leave or time off" />
        <StatCard label="SOP acknowledgment" value={ackAvg} unit="%" hint="average across staff with an SOP" />
      </div>
      {!senior && <Callout tone="neutral" icon={Lock} className="mb-4" title="Full profiles need Senior manager access">You can browse the directory; opening a person’s performance profile asks for a higher tier.</Callout>}
      <DataTable rows={shown} columns={columns} rowKey={(r) => r.p.id} caption="Staff" pageSize={20} onRowClick={(r) => nav(`/manager/staff/${r.p.id}`)} initialSort={{ key: 'name', dir: 'asc' }}
        search={(r) => `${r.p.name} ${r.p.employeeNo} ${r.p.email} ${r.role?.name} ${r.p.languages?.join(' ')}`} searchPlaceholder="Name, employee no. or email" exportName="staff-directory"
        filters={<>
          <FilterSelect label="Team" value={team} onChange={setTeam}><option value="">All teams</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</FilterSelect>
          <FilterSelect label="Role" value={role} onChange={setRole}><option value="">All roles</option>{jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</FilterSelect>
          <FilterSelect label="Shift" value={shift} onChange={setShift}><option value="">Any shift</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="none">Not rostered</option></FilterSelect>
          <FilterSelect label="Status" value={status} onChange={setStatus}><option value="">Any status</option>{(Object.keys(STAFF_STATUS) as StaffStatus[]).map((s) => <option key={s} value={s}>{STAFF_STATUS[s].label}</option>)}</FilterSelect>
        </>} />
    </div>
  )
}
