import clsx from 'clsx'
import { CalendarClock, CalendarDays, Check, MoreHorizontal, ShieldCheck, UserCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Avatar, Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, Input, Menu, Modal, OptionCard, PageHeader, SearchBox, Section, Select, Tabs, type Column,
} from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, fLongDate, fTime, hotelDateKey } from '@/lib/time'
import { confirm, toast } from '@/lib/toast'
import type { CoverItem, Person, Shift } from '@/lib/types'
import { relTime, usePersona } from '@/shell/PortalShell'
import { decideCoverAs } from './actions'
import { Callout } from './components'
import { COVER_KIND, DAY, liveShiftAt } from './model'

type Tab = 'pending' | 'approved' | 'declined' | 'all'
const dayOf = (key: string) => `${key}T06:00:00.000Z`
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })

/** Staff available on a shift/date: rostered minus approved time off (pending shown separately). */
export function coverageFor(shift: Shift, date: string, cover: CoverItem[]) {
  const off = cover.filter((c) => c.kind === 'time_off' && c.shiftId === shift.id && c.date === date && c.status === 'approved')
  const pending = cover.filter((c) => c.kind === 'time_off' && c.shiftId === shift.id && c.date === date && c.status === 'pending')
  const available = shift.memberIds.filter((id) => !off.some((o) => o.personId === id)).length
  return { available, off, pending, gap: available < shift.staffTarget, atRisk: available - pending.length < shift.staffTarget }
}

