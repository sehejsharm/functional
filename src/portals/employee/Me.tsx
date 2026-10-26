import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader, Section, Tabs } from '@/components/ui'
import { useDB } from '@/lib/db'
import { fTime, hotelDateKey } from '@/lib/time'
import type { AttendanceMark } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'

const MARK: Record<AttendanceMark, { sym: string; label: string; cls: string }> = {
  checkin: { sym: '✓', label: 'Check-in', cls: 'bg-ok/20 text-ok border-ok/40' },
  extra: { sym: '+', label: 'Extra shift', cls: 'bg-gold-500/20 text-gold-400 border-gold-500/40' },
  pending: { sym: '○', label: 'Review pending', cls: 'bg-amber/15 text-amber border-amber/40' },
}
const key = (d: Date) => d.toISOString().slice(0, 10)

export function EmployeeMe() {
  const { person } = usePersona('employee')
  const attendance = useDB((s) => s.attendance.filter((a) => a.personId === person?.id))
  const tasks = useDB((s) => s.tasks.filter((t) => t.personId === person?.id))
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const today = hotelDateKey()
  const [cursor, setCursor] = useState(() => new Date(today + 'T00:00:00Z'))
  const [selected, setSelected] = useState(today)
  const byDate = useMemo(() => new Map(attendance.map((a) => [a.date, a])), [attendance])

  const days = useMemo(() => {
    if (mode === 'week') {
      const s = new Date(cursor); s.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7))
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setUTCDate(s.getUTCDate() + i); return d })
    }
    const first = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))
    const lead = (first.getUTCDay() + 6) % 7
    const n = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), i + 1)))]
  }, [cursor, mode])

  const move = (dir: number) => { const d = new Date(cursor); if (mode === 'month') d.setUTCMonth(d.getUTCMonth() + dir); else d.setUTCDate(d.getUTCDate() + 7 * dir); setCursor(d) }
  const sel = byDate.get(selected)
  const selTasks = tasks.filter((t) => hotelDateKey(t.start) === selected)

  return (
    <div className="space-y-5">
      <PageHeader title="My log" tagline={person ? `${person.name} · ${person.title}` : undefined} />
      <Section title={cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        right={<div className="flex items-center gap-2">
          <Tabs value={mode} onChange={setMode} items={[{ id: 'month', label: 'Monthly' }, { id: 'week', label: 'Weekly' }]} />
          <button aria-label="Previous" onClick={() => move(-1)} className="rounded-lg p-1.5 hover:bg-white/5"><ChevronLeft size={18} /></button>
          <button aria-label="Next" onClick={() => move(1)} className="rounded-lg p-1.5 hover:bg-white/5"><ChevronRight size={18} /></button>
        </div>}>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-sage-300">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}</div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {days.map((d, i) => {
            if (!d) return <div key={i} />
            const k = key(d); const a = byDate.get(k)
            return (
              <button key={k} onClick={() => setSelected(k)} aria-label={`${k}: ${a ? MARK[a.mark].label : 'No mark'}`}
                className={clsx('flex aspect-square flex-col items-center justify-center rounded-cell border text-sm transition',
                  a ? MARK[a.mark].cls : 'border-white/5 bg-forest-950/30 text-sage-300', selected === k && 'ring-2 ring-gold-500', k === today && 'font-bold')}>
                <span>{d.getUTCDate()}</span>{a && <span className="text-[10px] leading-none">{MARK[a.mark].sym}</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-sage-300">
          {Object.values(MARK).map((m) => <span key={m.label} className="flex items-center gap-1.5"><span className={clsx('grid h-5 w-5 place-items-center rounded border', m.cls)}>{m.sym}</span>{m.label}</span>)}
          <span className="flex items-center gap-1.5"><span className="h-5 w-5 rounded border border-white/5 bg-forest-950/30" />No mark · No record</span>
        </div>
      </Section>
      <Section title={new Date(selected + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}>
        {sel ? <p className="text-sm text-white">{MARK[sel.mark].label} at {fTime(sel.at)}</p> : <p className="text-sm text-sage-300">No mark · No record</p>}
        {selTasks.length > 0 && <p className="mt-2 text-sm text-sage-300">{selTasks.filter((t) => t.status === 'done').length} of {selTasks.length} rooms completed.</p>}
      </Section>
    </div>
  )
}
