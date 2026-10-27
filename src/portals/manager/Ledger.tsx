import clsx from 'clsx'
import { BellRing, Check, Download, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Badge, Button, Card, Drawer, EmptyState, IconButton, PageHeader, SearchBox, StatCard, Timeline } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { downloadCsv } from '@/lib/csv'
import { fDate, fDateTime, hotelDateKey } from '@/lib/time'
import { toast } from '@/lib/toast'
import type { AckEvent, Person, SopVersion } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { sendAckReminder } from './actions'
import { Callout, FilterSelect, Meter } from './components'
import { pct } from './model'

type Cell = { state: 'ack' | 'opened' | 'none' | 'na'; ev?: AckEvent }
const CELL = {
  ack: { label: 'Acknowledged', cls: 'border-ok/25 bg-ok/10 text-ok' },
  opened: { label: 'Opened', cls: 'border-amber/30 bg-amber/10 text-amber' },
  none: { label: 'Not opened', cls: 'border-danger/25 bg-danger/[0.07] text-danger' },
  na: { label: 'Not required', cls: '' },
} as const

export function AcknowledgmentLedger() {
  const { person: me } = usePersona('manager')
  const { ackEvents, people, sopVersions, sops, shifts, jobRoles, audit } = useDB()
  const [team, setTeam] = useState('')
  const [role, setRole] = useState('')
  const [shift, setShift] = useState('')
  const [sopF, setSopF] = useState('')
  const [only, setOnly] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<{ p: Person; v: SopVersion } | null>(null)

  // Columns: the current published version of every live SOP.
  const versions = useMemo(() => sops.filter((s) => !s.retiredAt && s.currentVersionId).map((s) => byId(sopVersions, s.currentVersionId)!).filter((v) => v?.status === 'published'), [sops, sopVersions])
  const cell = (p: Person, v: SopVersion): Cell => {
    if (p.jobRoleId !== v.jobRoleId) return { state: 'na' }
    const ev = ackEvents.find((a) => a.personId === p.id && a.kind === 'sop' && a.refId === v.id)
    return { state: ev?.acknowledgedAt ? 'ack' : ev?.openedAt ? 'opened' : 'none', ev }
  }
  const governed = people.filter((p) => versions.some((v) => v.jobRoleId === p.jobRoleId))
  const cols = versions.filter((v) => !sopF || v.id === sopF)
  const rows = governed.filter((p) => {
    const r = byId(jobRoles, p.jobRoleId)
    if (team && r?.team !== team) return false
    if (role && p.jobRoleId !== role) return false
    if (shift && !byId(shifts, shift)?.memberIds.includes(p.id)) return false
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false
    if (only === 'gaps' && !cols.some((v) => ['opened', 'none'].includes(cell(p, v).state))) return false
    if (only === 'never' && !cols.some((v) => cell(p, v).state === 'none')) return false
    return cols.some((v) => cell(p, v).state !== 'na')
  })
  const all = rows.flatMap((p) => cols.map((v) => cell(p, v))).filter((c) => c.state !== 'na')
  const n = { ack: all.filter((c) => c.state === 'ack').length, opened: all.filter((c) => c.state === 'opened').length, none: all.filter((c) => c.state === 'none').length }
  const perSop = (v: SopVersion) => { const cs = rows.map((p) => cell(p, v)).filter((c) => c.state !== 'na'); return { total: cs.length, ack: cs.filter((c) => c.state === 'ack').length } }
  const perPerson = (p: Person) => { const cs = cols.map((v) => cell(p, v)).filter((c) => c.state !== 'na'); return { total: cs.length, ack: cs.filter((c) => c.state === 'ack').length } }
  const uncovered = jobRoles.filter((r) => people.some((p) => p.jobRoleId === r.id) && !versions.some((v) => v.jobRoleId === r.id))

  const remind = (personIds: string[], what: string) => {
    const k = sendAckReminder(me?.id ?? 'elena', personIds, what)
    if (k) toast.success(`Reminder sent to ${k} ${k === 1 ? 'person' : 'people'}`, { description: `${what} — shown on their phone until they acknowledge. Logged in the audit trail.` })
  }
  const outstanding = (v: SopVersion) => rows.filter((p) => ['opened', 'none'].includes(cell(p, v).state)).map((p) => p.id)
  const exportCsv = () => downloadCsv(`acknowledgment-ledger-${hotelDateKey()}.csv`, [
    ['Employee', 'Employee no', 'Role', 'SOP', 'Version', 'Status', 'Opened at', 'Acknowledged at'],
    ...rows.flatMap((p) => cols.filter((v) => cell(p, v).state !== 'na').map((v) => { const c = cell(p, v); return [p.name, p.employeeNo, byId(jobRoles, p.jobRoleId)?.name, v.code, v.version, CELL[c.state].label, c.ev?.openedAt ?? '', c.ev?.acknowledgedAt ?? ''] })),
  ])
  const overall = pct(n.ack, all.length)

  return (
    <div className="space-y-6">
      <PageHeader title="Acknowledgment ledger" description="Proof that each person has read and confirmed the current version of every SOP for their job."
        actions={<>
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          <Button variant="primary" icon={BellRing} disabled={!n.opened && !n.none} onClick={() => remind([...new Set(cols.flatMap(outstanding))], 'All outstanding SOP acknowledgments')}>Remind everyone outstanding</Button>
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Compliance" value={overall} unit="%" icon={ShieldCheck} hint={`${n.ack} of ${all.length} required`} />
        <StatCard label="Acknowledged" value={n.ack} hint="confirmed read" />
        <StatCard label="Opened, not confirmed" value={n.opened} hint="nudge to finish" />
        <StatCard label="Not opened" value={n.none} hint="never seen it" />
      </div>
      {uncovered.length > 0 && <Callout tone="info" title={`${uncovered.length} job roles have no published SOP`}>{uncovered.map((r) => r.name).join(', ')} — nothing to acknowledge yet, so they’re left out of the ledger.</Callout>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <SearchBox value={q} onChange={setQ} placeholder="Find a person" className="w-full sm:w-56" />
          <FilterSelect label="Team" value={team} onChange={setTeam}><option value="">All teams</option>{[...new Set(jobRoles.map((r) => r.team))].map((t) => <option key={t} value={t}>{t}</option>)}</FilterSelect>
          <FilterSelect label="Role" value={role} onChange={setRole}><option value="">All roles</option>{jobRoles.filter((r) => versions.some((v) => v.jobRoleId === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</FilterSelect>
          <FilterSelect label="Shift" value={shift} onChange={setShift}><option value="">All shifts</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</FilterSelect>
          <FilterSelect label="SOP" value={sopF} onChange={setSopF}><option value="">All SOPs</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}</FilterSelect>
          <FilterSelect label="Status" value={only} onChange={setOnly}><option value="">Everyone</option><option value="gaps">With gaps</option><option value="never">Never opened</option></FilterSelect>
        </div>
        {!rows.length ? <EmptyState compact title="No one matches" description="Clear a filter to see more people." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">SOP acknowledgment matrix</caption>
              <thead className="bg-surface-2">
                <tr className="border-b border-line">
                  <th className="th sticky left-0 z-10 bg-surface-2">Staff member</th>
                  {cols.map((v) => { const s = perSop(v); return (
                    <th key={v.id} className="th min-w-[124px] align-bottom normal-case tracking-normal">
                      <div className="text-xs font-semibold text-ink">{v.code}</div>
                      <div className="text-2xs font-normal text-muted">v{v.version}</div>
                      {s.total > 0 && <div className="mt-1.5 flex items-center gap-2"><Meter value={s.ack} max={s.total} tone={s.ack === s.total ? 'success' : 'warning'} label={`${v.code}: ${s.ack} of ${s.total} acknowledged`} /><span className="text-2xs font-semibold tabular text-ink-2">{pct(s.ack, s.total)}%</span></div>}
                    </th>
                  ) })}
                  <th className="th text-right">Person</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => { const pp = perPerson(p); const gaps = cols.filter((v) => ['opened', 'none'].includes(cell(p, v).state)); return (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                      <Link to={`/manager/staff/${p.id}`} className="flex items-center gap-2.5 hover:underline"><Avatar name={p.name} size={26} /><span className="min-w-0"><span className="block truncate font-medium text-ink">{p.name}</span><span className="block truncate text-xs text-muted">{byId(jobRoles, p.jobRoleId)?.name}</span></span></Link>
                    </td>
                    {cols.map((v) => { const c = cell(p, v); return (
                      <td key={v.id} className="px-4 py-2.5">
                        {c.state === 'na' ? <span className="text-xs text-muted" aria-label="Not required">—</span> : (
                          <button type="button" onClick={() => setOpen({ p, v })} className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-pill border px-2 py-0.5 text-2xs font-semibold transition hover:shadow-pop', CELL[c.state].cls)}
                            aria-label={`${p.name}, ${v.code}: ${CELL[c.state].label}${c.state !== 'none' ? ` ${fDate((c.ev?.acknowledgedAt ?? c.ev?.openedAt)!)}` : ''}`}>
                            {c.state === 'ack' ? <><Check size={11} strokeWidth={3} aria-hidden />{fDate(c.ev!.acknowledgedAt!)}</> : c.state === 'opened' ? <>Opened {fDate(c.ev!.openedAt!)}</> : 'Not opened'}
                          </button>
                        )}
                      </td>
                    ) })}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={clsx('text-xs font-semibold tabular', pp.ack === pp.total ? 'text-ok' : 'text-ink')}>{pct(pp.ack, pp.total)}%</span>
                        {gaps.length > 0 && <IconButton size="sm" icon={BellRing} label={`Remind ${p.name}`} onClick={() => remind([p.id], gaps.map((v) => `${v.code} v${v.version}`).join(', '))} />}
                      </div>
                    </td>
                  </tr>
                ) })}
              </tbody>
              <tfoot className="bg-surface-2">
                <tr className="border-t border-line">
                  <td className="sticky left-0 z-10 bg-surface-2 px-4 py-2 text-xs font-medium text-muted">Remind by SOP</td>
                  {cols.map((v) => <td key={v.id} className="px-4 py-2">{outstanding(v).length > 0 ? <Button size="xs" variant="secondary" icon={BellRing} onClick={() => remind(outstanding(v), `${v.code} v${v.version}`)} aria-label={`Remind ${outstanding(v).length} outstanding on ${v.code}`}>Remind {outstanding(v).length}</Button> : <span className="whitespace-nowrap text-xs text-ok">All confirmed</span>}</td>)}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-2xs text-muted">
          {(['ack', 'opened', 'none'] as const).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-sm border', CELL[k].cls)} />{CELL[k].label}</span>)}
          <span className="flex items-center gap-1"><Check size={11} aria-hidden /> date acknowledged</span><span>— not required for that role</span>
        </div>
      </Card>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? open.p.name : ''} description={open ? `${open.v.code} v${open.v.version} · ${open.v.title}` : ''}
        footer={open && cell(open.p, open.v).state !== 'ack' && <Button variant="primary" icon={BellRing} onClick={() => { remind([open.p.id], `${open.v.code} v${open.v.version}`); setOpen(null) }}>Send reminder</Button>}>
        {open && (() => { const c = cell(open.p, open.v); return (
          <div className="space-y-4">
            <Badge tone={c.state === 'ack' ? 'success' : c.state === 'opened' ? 'warning' : 'danger'} dot size="md">{CELL[c.state].label}</Badge>
            <Timeline items={[
              ...(open.v.publishedAt ? [{ id: 'pub', at: open.v.publishedAt, title: `v${open.v.version} published`, tone: 'brand' as const }] : []),
              ...(c.ev?.openedAt ? [{ id: 'open', at: c.ev.openedAt, title: 'Opened on their phone', tone: 'info' as const }] : []),
              ...(c.ev?.acknowledgedAt ? [{ id: 'ack', at: c.ev.acknowledgedAt, title: 'Confirmed they read it', tone: 'success' as const }] : []),
              ...audit.filter((a) => a.action === 'ack.reminder_sent' && a.detail.includes(`${open.v.code} v${open.v.version}`) && a.detail.includes(open.p.name.split(' ')[0])).map((a) => ({ id: a.id, at: a.at, title: `Reminder sent by ${byId(people, a.actorId)?.name ?? a.actorId}`, tone: 'warning' as const })),
            ].sort((a, b) => a.at.localeCompare(b.at)).map(({ at, ...it }) => ({ ...it, meta: fDateTime(at) }))} />
            {c.state === 'none' && <Callout tone="danger" title="Not opened yet">{open.p.name.split(' ')[0]} hasn’t opened this version yet. Send a reminder, or go through it together at the start of their next shift.</Callout>}
          </div>
        ) })()}
      </Drawer>
    </div>
  )
}
