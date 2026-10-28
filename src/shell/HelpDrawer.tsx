import { useMemo, useState } from 'react'
import { DEMO } from '@/lib/api'
import { LifeBuoy } from 'lucide-react'
import { Drawer, SearchBox } from '@/components/ui'
import type { Portal } from '@/lib/types'

const FAQ: Record<Portal | 'login', { q: string; a: string }[]> = {
  login: [
    { q: 'Where do I get my passkey?', a: DEMO ? 'This is the shared demo: everyone uses the demo passkey shown under the sign-in button.' : 'Your property admin creates it for you. If you lose it, they can issue a new one — the old one stops working.' },
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
  // Support contact is configured per deployment (VITE_SUPPORT_EMAIL); without it the button is hidden rather than pretend.
  const support = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined
  return (
    <Drawer open={open} onClose={onClose} title="Help & shortcuts" description="Answers for this portal. Press ⌘K anywhere to search.">
      <SearchBox value={q} onChange={setQ} placeholder="Search help" />
      <ul className="mt-4 space-y-3">
        {items.map((f) => (
          <li key={f.q} className="card-inset p-4"><div className="text-sm font-semibold text-ink">{f.q}</div><p className="mt-1 text-sm text-ink-2">{f.a}</p></li>
        ))}
        {!items.length && <li className="text-sm text-muted">No answers match. Try other words, or contact support.</li>}
      </ul>
      <div className="mt-6 rounded-card border border-line p-4">
        <div className="text-sm font-semibold text-ink">Keyboard shortcuts</div>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm text-ink-2">
          <dt>Search everything</dt><dd><kbd className="kbd">⌘</kbd> <kbd className="kbd">K</kbd></dd>
          <dt>Quick search</dt><dd><kbd className="kbd">/</kbd></dd>
          <dt>Close a panel</dt><dd><kbd className="kbd">Esc</kbd></dd>
        </dl>
      </div>
      {support && (
        <a href={`mailto:${support}?subject=${encodeURIComponent(`Mise help (${portal})`)}`} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-cell bg-forest-900 text-sm font-medium text-white shadow-sm hover:bg-forest-800">
          <LifeBuoy size={16} aria-hidden /> Contact support
        </a>
      )}
    </Drawer>
  )
}
