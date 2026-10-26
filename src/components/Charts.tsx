import { motion } from 'framer-motion'

/** Small, dependency-free SVG charts tuned for the dark green surface. */
export function LineChart({ points, max = 100, label, suffix = '%' }: { points: { x: string; y: number }[]; max?: number; label: string; suffix?: string }) {
  const W = 600, H = 180, pad = 28
  const xs = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, points.length - 1)
  const ys = (v: number) => H - pad - (v / max) * (H - pad * 2)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i)},${ys(p.y)}`).join(' ')
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad} x2={W - pad} y1={ys(max * f)} y2={ys(max * f)} stroke="rgb(255 255 255 / 0.08)" />
          <text x={4} y={ys(max * f) + 4} fontSize="10" fill="rgb(184 201 186)">{Math.round(max * f)}{suffix}</text></g>)}
        <motion.path d={d} fill="none" stroke="rgb(201 162 75)" strokeWidth={2.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
        {points.map((p, i) => <g key={i}><circle cx={xs(i)} cy={ys(p.y)} r={3.5} fill="rgb(201 162 75)"><title>{`${p.x}: ${p.y}${suffix}`}</title></circle>
          {(i % Math.ceil(points.length / 7) === 0 || i === points.length - 1) && <text x={xs(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="rgb(184 201 186)">{p.x.slice(5)}</text>}</g>)}
      </svg>
    </figure>
  )
}

export function Bars({ data, label, unit }: { data: [string | number, number][]; label: string; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d[1]))
  return (
    <div role="img" aria-label={label} className="flex h-40 items-end gap-1.5">
      {data.map(([k, v]) => (
        <div key={k} className="flex flex-1 flex-col items-center gap-1">
          <motion.div title={`${k}${unit}: ${v}`} className="w-full rounded-t bg-gold-500/80" initial={{ height: 0 }} animate={{ height: `${(v / max) * 120}px` }} />
          <span className="text-[10px] text-sage-300">{k}{unit}</span>
        </div>
      ))}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-sage-300">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-white">{value}</div>
      {hint && <div className="text-xs text-sage-300">{hint}</div>}
    </div>
  )
}

export function Gauge({ value, max, label }: { value: number; max: number; label: string }) {
  const r = 34, c = 2 * Math.PI * r, f = max ? Math.min(1, value / max) : 0
  return (
    <svg viewBox="0 0 80 80" className="h-24 w-24" role="img" aria-label={`${label}: ${value} of ${max}`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="8" />
      <motion.circle cx="40" cy="40" r={r} fill="none" stroke={f >= 1 ? 'rgb(92 178 120)' : 'rgb(222 160 60)'} strokeWidth="8" strokeLinecap="round"
        transform="rotate(-90 40 40)" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - f) }} />
      <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="700" fill="white">{value}/{max}</text>
    </svg>
  )
}
