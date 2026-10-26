import { useMemo, useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import { Button, Drawer, SearchBox } from '@/components/ui'
import type { Portal } from '@/lib/types'

const FAQ: Record<Portal | 'login', { q: string; a: string }[]> = {
  login: [
    { q: 'Where do I get my passkey?', a: 'Your property admin creates it for you. If you lose it, they can issue a new one — the old one stops working.' },
    { q: 'Can I paste my passkey?', a: 'Yes. Paste, password managers and phone autofill all work.' },
  ],
  employee: [
    { q: 'Why does a room say "Do not enter yet"?', a: 'Its time slot has not started. The room opens on its own at the scheduled hotel time.' },
    { q: 'How do I tick steps?', a: 'Open the room, press Start room, then tick each step in order.' },
    { q: 'What if the wifi drops?', a: 'Keep working. Ticks are saved on your phone and sync when the hotel connection is back.' },
    { q: 'Is reading a notice the same as accepting a task?', a: 'No. Opening or replying to a notice is never task acceptance.' },
  ],
  manager: [
    { q: 'Which SOP version does an assignment use?', a: 'The currently published version. Rooms already in progress stay on the version they started with.' },
    { q: 'Why is a time shown as "hotel time"?', a: 'All shifts run on the property clock, not your device clock, so travelling managers never mis-schedule.' },
    { q: 'Why are some screens locked?', a: 'Compliance and cross-shift analytics are reserved for Senior managers and Property admins.' },
  ],
  author: [
    { q: 'How many approvals does a release need?', a: 'Two independent approvals. You cannot approve your own version.' },
    { q: 'When does a version bump to x.0?', a: 'When steps are added or removed, a check requirement changes, or the time target changes. Wording-only edits are a minor bump.' },
    { q: 'How many steps can an SOP have?', a: 'Up to 30. Use plain words; say what to do, when to stop, and what a good finish looks like.' },
  ],
}

export function HelpDrawer({ open, onClose, portal }: { open: boolean; onClose: () => void; portal: Portal | 'login' }) {
  const [q, setQ] = useState('')
  const items = useMemo(() => FAQ[portal].filter((f) => (f.q + f.a).toLowerCase().includes(q.toLowerCase())), [portal, q])
  const support = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined
  return (
    <Drawer open={open} onClose={onClose} title="Help">
      <SearchBox value={q} onChange={setQ} placeholder="Search help" />
      <ul className="mt-4 space-y-3">
        {items.map((f) => (
          <li key={f.q} className="card p-4"><div className="font-semibold text-white">{f.q}</div><p className="mt-1 text-sm text-sage-300">{f.a}</p></li>
        ))}
        {!items.length && <li className="text-sm text-sage-300">No answers match. Try other words, or contact support.</li>}
      </ul>
      {support && <a href={`mailto:${support}?subject=${encodeURIComponent(`Mise help (${portal})`)}`} className="mt-6 block">
        <Button variant="primary" className="w-full"><LifeBuoy size={16} /> Contact support</Button>
      </a>}
    </Drawer>
  )
}
