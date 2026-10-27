import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertOctagon, ArrowRight, BedDouble, CornerDownLeft, FileText, Search, User, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Kbd } from '@/components/ui'
import { useDB } from '@/lib/db'
import { canAccess } from '@/lib/permissions'
import { useGrant, useSession } from '@/lib/session'
import { hotelDateKey } from '@/lib/time'
import type { Portal } from '@/lib/types'
import { NAV } from './nav'

interface Cmd { id: string; group: string; label: string; hint?: string; icon: LucideIcon; to: string; keywords?: string }

/** Global ⌘K / Ctrl+K search across screens, SOPs, people, rooms and incidents for the current portal. */
export function CommandPalette({ portal }: { portal: Portal }) {
  const open = useSession((s) => s.commandOpen)
  const setOpen = useSession((s) => s.setCommandOpen)
  const grant = useGrant(portal)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const { sops, sopVersions, people, rooms, tasks, issues, jobRoles } = useDB()

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useSession.getState().commandOpen) }
      if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); return }
      if (e.key === '/' && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, setOpen])
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) { opener.current = document.activeElement as HTMLElement | null; setQ(''); setI(0); setTimeout(() => input.current?.focus(), 30) }
    else if (opener.current && document.contains(opener.current)) { opener.current.focus({ preventScroll: true }); opener.current = null }
  }, [open])

  const all = useMemo<Cmd[]>(() => {
    const out: Cmd[] = NAV[portal].filter((n) => !n.need || canAccess(grant?.tier, n.need)).map((n) => ({ id: `nav-${n.to}`, group: 'Go to', label: n.label, icon: n.icon, to: n.to, hint: n.group }))
    if (portal === 'manager') out.push({ id: 'act-assign', group: 'Actions', label: 'Assign work to a room', icon: Zap, to: '/manager/assign-rooms' }, { id: 'act-incident', group: 'Actions', label: 'Log an incident', icon: Zap, to: '/manager/incidents?new=1' }, { id: 'act-notice', group: 'Actions', label: 'Send a hotel notice', icon: Zap, to: '/manager/notices?new=1' })
    if (portal === 'author') out.push({ id: 'act-new', group: 'Actions', label: 'Create a new SOP', icon: Zap, to: '/author/new' }, { id: 'act-import', group: 'Actions', label: 'Import an SOP from PDF', icon: Zap, to: '/author/new?import=1' })
    if (portal === 'employee') out.push({ id: 'act-report', group: 'Actions', label: 'Report an issue', icon: Zap, to: '/employee/reports?new=1' })
    sops.forEach((s) => {
      const v = sopVersions.find((x) => x.id === s.currentVersionId) ?? sopVersions.filter((x) => x.sopId === s.id).slice(-1)[0]
      if (!v || (portal === 'employee' && (!s.currentVersionId || s.retiredAt))) return
      const to = portal === 'author' ? `/author/sops/${s.id}` : portal === 'manager' ? `/manager/sops?sop=${s.id}` : `/employee/guides/${s.id}`
      out.push({ id: `sop-${s.id}`, group: 'SOPs', label: v.title, hint: `${s.code} · ${s.retiredAt ? 'retired' : s.currentVersionId ? `v${v.version}` : v.status.replace('_', ' ')}`, icon: FileText, to, keywords: `${s.code} ${v.tags.join(' ')}` })
    })
    if (portal === 'manager') {
      people.forEach((p) => out.push({ id: `p-${p.id}`, group: 'People', label: p.name, hint: jobRoles.find((r) => r.id === p.jobRoleId)?.name, icon: User, to: `/manager/staff/${p.id}`, keywords: `${p.employeeNo ?? ''} ${p.email ?? ''}` }))
      rooms.forEach((r) => out.push({ id: `r-${r.id}`, group: 'Rooms', label: `Room ${r.number}`, hint: [r.type, r.occupancy?.replace('_', ' '), r.guestName].filter(Boolean).join(' · '), icon: BedDouble, to: `/manager/tasks?room=${r.id}`, keywords: `${r.wing} floor ${r.floor}` }))
      issues.filter((x) => x.status !== 'resolved').forEach((x) => out.push({ id: `i-${x.id}`, group: 'Incidents', label: x.title, hint: `${x.severity} · ${x.status.replace('_', ' ')}`, icon: AlertOctagon, to: `/manager/incidents?id=${x.id}` }))
    }
    if (portal === 'employee' && grant) {
      const today = hotelDateKey()
      tasks.filter((t) => t.personId === grant.personId && hotelDateKey(t.start) === today && t.status !== 'cancelled').forEach((t) => {
        const r = rooms.find((x) => x.id === t.roomId)
        out.push({ id: `t-${t.id}`, group: 'My rooms today', label: `Room ${r?.number}`, hint: sopVersions.find((v) => v.id === t.sopVersionId)?.title, icon: BedDouble, to: `/employee/tasks/${t.id}` })
      })
    }
    return out
  }, [portal, grant, sops, sopVersions, people, rooms, tasks, issues, jobRoles])

  const results = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return all.filter((c) => c.group === 'Go to' || c.group === 'Actions' || c.group === 'My rooms today')
    const words = n.split(/\s+/)
    // Rank label prefix matches first ("room 1" → Room 101…), then label contains, then anything else; keep groups together.
    const score = (c: Cmd) => { const l = c.label.toLowerCase(); return l.startsWith(n) ? 3 : l.includes(n) ? 2 : 1 }
    const hits = all.filter((c) => { const hay = `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.group}`.toLowerCase(); return words.every((w) => hay.includes(w)) })
    const groupRank = new Map<string, number>()
    hits.forEach((c) => groupRank.set(c.group, Math.max(groupRank.get(c.group) ?? 0, score(c))))
    const order = [...groupRank.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
    return hits.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || score(b) - score(a)).slice(0, 40)
  }, [q, all])
  useEffect(() => setI(0), [q])
  useEffect(() => { list.current?.querySelector(`[data-idx="${i}"]`)?.scrollIntoView({ block: 'nearest' }) }, [i])

  const go = (c?: Cmd) => { if (!c) return; setOpen(false); nav(c.to) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(results.length - 1, x + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[i]) }
    else if (e.key === 'Escape') setOpen(false)
  }
  let lastGroup = ''

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div className="fixed inset-0 bg-forest-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div role="dialog" aria-modal="true" aria-label="Search" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.14 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={18} className="text-muted" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={portal === 'employee' ? 'Search rooms, guides and actions' : 'Search screens, SOPs, people, rooms…'}
                className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted focus:shadow-none focus-visible:shadow-none" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={results[i] ? `cmd-${results[i].id}` : undefined} />
              <Kbd>Esc</Kbd>
            </div>
            <div ref={list} id="cmdk-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
              {!results.length && <p className="px-3 py-10 text-center text-sm text-muted">No results for “{q}”</p>}
              {results.map((c, idx) => {
                const head = c.group !== lastGroup ? (lastGroup = c.group) : null
                return (
                  <div key={c.id}>
                    {head && <div className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted">{head}</div>}
                    <button id={`cmd-${c.id}`} role="option" aria-selected={idx === i} data-idx={idx} onMouseMove={() => setI(idx)} onClick={() => go(c)}
                      className={clsx('flex w-full items-center gap-3 rounded-cell px-3 py-2.5 text-left', idx === i ? 'bg-forest-50' : '')}>
                      <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-cell', idx === i ? 'bg-forest-900 text-white' : 'bg-surface-2 text-ink-2')}><c.icon size={15} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{c.label}</span>{c.hint && <span className="block truncate text-xs capitalize text-muted">{c.hint}</span>}</span>
                      {idx === i ? <CornerDownLeft size={14} className="text-muted" /> : <ArrowRight size={14} className="text-transparent" />}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-2xs text-muted">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> to open</span>
              <span className="ml-auto flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd> anywhere</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
