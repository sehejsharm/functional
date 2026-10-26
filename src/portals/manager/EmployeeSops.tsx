import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SopSteps } from '@/components/SopSteps'
import { Avatar, Drawer, PageHeader, Pill, SearchBox, Section, Tabs } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { fDate } from '@/lib/time'
import type { CatalogueId, Person } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'

export function EmployeeSops() {
  const { person: me } = usePersona('manager')
  const { jobRoles, people, sopVersions, ackEvents } = useDB()
  const [cat, setCat] = useState<CatalogueId>('pilot')
  const [q, setQ] = useState('')
  const [hist, setHist] = useState(false)
  const [inspect, setInspect] = useState<string | null>(null)
  const [who, setWho] = useState<Person | null>(null)

  const pubIn = sopVersions.filter((v) => v.status === 'published' && v.catalogue.includes(cat))
  const staff = people.filter((p) => p.catalogue.includes(cat))
  const sopsFor = (p: Person) => pubIn.filter((v) => v.jobRoleId === p.jobRoleId)
  const myAcks = ackEvents.filter((a) => a.personId === me?.id && a.kind === 'sop' && a.acknowledgedAt)
  const inspected = byId(sopVersions, inspect)

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager" title="Employee SOPs" tagline="Know the standard behind every task."
        right={<Pill tone="light">{me?.name} · Manager review · SOPs stay read-only.</Pill>} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">Demo catalogues:</span>
        <Tabs value={cat} onChange={setCat} items={[{ id: 'pilot', label: 'Pilot SOPs' }, { id: 'whole', label: `Whole-hotel sample · ${pubIn.length} jobs · ${staff.length} people` }]} />
      </div>
      <div className="card">
        <button onClick={() => setHist((h) => !h)} className="flex w-full items-center justify-between p-5 text-left">
          <div><div className="font-semibold text-white">Your SOP acceptance history</div><div className="text-xs text-sage-300">Open to inspect an exact version you accepted</div></div>
          <ChevronDown className={clsx('transition', hist && 'rotate-180')} size={18} />
        </button>
        {hist && <ul className="border-t border-white/5 px-5 py-3 text-sm">
          {sopVersions.filter((v) => v.status === 'published' || v.status === 'superseded').map((v) => {
            const a = myAcks.find((x) => x.refId === v.id)
            return <li key={v.id} className="flex items-center justify-between py-2"><button className="text-left hover:text-gold-400" onClick={() => setInspect(v.id)}>{v.code} · {v.version} · {v.title}</button>
              <span className="text-xs text-sage-300">{a ? `Accepted ${fDate(a.acknowledgedAt!)}` : 'Reviewed at assignment'}</span></li>
          })}
        </ul>}
      </div>
      <div className="flex gap-4 text-sm"><Link to="/manager/assign-rooms" className="text-gold-400 hover:underline">Assignments & verification</Link><Link to="/manager/sop-policy" className="text-gold-400 hover:underline">Hotel SOP policy</Link></div>

      <Section title="Published SOP availability">
        <ul className="space-y-2">
          {jobRoles.map((r) => {
            const inRole = staff.filter((p) => p.jobRoleId === r.id)
            if (!inRole.length) return null
            const covered = inRole.filter((p) => sopsFor(p).length > 0).length
            const gap = covered < inRole.length
            return (
              <li key={r.id} className={clsx('flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3', gap ? 'border-danger/40 bg-danger/5' : 'border-white/10')}>
                <div className="font-semibold text-white">{r.name}{covered === 0 && <span className="ml-2 font-normal text-danger">— No SOP yet</span>}</div>
                <div className="flex items-center gap-3 text-sm"><span className={gap ? 'text-danger' : 'text-ok'}>{covered} of {inRole.length} people with an SOP</span>
                  <div className="h-2 w-28 overflow-hidden rounded-pill bg-white/10"><div className={clsx('h-full', gap ? 'bg-danger' : 'bg-ok')} style={{ width: `${(covered / inRole.length) * 100}%` }} /></div></div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="All employees" right={<div className="w-64"><SearchBox value={q} onChange={setQ} placeholder="Find a person" /></div>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => {
            const n = sopsFor(p).length
            return <button key={p.id} onClick={() => setWho(p)} className="card flex items-center gap-3 p-3 text-left hover:border-gold-500/40">
              <Avatar initials={p.initials} /><div className="flex-1"><div className="text-sm font-semibold text-white">{p.name}</div><div className="text-xs text-sage-300">{p.title}</div></div>
              <Pill tone={n ? 'ok' : 'danger'}>{n ? `${n} SOP${n > 1 ? 's' : ''}` : 'No SOP'}</Pill></button>
          })}
        </div>
      </Section>

      <Drawer open={!!who} onClose={() => setWho(null)} title={who?.name ?? ''}>
        {who && <ul className="space-y-2">{sopsFor(who).map((v) => {
          const a = ackEvents.find((x) => x.personId === who.id && x.kind === 'sop' && x.refId === v.id)
          return <li key={v.id} className="card p-3 text-sm"><button className="font-semibold text-white hover:text-gold-400" onClick={() => setInspect(v.id)}>{v.code} · {v.version}</button>
            <div className="text-xs text-sage-300">{a?.acknowledgedAt ? `Accepted ${fDate(a.acknowledgedAt)}` : a?.openedAt ? 'Opened, not confirmed' : 'Not opened'}</div></li>
        })}{!sopsFor(who).length && <li className="text-sm text-danger">This person is working without a governing SOP.</li>}</ul>}
      </Drawer>
      <Drawer open={!!inspected} onClose={() => setInspect(null)} title={inspected ? `${inspected.code} · ${inspected.version}` : ''}>
        {inspected && <SopSteps steps={inspected.steps} version={inspected.version} interactive={false} />}
      </Drawer>
    </div>
  )
}

export function SopPolicy() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager" title="Hotel SOP policy" tagline="How standards are written, released and followed here." />
      <Section>
        <ul className="space-y-3 text-sm text-sage-200">
          <li><b className="text-white">Authors own SOPs.</b> Managers and employees read them; managers never edit them.</li>
          <li><b className="text-white">Two independent approvals</b> release a version. Authors cannot approve their own.</li>
          <li><b className="text-white">Pinned versions.</b> A room keeps the version it was assigned with, even if a newer one is released mid-shift.</li>
          <li><b className="text-white">Safety first.</b> A time target must never override safety or guest privacy.</li>
          <li><b className="text-white">Reading is not accepting.</b> Opening or replying to a notice is never task acceptance.</li>
        </ul>
      </Section>
    </div>
  )
}
