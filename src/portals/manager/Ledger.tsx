import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Drawer, PageHeader, Pill, Section } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { downloadCsv } from '@/lib/csv'
import { fDateTime } from '@/lib/time'
import type { AckEvent } from '@/lib/types'

type Status = 'Acknowledged' | 'Opened, not confirmed' | 'Not opened'
const statusOf = (a: AckEvent): Status => (a.acknowledgedAt ? 'Acknowledged' : a.openedAt ? 'Opened, not confirmed' : 'Not opened')
const tone = { Acknowledged: 'ok', 'Opened, not confirmed': 'warn', 'Not opened': 'danger' } as const

export function AcknowledgmentLedger() {
  const { ackEvents, people, sopVersions, notices, shifts, jobRoles, audit } = useDB()
  const [f, setF] = useState({ shift: '', role: '', ref: '', from: '', to: '', kind: '' })
  const [open, setOpen] = useState<AckEvent | null>(null)

  // Every rostered person × every published SOP version for their role gets a row, even if never opened.
  const rows = useMemo(() => {
    const out = [...ackEvents]
    sopVersions.filter((v) => v.status === 'published').forEach((v) => people.filter((p) => p.jobRoleId === v.jobRoleId).forEach((p) => {
      if (!out.some((a) => a.personId === p.id && a.kind === 'sop' && a.refId === v.id)) out.push({ id: `virt-${p.id}-${v.id}`, propertyId: v.propertyId, personId: p.id, kind: 'sop', refId: v.id, openedAt: null, acknowledgedAt: null })
    }))
    return out.filter((a) => {
      const p = byId(people, a.personId)
      const t = a.acknowledgedAt ?? a.openedAt
      return (!f.shift || shifts.find((s) => s.id === f.shift)?.memberIds.includes(a.personId)) && (!f.role || p?.jobRoleId === f.role) && (!f.ref || a.refId === f.ref) && (!f.kind || a.kind === f.kind)
        && (!f.from || (t && t >= f.from)) && (!f.to || (t && t.slice(0, 10) <= f.to))
    })
  }, [ackEvents, sopVersions, people, shifts, f])

  const refLabel = (a: AckEvent) => a.kind === 'sop' ? (() => { const v = byId(sopVersions, a.refId); return `${v?.code} · ${v?.version}` })() : `Notice · ${byId(notices, a.refId)?.title}`
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const counts = {
    ack: rows.filter((a) => a.acknowledgedAt && a.acknowledgedAt >= weekAgo).length,
    pending: rows.filter((a) => a.openedAt && !a.acknowledgedAt).length,
    never: rows.filter((a) => !a.openedAt).length,
  }
  const exportCsv = () => downloadCsv('acknowledgment-ledger.csv', [
    ['Employee', 'Role', 'Type', 'Reference', 'Opened at', 'Acknowledged at', 'Replied at', 'Status'],
    ...rows.map((a) => { const p = byId(people, a.personId); return [p?.name, p?.title, a.kind, refLabel(a), a.openedAt, a.acknowledgedAt, a.repliedAt, statusOf(a)] }),
  ])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Compliance" title="Acknowledgment ledger" tagline="Proof that staff read the current procedure." right={<Button variant="gold" onClick={exportCsv}><Download size={16} /> Export CSV</Button>} />
      <div className="card flex flex-wrap gap-6 px-5 py-4 text-sm">
        <span><b className="text-xl text-ok">{counts.ack}</b> acknowledged this week</span>
        <span><b className="text-xl text-amber">{counts.pending}</b> pending</span>
        <span><b className="text-xl text-danger">{counts.never}</b> never opened</span>
      </div>
      <Section>
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <select className="input" value={f.kind} onChange={set('kind')} aria-label="Type"><option value="">SOPs & notices</option><option value="sop">SOPs</option><option value="notice">Notices</option></select>
          <select className="input" value={f.shift} onChange={set('shift')} aria-label="Shift"><option value="">All shifts</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="input" value={f.role} onChange={set('role')} aria-label="Role"><option value="">All roles</option>{jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select className="input" value={f.ref} onChange={set('ref')} aria-label="SOP"><option value="">All SOPs</option>{sopVersions.filter((v) => v.publishedAt).map((v) => <option key={v.id} value={v.id}>{v.code} {v.version}</option>)}</select>
          <input type="date" className="input" value={f.from} onChange={set('from')} aria-label="From" />
          <input type="date" className="input" value={f.to} onChange={set('to')} aria-label="To" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-sage-300"><tr><th className="py-2">Employee</th><th>SOP / notice</th><th>Opened at</th><th>Acknowledged at</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((a) => { const p = byId(people, a.personId); const s = statusOf(a); return (
                <tr key={a.id} onClick={() => setOpen(a)} className="cursor-pointer hover:bg-white/5" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(a)}>
                  <td className="py-2.5"><div className="text-white">{p?.name}</div><div className="text-xs text-sage-300">{p?.title}</div></td>
                  <td>{refLabel(a)}</td><td>{a.openedAt ? fDateTime(a.openedAt) : '—'}</td><td>{a.acknowledgedAt ? fDateTime(a.acknowledgedAt) : '—'}</td>
                  <td><Pill tone={tone[s]}>{s}</Pill></td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      </Section>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `${byId(people, open.personId)?.name} · ${refLabel(open)}` : ''}>
        {open && (
          <ol className="relative space-y-4 border-l border-white/10 pl-5">
            {open.kind === 'sop' && byId(sopVersions, open.refId)?.publishedAt && <TL at={byId(sopVersions, open.refId)!.publishedAt!} label="Version published" />}
            {open.openedAt && <TL at={open.openedAt} label="Opened" />}
            {open.acknowledgedAt && <TL at={open.acknowledgedAt} label="Confirmed read" />}
            {open.repliedAt && <TL at={open.repliedAt} label={`Replied: “${open.reply}”`} />}
            {audit.filter((e) => e.actorId === open.personId && e.detail.includes(open.refId)).map((e) => <TL key={e.id} at={e.at} label={e.action} />)}
            {!open.openedAt && <li className="text-sm text-danger">Not opened yet.</li>}
          </ol>
        )}
      </Drawer>
    </div>
  )
}

const TL = ({ at, label }: { at: string; label: string }) => (
  <li className="relative"><span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full bg-gold-500" /><div className="text-sm text-white">{label}</div><div className="text-xs text-sage-300">{fDateTime(at)}</div></li>
)