export function ShiftCover() {
  const now = useNow(60_000)
  const { cover, people, shifts } = useDB()
  const { person: me } = usePersona('manager')
  const [tab, setTab] = useState<Tab>('pending')
  const [backup, setBackup] = useState<{ shiftId?: string; date?: string; personId?: string } | null>(null)
  const today = hotelDateKey(now)
  const days = Array.from({ length: 7 }, (_, i) => hotelDateKey(now + i * DAY))
  const counts = { pending: cover.filter((c) => c.status === 'pending').length, approved: cover.filter((c) => c.status === 'approved').length, declined: cover.filter((c) => c.status === 'declined').length, all: cover.length }
  const rows = cover.filter((c) => tab === 'all' || c.status === tab).sort((a, b) => (tab === 'pending' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
  const person = (id: string) => byId(people, id)
  const shiftName = (id: string) => byId(shifts, id)?.name ?? id

  const label = (c: CoverItem) => `${person(c.personId)?.name}’s ${COVER_KIND[c.kind].label.toLowerCase()} (${shiftName(c.shiftId)}, ${fDate(dayOf(c.date))})`
  const decide = async (c: CoverItem, status: 'approved' | 'declined') => {
    const sh = byId(shifts, c.shiftId)
    let body = c.note
    if (c.kind === 'time_off' && status === 'approved' && sh) {
      const cv = coverageFor(sh, c.date, cover)
      const after = cv.available - 1
      body = `${c.note}. The ${sh.name.toLowerCase()} shift on ${fLongDate(dayOf(c.date))} drops to ${after} of ${sh.staffTarget} staff${after < sh.staffTarget ? ' — below target, so arrange a backup.' : '.'}`
    }
    const ok = await confirm(status === 'approved'
      ? { title: `Approve ${COVER_KIND[c.kind].label.toLowerCase()}?`, body: `${person(c.personId)?.name} · ${body}`, confirmLabel: 'Approve' }
      : { title: `Decline ${COVER_KIND[c.kind].label.toLowerCase()}?`, body: `${person(c.personId)?.name} is told it was declined. ${c.note}.`, confirmLabel: 'Decline', tone: 'danger' })
    if (!ok) return false
    if (!decideCoverAs(c, status, me?.id ?? 'elena', label(c))) { toast.info('Already decided', { description: 'Someone handled this request a moment ago.' }); return false }
    if (status === 'approved') {
      const below = c.kind === 'time_off' && sh && coverageFor(sh, c.date, useDB.getState().cover).gap
      toast.success(`${COVER_KIND[c.kind].label} approved`, { description: below ? `${shiftName(c.shiftId)} on ${fDate(dayOf(c.date))} is now below target.` : `${person(c.personId)?.name} · ${fDate(dayOf(c.date))}`,
        action: below ? { label: 'Arrange backup', onClick: () => setBackup({ shiftId: c.shiftId, date: c.date, personId: c.personId }) } : undefined })
    } else toast.info(`${COVER_KIND[c.kind].label} declined`, { description: `${person(c.personId)?.name} · ${fDate(dayOf(c.date))}` })
    return true
  }

  const columns: Column<CoverItem>[] = [
    { key: 'kind', header: 'Type', sort: (c) => COVER_KIND[c.kind].label, csv: (c) => COVER_KIND[c.kind].label, cell: (c) => <Badge tone={COVER_KIND[c.kind].tone}>{COVER_KIND[c.kind].label}</Badge> },
    { key: 'person', header: 'Person', sort: (c) => person(c.personId)?.name, csv: (c) => person(c.personId)?.name, cell: (c) => (
      <span className="flex items-center gap-2.5"><Avatar name={person(c.personId)?.name} size={28} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{person(c.personId)?.name}</span>
        {c.backupId && <span className="block truncate text-xs text-muted">Covered by {person(c.backupId)?.name}</span>}</span></span>) },
    { key: 'shift', header: 'Shift', hideOnMobile: true, sort: (c) => shiftName(c.shiftId), csv: (c) => shiftName(c.shiftId), cell: (c) => <span className="text-sm text-ink-2">{shiftName(c.shiftId)}</span> },
    { key: 'date', header: 'Date', sort: (c) => c.date, csv: (c) => c.date, cell: (c) => <div className="whitespace-nowrap text-sm text-ink">{weekday(c.date)} {fDate(dayOf(c.date))}<div className="text-xs text-muted">{c.date === today ? 'Today' : c.date > today ? `In ${Math.round((Date.parse(dayOf(c.date)) - Date.parse(dayOf(today))) / DAY)} days` : relTime(dayOf(c.date))}</div></div> },
    { key: 'note', header: 'Note', hideOnMobile: true, csv: (c) => c.note, cell: (c) => <span className="line-clamp-2 max-w-[280px] text-sm text-ink-2">{c.note}</span> },
    { key: 'act', header: 'Decision', align: 'right', sort: (c) => c.status, csv: (c) => c.status, cell: (c) => c.status === 'pending' ? (
      <div className="flex items-center justify-end gap-1.5">
        <Button size="xs" variant="ghost" icon={X} onClick={() => decide(c, 'declined')}>Decline</Button>
        <Button size="xs" variant="primary" icon={Check} onClick={() => decide(c, 'approved')}>Approve</Button>
        {c.kind === 'time_off' && <Menu width={230} label="More cover actions" trigger={({ toggle }) => <button type="button" onClick={toggle} aria-label="More" className="grid h-7 w-7 place-items-center rounded-cell text-muted hover:bg-ink/5 hover:text-ink"><MoreHorizontal size={15} /></button>}
          items={[{ label: 'Approve and arrange backup', icon: UserCheck, onClick: async () => { if (await decide(c, 'approved')) setBackup({ shiftId: c.shiftId, date: c.date, personId: c.personId }) } }]} />}
      </div>
    ) : <Badge tone={c.status === 'approved' ? 'success' : 'neutral'} dot>{c.status === 'approved' ? 'Approved' : 'Declined'}</Badge> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Shift cover & time off" description="Time off, late arrivals, early departures and backups — decide them before they become gaps on the floor."
        actions={<Button variant="primary" icon={UserCheck} onClick={() => setBackup({})}>Arrange backup</Button>} />

      <Card>
        <CardHeader icon={CalendarDays} title="Coverage · next 7 days" description="Rostered staff minus approved time off, against each shift’s staff target" />
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-[110px_repeat(7,minmax(0,1fr))]">
            <div className="border-b border-line bg-surface-2 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-muted">Shift</div>
            {days.map((d) => <div key={d} className={clsx('border-b border-l border-line bg-surface-2 px-3 py-2 text-xs font-semibold', d === today ? 'text-forest-800' : 'text-ink-2')}>{weekday(d)} {fDate(dayOf(d))}{d === today && <span className="ml-1 font-normal text-muted">· today</span>}</div>)}
            {shifts.map((s) => (
              <div key={s.id} className="contents">
                <div className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink last:border-0">{s.name}<div className="text-2xs font-normal text-muted">target {s.staffTarget}</div></div>
                {days.map((d) => {
                  const cv = coverageFor(s, d, cover)
                  return (
                    <div key={d} className={clsx('border-b border-l border-line px-3 py-2.5', cv.gap ? 'bg-danger/[0.06]' : cv.atRisk ? 'bg-amber/[0.06]' : '')}
                      aria-label={`${s.name} ${d}: ${cv.available} of ${s.staffTarget}${cv.gap ? ', below target' : ''}${cv.pending.length ? `, ${cv.pending.length} time off pending` : ''}`}>
                      <div className="flex items-baseline gap-1">
                        <span className={clsx('text-base font-semibold tabular', cv.gap ? 'text-danger' : 'text-ink')}>{cv.available}</span><span className="text-xs text-muted">/{s.staffTarget}</span>
                        {cv.gap && <Badge tone="danger" className="ml-auto">Gap</Badge>}
                      </div>
                      {(cv.off.length > 0 || cv.pending.length > 0) && (
                        <div className="mt-1 space-y-0.5 text-2xs">
                          {cv.off.map((o) => <div key={o.id} className="truncate text-ink-2">{person(o.personId)?.name.split(' ')[0]} off</div>)}
                          {cv.pending.map((o) => <div key={o.id} className="truncate text-amber">{person(o.personId)?.name.split(' ')[0]} asked</div>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-line px-5 py-2.5 text-2xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-danger/20" />Below target</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber/20" />Below target if pending time off is approved</span>
        </div>
      </Card>

      <div>
        <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'pending', label: 'Pending', count: counts.pending }, { id: 'approved', label: 'Approved', count: counts.approved }, { id: 'declined', label: 'Declined', count: counts.declined }, { id: 'all', label: 'All', count: counts.all }]} />
        <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} caption="Cover and time-off requests" exportName={`shift-cover-${tab}`}
          search={(c) => `${person(c.personId)?.name} ${COVER_KIND[c.kind].label} ${c.note} ${shiftName(c.shiftId)}`} searchPlaceholder="Search person, type or note"
          empty={<EmptyState compact icon={CalendarClock} title={tab === 'pending' ? 'Nothing waiting for you' : 'Nothing here'} description={tab === 'pending' ? 'New requests from staff appear here as soon as they’re raised.' : 'Decisions show up here.'} />} />
      </div>

      <Section title="Notice policy" icon={ShieldCheck}>
        <ul className="grid gap-3 text-sm text-ink-2 md:grid-cols-2">
          <li><b className="text-ink">Time off</b> — ask at least 7 days ahead. Shorter notice goes to the senior manager.</li>
          <li><b className="text-ink">Late arrival</b> — check-in more than 10 minutes late is reviewed, never penalised automatically.</li>
          <li><b className="text-ink">Early departure</b> — “Go early” in the app always notifies the shift manager; open rooms are reassigned.</li>
          <li><b className="text-ink">Early close</b> — a shift closed with unverified rooms is reviewed by the next shift’s manager.</li>
        </ul>
      </Section>

      <BackupModal open={!!backup} initial={backup ?? {}} onClose={() => setBackup(null)} />
    </div>
  )
}

function BackupModal({ open, initial, onClose }: { open: boolean; initial: { shiftId?: string; date?: string; personId?: string }; onClose: () => void }) {
  const { person: me } = usePersona('manager')
  const now = useNow(60_000)
  const { shifts, people, cover, jobRoles } = useDB()
  const live = liveShiftAt(now, shifts)
  const [shiftId, setShiftId] = useState('')
  const [date, setDate] = useState('')
  const [needId, setNeedId] = useState('')
  const [backupId, setBackupId] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!open) return
    setShiftId(initial.shiftId ?? live?.id ?? shifts[0].id); setDate(initial.date ?? hotelDateKey(now)); setNeedId(initial.personId ?? ''); setBackupId(''); setQ('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const shift = byId(shifts, shiftId) ?? shifts[0]
  const need = byId(people, needId)
  // Eligible = same job role, not already on this shift, not on an overlapping shift, not away that day.
  const eligible = (p: Person) => !!need && p.id !== need.id && p.jobRoleId === need.jobRoleId && p.status !== 'on_leave' && !shift.memberIds.includes(p.id)
    && !shifts.some((s) => s.id !== shift.id && s.memberIds.includes(p.id) && s.start < shift.end && shift.start < s.end)
    && !cover.some((c) => c.kind === 'time_off' && c.status === 'approved' && c.personId === p.id && c.date === date)
  const candidates = people.filter((p) => eligible(p) && p.name.toLowerCase().includes(q.toLowerCase()))
  const approve = () => {
    const p = byId(people, backupId)
    if (!p || !need || !eligible(p)) { toast.error('That backup is no longer eligible', { description: 'Their roster changed. Choose someone else.' }); setBackupId(''); return } // re-checked at approval time
    useDB.getState().approveBackup({ shiftId: shift.id, date, personId: need.id, backupId: p.id, actorId: me?.id ?? 'elena' })
    toast.success(`${p.name} covers ${need.name}`, { description: `${shift.name} shift · ${fLongDate(dayOf(date))}. ${date === hotelDateKey(now) ? `${p.name.split(' ')[0]} is now on today’s roster.` : 'Recorded for that day only.'}` })
    onClose()
  }
  const role = (p?: Person) => jobRoles.find((r) => r.id === p?.jobRoleId)?.name
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Arrange backup cover" description="Pick who needs cover, then a colleague with the same job role who isn’t working that shift."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" icon={UserCheck} disabled={!needId || !backupId} onClick={approve}>Approve backup</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shift" htmlFor="bshift"><Select id="bshift" value={shiftId} onChange={(e) => { setShiftId(e.target.value); setNeedId(''); setBackupId('') }}>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} · {fTime(s.start)} – {fTime(s.end)}</option>)}</Select></Field>
          <Field label="Date" htmlFor="bdate" hint="Hotel date"><Input id="bdate" type="date" value={date} min={hotelDateKey(now)} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <span className="label">Needs cover</span>
            <div className="grid gap-1.5" role="radiogroup" aria-label="Employee needing cover">
              {shift.memberIds.map((id) => byId(people, id)!).filter(Boolean).map((p) => (
                <OptionCard key={p.id} selected={needId === p.id} onClick={() => { setNeedId(p.id); setBackupId('') }} className="py-2">
                  <span className="flex items-center gap-2.5 pr-5"><Avatar name={p.name} size={26} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{p.name}</span><span className="block truncate text-xs text-muted">{role(p)}</span></span></span>
                </OptionCard>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Backup</span>
            {!need ? <p className="rounded-cell border border-dashed border-line-strong px-3 py-6 text-center text-sm text-muted">Choose who needs cover first. Only colleagues with the same role who are free are shown.</p> : (
              <>
                <SearchBox value={q} onChange={setQ} placeholder={`Search ${role(need)?.toLowerCase()}s`} className="mb-2" />
                {!candidates.length ? <Callout tone="warning" title="No eligible backup">Nobody else with the {role(need)?.toLowerCase()} role is free for this shift.</Callout> : (
                  <div className="grid gap-1.5" role="radiogroup" aria-label="Backup employee">
                    {candidates.map((p) => (
                      <OptionCard key={p.id} selected={backupId === p.id} onClick={() => setBackupId(p.id)} className="py-2">
                        <span className="flex items-center gap-2.5 pr-5"><Avatar name={p.name} size={26} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{p.name}</span><span className="block truncate text-xs text-muted">{shifts.find((s) => s.memberIds.includes(p.id))?.name ?? 'Not rostered'} · {role(p)}</span></span></span>
                      </OptionCard>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-muted">Eligibility is checked again at the moment you approve.</p>
      </div>
    </Modal>
  )
}
