import { motion } from 'framer-motion'
import { useId, useState } from 'react'
import { StatCard } from './ui'

/** Dependency-free SVG charts for the light working canvas. Colours come from the theme tokens. */
export const SERIES = ['rgb(var(--forest-700))', 'rgb(var(--gold-500))', 'rgb(var(--info))', 'rgb(var(--amber))', 'rgb(var(--danger))', 'rgb(var(--ok))']
const GRID = 'rgb(var(--line))'
const AXIS = 'rgb(var(--muted))'

export interface Series { name: string; points: { x: string; y: number }[]; color?: string }

/**
 * Line / area chart. Pass `points` for one series or `series` for several (shared x labels).
 * Hover shows a crosshair with every series' value.
 */
export function LineChart({ points, series, max, min = 0, label, suffix = '%', height = 200, area = true, target }: {
  points?: { x: string; y: number }[]; series?: Series[]; max?: number; min?: number; label: string; suffix?: string; height?: number; area?: boolean; target?: number
}) {
  const all: Series[] = series ?? [{ name: label, points: points ?? [] }]
  const xs0 = all[0]?.points ?? []
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = height, padL = 36, padR = 12, padT = 12, padB = 26
  const top = max ?? Math.max(1, ...all.flatMap((s) => s.points.map((p) => p.y)), target ?? 0) * 1.1
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, xs0.length - 1)
  const y = (v: number) => H - padB - ((v - min) / (top - min || 1)) * (H - padT - padB)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (top - min) * f)
  const every = Math.ceil(xs0.length / 7)
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(xs0.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (xs0.length - 1))))) }}>
        <defs>{all.map((s, si) => (
          <linearGradient key={si} id={`${id}-g${si}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color ?? SERIES[si]} stopOpacity={0.18} /><stop offset="100%" stopColor={s.color ?? SERIES[si]} stopOpacity={0} /></linearGradient>
        ))}</defs>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeDasharray={t === min ? undefined : '3 4'} />
          <text x={padL - 6} y={y(t) + 3.5} fontSize="10" textAnchor="end" fill={AXIS}>{Math.round(t)}{suffix}</text></g>)}
        {target != null && <g><line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke="rgb(var(--gold-600))" strokeDasharray="6 4" /><text x={W - padR} y={y(target) - 4} fontSize="10" textAnchor="end" fill="rgb(var(--gold-700))">Target {target}{suffix}</text></g>}
        {all.map((s, si) => {
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.y)}`).join(' ')
          const c = s.color ?? SERIES[si]
          return (
            <g key={s.name}>
              {area && si === 0 && s.points.length > 1 && <path d={`${d} L${x(s.points.length - 1)},${H - padB} L${x(0)},${H - padB} Z`} fill={`url(#${id}-g${si})`} />}
              <motion.path d={d} fill="none" stroke={c} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
              {hover != null && s.points[hover] && <circle cx={x(hover)} cy={y(s.points[hover].y)} r={4} fill="white" stroke={c} strokeWidth={2} />}
            </g>
          )
        })}
        {xs0.map((p, i) => (i % every === 0 || i === xs0.length - 1) && <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill={AXIS}>{p.x.length > 7 ? p.x.slice(5) : p.x}</text>)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="rgb(var(--ink) / 0.25)" />}
      </svg>
      {hover != null && xs0[hover] && (
        <div className="pointer-events-none absolute top-1 rounded-cell border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop" style={{ left: `${Math.min(80, (x(hover) / W) * 100)}%` }}>
          <div className="mb-0.5 font-semibold text-ink">{xs0[hover].x}</div>
          {all.map((s, si) => <div key={s.name} className="flex items-center gap-1.5 text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: s.color ?? SERIES[si] }} />{s.name}: <b className="tabular text-ink">{s.points[hover]?.y}{suffix}</b></div>)}
        </div>
      )}
      {all.length > 1 && <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-ink-2">{all.map((s, si) => <span key={s.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color ?? SERIES[si] }} />{s.name}</span>)}</figcaption>}
    </figure>
  )
}

/** Vertical bars (distributions, daily counts). */
export function Bars({ data, label, unit, height = 160, highlight }: { data: [string | number, number][]; label: string; unit: string; height?: number; highlight?: (k: string | number) => boolean }) {
  const max = Math.max(1, ...data.map((d) => d[1]))
  return (
    <div role="img" aria-label={label} className="flex items-end gap-1.5" style={{ height }}>
      {data.map(([k, v]) => (
        <div key={k} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-medium tabular text-ink-2 opacity-0 transition group-hover:opacity-100">{v}</span>
          <motion.div title={`${k}${unit}: ${v}`} className={highlight?.(k) ? 'w-full rounded-t-md bg-amber/80' : 'w-full rounded-t-md bg-forest-700/80 group-hover:bg-forest-700'}
            initial={{ height: 0 }} animate={{ height: `${(v / max) * (height - 34)}px` }} transition={{ duration: 0.5 }} />
          <span className="text-[10px] text-muted">{k}{unit}</span>
        </div>
      ))}
    </div>
  )
}

/** Horizontal breakdown bars with labels and values (top SOPs, staff ranking). */
export function HBars({ data, suffix = '', max, tone = 'brand' }: { data: { label: string; value: number; hint?: string }[]; suffix?: string; max?: number; tone?: 'brand' | 'gold' }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-ink">{d.label}{d.hint && <span className="ml-2 text-xs text-muted">{d.hint}</span>}</span><span className="font-semibold tabular text-ink">{d.value}{suffix}</span></div>
          <div className="h-2 overflow-hidden rounded-pill bg-ink/[0.06]"><motion.div className={tone === 'gold' ? 'h-full rounded-pill bg-gold-500' : 'h-full rounded-pill bg-forest-700'} initial={{ width: 0 }} animate={{ width: `${(d.value / m) * 100}%` }} transition={{ duration: 0.6 }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** Donut with legend (status mix, category split). */
export function Donut({ data, label, size = 140, center }: { data: { label: string; value: number; color?: string }[]; label: string; size?: number; center?: { value: string | number; caption: string } }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const r = 42, c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label} className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--ink) / 0.06)" strokeWidth="12" />
        {data.map((d, i) => {
          const len = (d.value / total) * c, off = acc; acc += len
          return <motion.circle key={d.label} cx="50" cy="50" r={r} fill="none" stroke={d.color ?? SERIES[i % SERIES.length]} strokeWidth="12" strokeDasharray={`${len} ${c - len}`}
            initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: -off }} transition={{ duration: 0.7 }}><title>{`${d.label}: ${d.value}`}</title></motion.circle>
        })}
        {center && <g className="rotate-90" style={{ transformOrigin: '50px 50px' }}><text x="50" y="50" textAnchor="middle" fontSize="18" fontWeight="600" fill="rgb(var(--ink))">{center.value}</text><text x="50" y="63" textAnchor="middle" fontSize="8" fill={AXIS}>{center.caption}</text></g>}
      </svg>
      <ul className="min-w-[140px] space-y-1.5 text-sm">
        {data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color ?? SERIES[i % SERIES.length] }} /><span className="flex-1 text-ink-2">{d.label}</span><span className="font-semibold tabular text-ink">{d.value}</span></li>)}
      </ul>
    </div>
  )
}

/** @deprecated use StatCard from the UI kit */
export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <StatCard label={label} value={value} hint={hint} />
}

export function Gauge({ value, max, label, size = 96 }: { value: number; max: number; label: string; size?: number }) {
  const r = 34, c = 2 * Math.PI * r, f = max ? Math.min(1, value / max) : 0
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={`${label}: ${value} of ${max}`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(var(--ink) / 0.07)" strokeWidth="8" />
      <motion.circle cx="40" cy="40" r={r} fill="none" stroke={f >= 1 ? 'rgb(var(--ok))' : f >= 0.6 ? 'rgb(var(--amber))' : 'rgb(var(--danger))'} strokeWidth="8" strokeLinecap="round"
        transform="rotate(-90 40 40)" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - f) }} />
      <text x="40" y="45" textAnchor="middle" fontSize="15" fontWeight="600" fill="rgb(var(--ink))">{value}/{max}</text>
    </svg>
  )
}
