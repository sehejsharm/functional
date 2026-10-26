import { useEffect, useState } from 'react'

/** Re-renders on an interval so time-gated states ("Do not enter yet") open on their own. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

/** Brief skeleton on first mount so data-loading states are designed, not flashed. */
export function useFirstLoad(ms = 350) {
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), ms); return () => clearTimeout(t) }, [ms])
  return loading
}
