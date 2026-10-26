import clsx from 'clsx'
import { BedDouble, BookOpenCheck, CalendarCheck2, Check, ChevronRight, Clock, Languages, Mail, Megaphone, Phone, Plus, Timer, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Badge, Card, CardHeader, EmptyState, StatCard, Tabs } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, fLongDate, fTime, hotelDateKey, minutesBetween } from '@/lib/time'
import type { AttendanceMark, Person } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { NoticeCard } from './components'
import { fDateYear, tenure } from './model'

type Tab = 'overview' | 'notices' | 'acks' | 'checkins'
const TABS: Tab[] = ['overview', 'notices', 'acks', 'checkins']
const DAY = 86_400_000

const MARK: Record<AttendanceMark, { label: string; tone: 'success' | 'gold' | 'warning'; icon: typeof Check; cell: string }> = {
  checkin: { label: 'Checked in', tone: 'success', icon: Check, cell: 'border-ok/25 bg-ok/10 text-ok' },
  extra: { label: 'Extra shift', tone: 'gold', icon: Plus, cell: 'border-gold-500/40 bg-gold-50 text-gold-700' },
  pending: { label: 'Review pending', tone: 'warning', icon: Clock, cell: 'border-amber/30 bg-amber/10 text-amber' },
}

export function EmployeeMe() {
  const { person } = usePersona('employee')
  const [params, setParams] = useSearchParams()
  const notices = useDB((s) => s.notices)
  const acks = useDB((s) => s.ackEvents)
  const raw = params.get('tab') as Tab | null
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'overview'
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'overview') n.delete('tab'); else n.set('tab', t); return n }, { replace: true })

  const myNotices = useMemo(() => notices.filter((n) => n.sentAt && person && n.recipientIds.includes(person.id)).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? '')), [notices, person])
  const unread = myNotices.filter((n) => !acks.some((a) => a.personId === person?.id && a.kind === 'notice' && a.refId === n.id && a.acknowledgedAt)).length

  if (!person) return null
  return (
    <div className="space-y-5">
      <Profile person={person} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'overview', label: 'Overview' },
        { id: 'notices', label: 'Notices', count: unread || undefined },
        { id: 'acks', label: 'Acknowledgments' },
        { id: 'checkins', label: 'Check-in log' },
      ]} />
      {tab === 'overview' && <Overview person={person} />}
      {tab === 'notices' && (
        <Card className="overflow-hidden">
          {myNotices.length ? (
            <>
              <div className="border-b border-line px-4 py-3 text-xs text-muted sm:px-5">Every notice sent to you, newest first. Opening or replying is never task acceptance.</div>
              <div className="divide-y divide-line">{myNotices.map((n) => <NoticeCard key={n.id} notice={n} personId={person.id} compact />)}</div>
            </>
          ) : <EmptyState icon={Megaphone} title="No notices yet" description="Messages from your managers land here and on My work." />}
        </Card>
      )}
      {tab === 'acks' && <Acknowledgments person={person} />}
      {tab === 'checkins' && <CheckinLog person={person} />}
    </div>
  )
}

