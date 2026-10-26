import { BookOpen, ChevronRight, HeartHandshake, LifeBuoy, ShieldAlert, Sparkles, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SopSteps } from '@/components/SopSteps'
import { Drawer, PageHeader, Pill, SearchBox, Section } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { usePersona } from '@/shell/PortalShell'
import { useMyTasks } from './Work'

// Reference-only room guides (not authoritative task SOPs).
const GUIDES: { topic: string; icon: typeof Sparkles; items: { title: string; body: string }[] }[] = [
  { topic: 'Room care', icon: Sparkles, items: [
    { title: 'Making a hospital-corner bed', body: 'Tuck the sheet at 45°, fold the flap down, tuck the remainder flat.' },
    { title: 'Marble and brass surfaces', body: 'Use the neutral pH cleaner only. Buff brass dry with the yellow cloth.' },
    { title: 'Minibar restock', body: 'Labels face forward, oldest dates at the front.' },
    { title: 'Bathroom amenity layout', body: 'Left to right: shampoo, conditioner, body wash, lotion.' },
  ] },
  { topic: 'Safety', icon: ShieldAlert, items: [
    { title: 'Chemical handling', body: 'Gloves on, caps locked, bottom shelf of the trolley.' },
    { title: 'Needles and sharps', body: 'Do not touch. Leave the room, call security on 222.' },
    { title: 'Lifting linen bags', body: 'Bend the knees, keep the load close, max 12 kg.' },
    { title: 'Wet floors', body: 'Sign out before mopping, in until fully dry.' },
    { title: 'Fire assembly', body: 'Stairwell B to the car park assembly point.' },
  ] },
  { topic: 'Guest care', icon: HeartHandshake, items: [
    { title: 'Do Not Disturb', body: 'Never knock on DND. After 2 PM, slide the service card.' },
    { title: 'Guest belongings', body: 'Never move, open or read guest items.' },
    { title: 'Greeting in the corridor', body: 'Pause, smile, step aside, greet by time of day.' },
    { title: 'Lost and found', body: 'Log it, bag it, hand it to the office within the hour.' },
    { title: 'Privacy first', body: 'A time target must never override safety or guest privacy.' },
  ] },
  { topic: 'Shift support', icon: LifeBuoy, items: [
    { title: 'Asking for backup', body: 'Tell your supervisor before you fall behind, not after.' },
    { title: 'Reporting maintenance', body: 'Use Report Issue inside the room so it is linked to the room.' },
  ] },
]
const TOTAL = GUIDES.reduce((n, g) => n + g.items.length, 0)

export function EmployeeGuides() {
  const { person } = usePersona('employee')
  const { all } = useMyTasks(person?.id)
  const versions = useDB((s) => s.sopVersions)
  const sops = useDB((s) => s.sops)
  const rooms = useDB((s) => s.rooms)
  const [q, setQ] = useState('')
  const [topic, setTopic] = useState<string | null>(null)
  const [hotel, setHotel] = useState(false)
  const published = sops.map((s) => byId(versions, s.currentVersionId)).filter(Boolean)
  const hits = useMemo(() => q ? GUIDES.flatMap((g) => g.items.filter((i) => (i.title + i.body).toLowerCase().includes(q.toLowerCase())).map((i) => ({ ...i, topic: g.topic }))) : [], [q])
  const open = GUIDES.find((g) => g.topic === topic)

  return (
    <div className="space-y-5">
      <PageHeader title="SOP guides" tagline="Know the standard. Find it fast." />
      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => setHotel(true)} className="card p-4 text-left hover:border-gold-500/40"><BookOpen className="mb-2 text-gold-400" size={20} /><div className="font-semibold text-white">Hotel SOPs</div><div className="text-xs text-sage-300">Shared by your manager</div></button>
        <a href="#room-guides" className="card p-4 hover:border-gold-500/40"><Sparkles className="mb-2 text-gold-400" size={20} /><div className="font-semibold text-white">Room guides</div><div className="text-xs text-sage-300">Reference only</div></a>
        <button onClick={() => setTopic('Safety')} className="card p-4 text-left hover:border-gold-500/40"><Users className="mb-2 text-gold-400" size={20} /><div className="font-semibold text-white">Workplace essentials</div><div className="text-xs text-sage-300">Safety, respect & security</div></button>
      </div>

      <Section title="Your rooms today">
        <ul className="divide-y divide-white/5">
          {all.map((t) => { const v = byId(versions, t.sopVersionId); return (
            <li key={t.id}><Link to={`/employee/tasks/${t.id}`} className="flex items-center justify-between py-3 text-sm hover:text-gold-400">
              <span>Room {byId(rooms, t.roomId)?.number} · Read room SOP</span><span className="flex items-center gap-2"><Pill tone="gold">{v?.version}</Pill><ChevronRight size={14} /></span>
            </Link></li>) })}
          {!all.length && <li className="py-3 text-sm text-sage-300">No rooms assigned today.</li>}
        </ul>
      </Section>

      <Section id="room-guides" title="Room guides" right={<span className="text-xs text-sage-300">{TOTAL} guides · reference only · hotel review required</span>}>
        <SearchBox value={q} onChange={setQ} placeholder="Find a guide" />
        {q ? (
          <ul className="mt-4 space-y-2">{hits.map((h) => <li key={h.title} className="rounded-xl bg-forest-950/40 p-3"><div className="text-sm font-semibold text-white">{h.title}</div><div className="text-xs text-sage-300">{h.topic} · {h.body}</div></li>)}
            {!hits.length && <li className="text-sm text-sage-300">No guide matches “{q}”.</li>}</ul>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <button key={g.topic} onClick={() => setTopic(g.topic)} className="flex items-center gap-3 rounded-xl bg-forest-950/40 p-4 text-left hover:bg-forest-950/70">
                <g.icon className="text-gold-400" size={20} /><div className="flex-1"><div className="font-semibold text-white">{g.topic}</div><div className="text-xs text-sage-300">{g.items.length} guides</div></div><ChevronRight size={16} className="text-sage-300" />
              </button>
            ))}
          </div>
        )}
      </Section>

      <Drawer open={!!open} onClose={() => setTopic(null)} title={open?.topic ?? ''}>
        <p className="mb-4 text-xs text-sage-300">Reference only. Your room SOP is always the standard for a task.</p>
        <ul className="space-y-3">{open?.items.map((i) => <li key={i.title} className="card p-4"><div className="font-semibold text-white">{i.title}</div><p className="mt-1 text-sm text-sage-300">{i.body}</p></li>)}</ul>
      </Drawer>
      <Drawer open={hotel} onClose={() => setHotel(false)} title="Hotel SOPs">
        <div className="space-y-4">{published.map((v) => v && <div key={v.id}><div className="mb-2 text-sm font-semibold text-white">{v.title} <span className="text-sage-300">· {v.code}</span></div><SopSteps steps={v.steps} version={v.version} interactive={false} /></div>)}</div>
      </Drawer>
    </div>
  )
}
