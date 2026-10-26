import { Link } from 'react-router-dom'
import { Stat } from '@/components/Charts'
import { Avatar, Button, Empty, PageHeader, Pill, Section, Tabs } from '@/components/ui'
import { stats } from '@/lib/analytics'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, fTime, hotelDateKey } from '@/lib/time'
import { usePersona } from '@/shell/PortalShell'
import { useLiveShift } from './AssignRooms'

export function ManagerOverview() {
  const { person } = usePersona('manager')
  const now = useNow()
  const { shifts, tasks, sopVersions, cover, notices, people, rooms, audit } = useDB()
  const live = useLiveShift(now, shifts)
  const today = tasks.filter((t) => hotelDateKey(t.start) === hotelDateKey(now) && t.shiftId === live?.id)
  const s = stats(today, sopVersions, now)
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={live ? `${live.name} shift · live` : 'Between shifts'} title={`Good shift, ${person?.name.split(' ')[0]}.`} tagline="Here is what needs you." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Rooms today" value={today.length} hint={`${today.filter((t) => t.status === 'done').length} done`} />
        <Stat label="Awaiting verification" value={today.filter((t) => t.status === 'awaiting_verification').length} />
        <Stat label="Cover items waiting" value={cover.filter((c) => c.status === 'pending').length} />
        <Stat label="On-time today" value={`${s.onTimePct}%`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Rooms in motion" right={<Link to="/manager/assign-rooms" className="text-sm text-gold-400">Assign rooms →</Link>}>
          <ul className="space-y-2">{today.filter((t) => t.status !== 'done').map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-xl bg-forest-950/40 px-3 py-2 text-sm">
              <span><b className="text-white">{byId(rooms, t.roomId)?.number}</b> · {byId(people, t.personId)?.name}</span>
              <span className="flex items-center gap-2 text-xs text-sage-300">{fTime(t.start)}<Pill tone={t.status === 'in_progress' ? 'gold' : t.status === 'awaiting_verification' ? 'warn' : 'neutral'}>{t.status.replace('_', ' ')}</Pill></span>
            </li>))}{!today.some((t) => t.status !== 'done') && <Empty title="All rooms complete" />}</ul>
        </Section>
        <Section title="Recent activity">
          <ul className="space-y-2 text-sm">{audit.slice(0, 8).map((a) => <li key={a.id} className="flex justify-between gap-3"><span><b className="text-white">{byId(people, a.actorId)?.name ?? a.actorId}</b> · {a.action}</span><span className="shrink-0 text-xs text-sage-300">{fDateTime(a.at)}</span></li>)}</ul>
          <p className="mt-4 text-xs text-sage-300">{notices.filter((n) => n.sentAt).length} notices sent · <Link to="/manager/notices" className="text-gold-400">Hotel notices</Link></p>
        </Section>
      </div>
    </div>
  )
}

export function GuidedOrStandard() {
  const now = useNow()
  const { tasks, rooms, people, setTaskMode } = useDB()
  const open = tasks.filter((t) => t.status !== 'done' && hotelDateKey(t.start) === hotelDateKey(now))
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager" title="Guided or Standard" tagline="Full step-by-step for new staff. Milestones only for experienced hands." />
      <Section>
        <p className="mb-4 text-sm text-sage-300"><b className="text-white">Guided</b> runs the live SOP exactly, every step ticked. <b className="text-white">Standard</b> trusts the employee to work from memory and only checks off milestones (verification steps and the finish).</p>
        <ul className="divide-y divide-white/5">{open.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-sm"><b className="text-white">Room {byId(rooms, t.roomId)?.number}</b> · {byId(people, t.personId)?.name} · {fTime(t.start)}</div>
            <Tabs value={t.mode} onChange={(m) => setTaskMode(t.id, m)} items={[{ id: 'guided', label: 'Guided' }, { id: 'standard', label: 'Standard' }]} />
          </li>))}{!open.length && <Empty title="No open jobs today" />}</ul>
      </Section>
    </div>
  )
}

export function JoinRequests() {
  const { joinRequests, jobRoles, shifts, decideJoin } = useDB()
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager" title="Join requests" tagline="New staff asking to join a shift team." />
      <Section>
        {!joinRequests.length ? <Empty title="No requests" /> : <ul className="divide-y divide-white/5">{joinRequests.map((j) => (
          <li key={j.id} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar initials={j.name.split(' ').map((x) => x[0]).join('')} size={32} />
            <div className="flex-1 text-sm"><div className="font-semibold text-white">{j.name}</div><div className="text-xs text-sage-300">{byId(jobRoles, j.jobRoleId)?.name} · wants {byId(shifts, j.shiftId)?.name} shift · {fDateTime(j.at)}</div></div>
            {j.status === 'pending' ? <div className="flex gap-2"><Button size="sm" variant="gold" onClick={() => decideJoin(j.id, 'approved')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decideJoin(j.id, 'declined')}>Decline</Button></div>
              : <Pill tone={j.status === 'approved' ? 'ok' : 'danger'}>{j.status}</Pill>}
          </li>))}</ul>}
      </Section>
    </div>
  )
}