function Profile({ person }: { person: Person }) {
  const role = useDB((s) => byId(s.jobRoles, person.jobRoleId))
  const shifts = useDB((s) => s.shifts)
  const now = Date.now()
  const shift = shifts.find((x) => x.memberIds.includes(person.id) && Date.parse(x.start) <= now && now < Date.parse(x.end)) ?? shifts.find((x) => x.memberIds.includes(person.id))
  const status = person.status ?? 'active'
  return (
    <section className="card overflow-hidden" aria-label="Profile">
      <div className="flex items-center gap-4 p-5">
        <Avatar name={person.name} size={64} className="text-xl ring-4 ring-forest-50" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold leading-tight text-ink">{person.name}</h1>
          <p className="mt-0.5 truncate text-sm text-ink-2">{person.title}{role && role.name !== person.title ? ` · ${role.name}` : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={status === 'active' ? 'success' : status === 'on_leave' ? 'warning' : 'neutral'} dot>{status === 'active' ? 'Active' : status === 'on_leave' ? 'On leave' : 'Inactive'}</Badge>
            {role && <Badge tone="brand">{role.team}</Badge>}
            {shift && <Badge>{shift.name} shift</Badge>}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-1 border-t border-line sm:grid-cols-2">
        {([
          ['Employee no.', <span className="tabular">{person.employeeNo ?? '—'}</span>, null],
          ['Hired', person.hiredAt ? <>{fDateYear(person.hiredAt)} <span className="text-muted">· {tenure(person.hiredAt)}</span></> : '—', null],
          ['Email', person.email ? <a href={`mailto:${person.email}`} className="link break-all">{person.email}</a> : '—', Mail],
          ['Phone', person.phone ? <a href={`tel:${person.phone.replace(/\s/g, '')}`} className="link tabular">{person.phone}</a> : '—', Phone],
          ['Languages', person.languages?.join(', ') ?? '—', Languages],
          ['Team', role?.team ?? '—', null],
        ] as const).map(([k, v, I], i) => (
          <div key={k} className={clsx('flex items-center justify-between gap-4 border-line px-5 py-3', i > 0 && 'border-t', i === 1 && 'sm:border-t-0', i % 2 === 1 && 'sm:border-l')}>
            <dt className="flex items-center gap-1.5 text-xs text-muted">{I && <I size={13} aria-hidden />}{k}</dt>
            <dd className="min-w-0 text-right text-sm font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Overview({ person }: { person: Person }) {
  const tasks = useDB((s) => s.tasks)
  const versions = useDB((s) => s.sopVersions)
  const attendance = useDB((s) => s.attendance)
  const rooms = useDB((s) => s.rooms)
  const now = useNow(60_000)

  const m = useMemo(() => {
    const done = tasks.filter((t) => t.personId === person.id && t.status === 'done' && t.startedAt && t.completedAt)
    const target = (vid: string) => byId(versions, vid)?.timeTargetMin ?? 27
    const window = (from: number, to: number) => done.filter((t) => { const c = Date.parse(t.completedAt!); return c > from && c <= to })
    const summarize = (xs: typeof done) => {
      const mins = xs.map((t) => minutesBetween(t.startedAt!, t.completedAt!))
      const targets = xs.map((t) => target(t.sopVersionId))
      const onTime = xs.filter((_, i) => mins[i] <= targets[i]).length
      return {
        count: xs.length,
        onTimePct: xs.length ? Math.round((onTime / xs.length) * 100) : null,
        avg: xs.length ? Math.round((mins.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null,
        avgTarget: xs.length ? Math.round((targets.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null,
      }
    }
    const week = summarize(window(now - 7 * DAY, now))
    const prev = summarize(window(now - 14 * DAY, now - 7 * DAY))
    const daily = Array.from({ length: 7 }, (_, i) => { const k = hotelDateKey(now - (6 - i) * DAY); return done.filter((t) => hotelDateKey(t.completedAt!) === k).length })
    const recent = [...done].sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)).slice(0, 5)
    return { week, prev, daily, recent, target }
  }, [tasks, versions, person.id, now])

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const ms = now - (13 - i) * DAY
    const key = hotelDateKey(ms)
    return { key, ms, mark: attendance.find((a) => a.personId === person.id && a.date === key) }
  }), [attendance, person.id, now])
  const marked = days.filter((d) => d.mark).length

  const { week, prev } = m
  const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <StatCard label="Rooms done · last 7 days" value={week.count} icon={BedDouble} delta={week.count - prev.count} trend={m.daily.some(Boolean) ? m.daily : undefined} />
        </div>
        <StatCard label="On time" value={week.onTimePct ?? '—'} unit={week.onTimePct != null ? '%' : undefined} icon={TrendingUp} delta={diff(week.onTimePct, prev.onTimePct)} />
        <StatCard label="Avg minutes" value={week.avg ?? '—'} unit={week.avg != null ? 'min' : undefined} icon={Timer} goodWhen="down"
          delta={diff(week.avg, prev.avg)} deltaLabel="vs last wk" hint={week.avgTarget != null ? `· target ${week.avgTarget}` : undefined} />
      </div>

      <Card>
        <CardHeader icon={CalendarCheck2} title="Attendance · last 14 days" description={marked ? `${marked} day${marked === 1 ? '' : 's'} on record` : 'No check-ins recorded in the last two weeks'}
          actions={<Link to="?tab=checkins" className="link text-sm">Full log</Link>} />
        <div className="p-4 sm:p-5">
          <ol className="grid grid-cols-7 gap-1.5 lg:grid-cols-[repeat(14,minmax(0,1fr))]" aria-label="Attendance, last 14 days">
            {days.map((d) => {
              const mk = d.mark ? MARK[d.mark.mark] : null
              const today = d.key === hotelDateKey(now)
              const I = mk?.icon
              return (
                <li key={d.key} title={`${fLongDate(d.ms)} · ${mk ? `${mk.label} at ${fTime(d.mark!.at)}` : 'No record'}`}
                  aria-label={`${fLongDate(d.ms)}: ${mk ? `${mk.label} at ${fTime(d.mark!.at)}` : 'no record'}`}
                  className={clsx('flex flex-col items-center gap-0.5 rounded-cell border py-1.5 text-center', mk ? mk.cell : 'border-line bg-surface-2 text-muted', today && 'ring-2 ring-forest-700 ring-offset-1')}>
                  <span className="text-[10px] font-medium uppercase opacity-80">{new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'Asia/Colombo' }).format(d.ms)}</span>
                  <span className="text-sm font-semibold tabular">{new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Asia/Colombo' }).format(d.ms)}</span>
                  <span className="grid h-3.5 place-items-center">{I ? <I size={12} strokeWidth={2.5} aria-hidden /> : <span className="h-0.5 w-2 rounded bg-current opacity-40" />}</span>
                </li>
              )
            })}
          </ol>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
            {Object.values(MARK).map((mk) => <span key={mk.label} className="flex items-center gap-1.5"><span className={clsx('grid h-4 w-4 place-items-center rounded border', mk.cell)}><mk.icon size={10} strokeWidth={3} aria-hidden /></span>{mk.label}</span>)}
            <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded border border-line bg-surface-2" />No record</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={BedDouble} title="Recently finished" description="Your last five completed rooms." />
        {m.recent.length ? (
          <ul className="divide-y divide-line">
            {m.recent.map((t) => {
              const mins = minutesBetween(t.startedAt!, t.completedAt!)
              const tgt = m.target(t.sopVersionId)
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                  <span className="w-14 shrink-0 font-semibold text-ink tabular">{byId(rooms, t.roomId)?.number}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{byId(versions, t.sopVersionId)?.title}<span className="ml-1.5 text-xs text-muted max-sm:hidden">· {fDateTime(t.completedAt!)}</span></span>
                  <span className="tabular text-ink">{mins} min</span>
                  <Badge tone={mins <= tgt ? 'success' : 'warning'}>{mins <= tgt ? 'On time' : `+${mins - tgt}`}</Badge>
                </li>
              )
            })}
          </ul>
        ) : <EmptyState compact icon={BedDouble} title="No finished rooms yet" description="Rooms you complete show up here with their times." />}
      </Card>
    </div>
  )
}

function Acknowledgments({ person }: { person: Person }) {
  const acks = useDB((s) => s.ackEvents)
  const versions = useDB((s) => s.sopVersions)
  const sops = useDB((s) => s.sops)
  const rows = acks.filter((a) => a.personId === person.id && a.kind === 'sop')
    .map((a) => ({ a, v: byId(versions, a.refId) }))
    .filter((r): r is { a: typeof r.a; v: NonNullable<typeof r.v> } => !!r.v)
    .sort((x, y) => (y.a.acknowledgedAt ?? y.a.openedAt ?? '').localeCompare(x.a.acknowledgedAt ?? x.a.openedAt ?? ''))
  if (!rows.length) {
    return <Card><EmptyState icon={BookOpenCheck} title="Nothing read yet" description="When you confirm a guide with “I’ve read this version”, it is recorded here with the date."
      action={<Link to="/employee/guides" className="link">Open guides</Link>} /></Card>
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3 text-xs text-muted sm:px-5">Each confirmation is recorded against the exact version you read.</div>
      <ul className="divide-y divide-line">
        {rows.map(({ a, v }) => {
          const sop = sops.find((s) => s.id === v.sopId)
          const current = sop && !sop.retiredAt ? byId(versions, sop.currentVersionId) : undefined
          const outdated = current && current.id !== v.id && current.status === 'published'
          const canOpen = !!current && current.status === 'published'
          const inner = (
            <>
              <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-cell', a.acknowledgedAt ? 'bg-ok/10 text-ok' : 'bg-surface-2 text-muted ring-1 ring-inset ring-line')}><BookOpenCheck size={17} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{v.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{v.code} · v{v.version} · {a.acknowledgedAt ? `Read ${fDateTime(a.acknowledgedAt)}` : a.openedAt ? `Opened ${fDateTime(a.openedAt)}, not confirmed` : 'Not opened'}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {a.acknowledgedAt ? <Badge tone="success" dot>Confirmed</Badge> : <Badge tone="info" dot>Opened</Badge>}
                {outdated && <Badge tone="warning">v{current!.version} out</Badge>}
                {sop?.retiredAt && <Badge>Retired</Badge>}
              </span>
              {canOpen && <ChevronRight size={16} className="shrink-0 text-line-strong" aria-hidden />}
            </>
          )
          return (
            <li key={a.id}>
              {canOpen ? <Link to={`/employee/guides/${v.sopId}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">{inner}</Link>
                : <div className="flex min-h-[64px] items-center gap-3 px-4 py-3 sm:px-5">{inner}</div>}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function CheckinLog({ person }: { person: Person }) {
  const attendance = useDB((s) => s.attendance)
  const conn = useDB((s) => s.connection)
  const queued = useDB((s) => s.outbox.filter((o) => o.kind === 'checkin'))
  const rows = attendance.filter((a) => a.personId === person.id).sort((a, b) => b.date.localeCompare(a.date))
  const counts = { checkin: rows.filter((r) => r.mark === 'checkin').length, extra: rows.filter((r) => r.mark === 'extra').length, pending: rows.filter((r) => r.mark === 'pending').length }
  return (
    <div className="space-y-4">
      {(conn.checkin === 'attention' || queued.length > 0) && (
        <div className="flex items-start gap-3 rounded-card border border-amber/30 bg-amber/[0.07] p-4 text-sm" role="status">
          <Clock size={18} className="mt-0.5 shrink-0 text-amber" aria-hidden />
          <div><div className="font-semibold text-ink">A check-in is waiting to be confirmed</div>
            <div className="mt-0.5 text-ink-2">{queued.length ? `Saved on this phone at ${fTime(queued[queued.length - 1].at)}.` : 'The server could not confirm it yet.'} It syncs when the hotel system is back — use “Refresh check-in” on My work.</div></div>
        </div>
      )}
      <Card className="overflow-hidden">
        {rows.length ? (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line bg-surface-2 px-4 py-2.5 text-xs text-ink-2 sm:px-5">
              <span><b className="font-semibold text-ink tabular">{counts.checkin}</b> check-ins</span>
              <span><b className="font-semibold text-ink tabular">{counts.extra}</b> extra shifts</span>
              <span><b className="font-semibold text-ink tabular">{counts.pending}</b> under review</span>
            </div>
            <table className="w-full">
              <caption className="sr-only">Check-in log</caption>
              <thead className="border-b border-line"><tr><th className="th">Date</th><th className="th">Status</th><th className="th text-right">Time</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const mk = MARK[r.mark]
                  return (
                    <tr key={r.id}>
                      <td className="td"><span className="font-medium">{new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${r.date}T12:00:00Z`))}</span></td>
                      <td className="td"><Badge tone={mk.tone} dot>{mk.label}</Badge></td>
                      <td className="td text-right tabular text-ink-2">{fTime(r.at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        ) : <EmptyState icon={CalendarCheck2} title="No check-ins yet" description="Your check-ins appear here each day you check in on My work." />}
      </Card>
    </div>
  )
}
