import clsx from 'clsx'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { Avatar, Button, Drawer, PageHeader, Pill, Section, Tabs } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDate, fDateTime } from '@/lib/time'
import { usePersona } from '@/shell/PortalShell'
import { useLiveShift } from './AssignRooms'

export function HotelNotices() {
  const { person: me } = usePersona('manager')
  const now = useNow()
  const { notices, shifts, people, ackEvents, sendNotice } = useDB()
  const live = useLiveShift(now, shifts)
  const templates = notices.filter((n) => n.sample && !n.sentAt).concat(notices.filter((n) => n.sample && n.sentAt))
  const [tplId, setTplId] = useState(templates[0]?.id)
  const [picking, setPicking] = useState(false)
  const [audience, setAudience] = useState<'team' | 'people'>('team')
  const [teamShiftId, setTeamShiftId] = useState(live?.id ?? shifts[0].id)
  const [chosen, setChosen] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const tpl = byId(notices, tplId)
  const team = byId(shifts, teamShiftId)!
  const recipients = audience === 'team' ? team.memberIds : chosen
  const onShiftNow = live ? live.memberIds.map((id) => byId(people, id)?.name.split(' ')[0]).join(', ') : 'No one'
  const teamLabel = `${team.team} · ${team.name.toLowerCase()}`

  const sentList = notices.filter((n) => n.sentAt).sort((a, b) => b.sentAt!.localeCompare(a.sentAt!))
  const d = byId(notices, detail)

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Manager" title="Hotel notices" tagline="Tell the team once. See who has it." />
      <Section title="Sent notices">
        <ul className="divide-y divide-white/5">
          {sentList.map((n) => {
            const acks = ackEvents.filter((a) => a.kind === 'notice' && a.refId === n.id)
            return (
              <li key={n.id}><button onClick={() => setDetail(n.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left hover:text-gold-400">
                <div><div className="font-semibold text-white">{n.title}</div><div className="text-xs text-sage-300">{n.audience === 'people' ? 'Chosen people' : 'Shift team'} · {n.recipientIds.length} people · {fDate(n.sentAt!)}</div></div>
                <div className="flex gap-2">{n.sample && <Pill>Sample</Pill>}<Pill tone="ok">{acks.filter((a) => a.openedAt).length}/{n.recipientIds.length} opened</Pill>{n.replyNeeded && <Pill tone="gold">{acks.filter((a) => a.repliedAt).length} replied</Pill>}</div>
              </button></li>
            )
          })}
        </ul>
      </Section>

      <Section title="Send a notice">
        <div className="space-y-5">
          <div>
            <span className="label">Notice</span>
            {tpl && (
              <div className="flex items-start gap-3 rounded-xl border border-gold-500/50 bg-gold-500/5 p-4">
                <span className="mt-1 h-4 w-4 shrink-0 rounded-full border-4 border-gold-500" />
                <div className="flex-1"><div className="font-semibold text-white">{tpl.title}</div><p className="text-sm text-sage-300">{tpl.body}</p>
                  <div className="mt-1 text-xs text-sage-300">Today · {tpl.replyNeeded ? 'Reply needed' : 'No reply'} · {tpl.sample ? 'Sample' : 'Custom'}</div></div>
                <button onClick={() => setPicking(true)} className="text-sm text-gold-400 hover:underline">Change</button>
              </div>
            )}
          </div>
          <div><span className="label">Send to</span>
            <Tabs value={audience} onChange={setAudience} items={[{ id: 'team', label: 'A shift team' }, { id: 'people', label: 'Chosen people' }]} /></div>
          {audience === 'team' ? (
            <label className="block max-w-sm"><span className="label">Team</span>
              <select className="input" value={teamShiftId} onChange={(e) => setTeamShiftId(e.target.value)}>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.team} · {s.name.toLowerCase()} · {s.memberIds.length} people</option>)}
              </select>
              <span className="mt-1.5 block text-xs text-sage-300">On shift now: {onShiftNow}</span>
            </label>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {people.map((p) => (
                <label key={p.id} className={clsx('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm', chosen.includes(p.id) ? 'border-gold-500 bg-gold-500/10' : 'border-white/10')}>
                  <input type="checkbox" className="accent-[rgb(201,162,75)]" checked={chosen.includes(p.id)} onChange={() => setChosen((c) => c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id])} />
                  <Avatar initials={p.initials} size={24} />{p.name}
                </label>
              ))}
            </div>
          )}
          {tpl && <p className="rounded-xl bg-forest-950/40 p-3 text-sm text-sage-200">Sends <b className="text-white">{tpl.title}</b> to {recipients.length} people. Opening or replying is never task acceptance.</p>}
          <div className="flex items-center gap-3">
            <Button variant="gold" disabled={!tpl || !recipients.length} onClick={() => {
              sendNotice({ title: tpl!.title, body: tpl!.body, replyNeeded: tpl!.replyNeeded, audience, teamShiftId: audience === 'team' ? teamShiftId : undefined, recipientIds: recipients, sentById: me!.id })
              setSent(true); setTimeout(() => setSent(false), 2500)
            }}><Send size={15} /> Send to {audience === 'team' ? teamLabel : 'chosen people'} · {recipients.length} people</Button>
            {sent && <span className="text-sm text-ok">Sent.</span>}
          </div>
        </div>
      </Section>

      <Drawer open={picking} onClose={() => setPicking(false)} title="Choose a notice">
        <ul className="space-y-2">{templates.map((t) => (
          <li key={t.id}><button onClick={() => { setTplId(t.id); setPicking(false) }} className={clsx('card w-full p-4 text-left', t.id === tplId && 'border-gold-500/60')}>
            <div className="font-semibold text-white">{t.title}</div><p className="text-sm text-sage-300">{t.body}</p></button></li>))}</ul>
      </Drawer>
      <Drawer open={!!d} onClose={() => setDetail(null)} title={d?.title ?? ''}>
        {d && <ul className="space-y-2">{d.recipientIds.map((id) => {
          const a = ackEvents.find((x) => x.kind === 'notice' && x.refId === d.id && x.personId === id)
          return <li key={id} className="flex items-center justify-between rounded-xl bg-forest-950/40 px-3 py-2 text-sm">
            <span>{byId(people, id)?.name}</span>
            <span className="text-xs text-sage-300">{a?.repliedAt ? `Replied ${fDateTime(a.repliedAt)}: “${a.reply}”` : a?.openedAt ? `Opened ${fDateTime(a.openedAt)}` : 'Not opened'}</span></li>
        })}</ul>}
      </Drawer>
    </div>
  )
}
