// Client mirror of this property's data, kept in sync with the Cloudflare Durable Object.
// Writes run the shared domain rules locally first (instant UI), then go to the server, which is
// the authority. Writes made while the hotel connection is down wait in an outbox and replay in order.
import { create } from 'zustand'
import { api, ApiError, OfflineError, uid, wsUrl } from './api'
import { apply, DomainError, emptyState, type Action, type Actor, type State } from './domain'
import { useSession } from './session'
import { setHotelTimeZone } from './time'
import type { AttendanceMark, CoverItem, FeedbackLane, Notice, Priority, ReviewDecision, SopVersion, Task } from './types'

export { APPROVALS_REQUIRED, proposeVersion } from './domain'

interface Connection { hotel: 'online' | 'offline' | 'connecting'; checkin: 'ok' | 'attention' }
type Queued = { action: Action; at: string }

interface Store extends State {
  ready: boolean; rev: number; connection: Connection; outbox: Queued[]
  /** Last error from a rejected write, shown as a toast. */
  error: string | null
  clearError: () => void
  load: () => Promise<void>
  dispatch: (action: Action) => unknown
  /** Apply and wait for the server to accept it (throws with the server's reason if not). */
  send: (action: Action) => Promise<void>
  retryConnection: () => void

  startTask: (taskId: string) => void
  toggleStep: (taskId: string, stepId: string) => void
  attachPhoto: (taskId: string, stepId: string, file: File) => Promise<void>
  requestVerification: (taskId: string) => void
  verifyTask: (taskId: string, actorId?: string) => void
  endUrgent: (taskId: string, reason: string) => void
  markUrgentSeen: (taskId: string) => void
  reportIssue: (taskId: string, personId: string, text: string) => void
  resolveIssue: (issueId: string) => void
  checkIn: (personId: string, mark?: AttendanceMark) => void
  endShift: (personId: string, early: boolean) => void
  requestTimeOff: (shiftId: string, date: string, note: string) => void
  openRef: (personId: string, kind: 'sop' | 'notice', refId: string) => void
  acknowledge: (personId: string, kind: 'sop' | 'notice', refId: string, reply?: string) => void
  assignTask: (t: Pick<Task, 'shiftId' | 'personId' | 'roomId' | 'start' | 'end' | 'priority' | 'assignedById'> & { sopId: string }) => Task | null
  setTaskMode: (taskId: string, mode: Task['mode']) => void
  decideCover: (id: string, status: CoverItem['status']) => void
  approveBackup: (o: { shiftId: string; date: string; personId: string; backupId: string }) => void
  saveNoticeTemplate: (o: { title: string; body: string; replyNeeded: boolean }) => void
  sendNotice: (n: Omit<Notice, 'id' | 'propertyId' | 'sentAt' | 'sample'> & { sentById: string }) => void
  decideJoin: (id: string, status: 'approved' | 'declined') => void
  saveDraft: (v: SopVersion) => SopVersion
  newDraftFrom: (versionId: string | null, authorId: string, seedNote?: { feedbackId: string; text: string; stepId?: string }) => SopVersion
  deleteDraft: (versionId: string) => void
  submitForReview: (versionId: string) => boolean
  review: (versionId: string, d: Omit<ReviewDecision, 'id' | 'at'>) => void
  release: (versionId: string, actorId: string) => string | null
  addFeedback: (lane: FeedbackLane, sopVersionId: string, fromId: string, text: string, o?: { stepId?: string; rating?: number }) => void
  resolveFeedback: (id: string) => void
}

const PLACEHOLDER = emptyState({ id: '', name: '', city: '', timeZone: 'UTC', codeScheme: '', defaultTimeTargetMin: 15 })
const DATA_KEYS = Object.keys(PLACEHOLDER) as (keyof State)[]
const pick = (s: Store): State => Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])) as unknown as State

const outboxKey = () => `mise-outbox-${useSession.getState().account?.id ?? 'anon'}`
const loadOutbox = (): Queued[] => { try { return JSON.parse(localStorage.getItem(outboxKey()) ?? '[]') } catch { return [] } }
const saveOutbox = (q: Queued[]) => { try { localStorage.setItem(outboxKey(), JSON.stringify(q)) } catch { /* storage full or blocked */ } }

function actor(): Actor {
  const a = useSession.getState().account
  return { personId: a?.personId ?? '', grants: (a?.grants ?? []).map(({ portal, tier }) => ({ portal, tier })) }
}

let ws: WebSocket | null = null
let wsRetry = 0
let wsTimer: ReturnType<typeof setTimeout> | undefined
let refetchTimer: ReturnType<typeof setTimeout> | undefined
let flushing = false
let sendChain: Promise<unknown> = Promise.resolve()

export const useDB = create<Store>()((set, get) => {
  const replayOutbox = (base: State): State => {
    let s = base
    for (const q of get().outbox) { try { s = apply(s, actor(), q.action, q.at).state } catch { /* will be rejected by the server too */ } }
    return s
  }

  const refetch = async () => {
    try {
      const r = await api<{ rev: number; state: State }>('/state')
      setHotelTimeZone(r.state.property.timeZone)
      set({ ...replayOutbox(r.state), rev: r.rev, ready: true })
      if (get().connection.hotel !== 'online') set((s) => ({ connection: { ...s.connection, hotel: 'online' } }))
    } catch (e) {
      if (e instanceof OfflineError) set((s) => ({ connection: { ...s.connection, hotel: 'offline' } }))
    }
  }
  const scheduleRefetch = () => { clearTimeout(refetchTimer); refetchTimer = setTimeout(refetch, 120) }

  const flush = async () => {
    if (flushing) return
    flushing = true
    try {
      while (get().outbox.length) {
        const q = get().outbox[0]!
        try {
          await api('/action', { method: 'POST', json: { action: q.action } })
        } catch (e) {
          if (e instanceof OfflineError) return
          set({ error: e instanceof ApiError ? `A change made offline was not saved: ${e.message}` : 'A change made offline was not saved' })
        }
        const rest = get().outbox.slice(1); set({ outbox: rest }); saveOutbox(rest)
        if (q.action.type === 'checkIn') set((s) => ({ connection: { ...s.connection, checkin: 'ok' } }))
      }
      await refetch()
    } finally { flushing = false }
  }

  const connectWs = () => {
    const token = useSession.getState().token
    if (!token || typeof WebSocket === 'undefined') return
    clearTimeout(wsTimer)
    try { ws?.close() } catch { /* ignore */ }
    set((s) => ({ connection: { ...s.connection, hotel: s.connection.hotel === 'online' ? 'online' : 'connecting' } }))
    const sock = new WebSocket(wsUrl(token))
    ws = sock
    const ping = setInterval(() => { if (sock.readyState === WebSocket.OPEN) sock.send('ping') }, 25_000)
    sock.onopen = () => { wsRetry = 0; set((s) => ({ connection: { ...s.connection, hotel: 'online' } })); void flush() }
    sock.onmessage = (ev) => {
      if (ev.data === 'pong') return
      try { const m = JSON.parse(ev.data); if ((m.type === 'changed' || m.type === 'hello') && m.rev !== get().rev) scheduleRefetch() } catch { /* ignore */ }
    }
    sock.onclose = () => {
      clearInterval(ping)
      if (ws !== sock) return
      set((s) => ({ connection: { ...s.connection, hotel: 'offline' } }))
      if (!useSession.getState().token) return
      wsTimer = setTimeout(connectWs, Math.min(30_000, 1000 * 2 ** wsRetry++))
    }
  }

  const dispatch = (action: Action): unknown => {
    const at = new Date().toISOString()
    let value: unknown
    try {
      const r = apply(pick(get()), actor(), action, at)
      value = r.value
      set({ ...r.state })
    } catch (e) {
      set({ error: e instanceof DomainError ? e.message : 'That did not work' })
      return undefined
    }
    const queue = () => {
      const q = [...get().outbox, { action, at }]; set({ outbox: q }); saveOutbox(q)
      if (action.type === 'checkIn') set((s) => ({ connection: { ...s.connection, checkin: 'attention' } }))
    }
    if (get().connection.hotel !== 'online' || get().outbox.length) { queue(); void flush(); return value }
    // Sends go out one at a time so the server sees writes in the order they were made.
    sendChain = sendChain.then(() => api('/action', { method: 'POST', json: { action } }))
      .then(() => { if (action.type === 'checkIn') set((s) => ({ connection: { ...s.connection, checkin: 'ok' } })) })
      .catch((e) => {
        if (e instanceof OfflineError) { set((s) => ({ connection: { ...s.connection, hotel: 'offline' } })); queue() }
        else { set({ error: e.message }); void refetch() }
      })
    sendChain = sendChain.catch(() => {})
    return value
  }

  return {
    ...PLACEHOLDER,
    ready: false, rev: -1, connection: { hotel: 'connecting', checkin: 'ok' }, outbox: [], error: null,
    clearError: () => set({ error: null }),
    load: async () => {
      set({ outbox: loadOutbox() })
      await refetch()
      connectWs()
    },
    dispatch,
    send: async (action) => {
      apply(pick(get()), actor(), action, new Date().toISOString()) // throws the same rule the server would
      await api('/action', { method: 'POST', json: { action } })
      await refetch()
    },
    retryConnection: () => { wsRetry = 0; connectWs(); void refetch() },

    startTask: (taskId) => { dispatch({ type: 'startTask', taskId }) },
    toggleStep: (taskId, stepId) => { dispatch({ type: 'toggleStep', taskId, stepId }) },
    attachPhoto: async (taskId, stepId, file) => {
      const fd = new FormData(); fd.append('file', file)
      try {
        const { key } = await api<{ key: string }>('/photos', { method: 'POST', body: fd })
        dispatch({ type: 'attachPhoto', taskId, stepId, key })
      } catch (e) { set({ error: e instanceof OfflineError ? 'Photos need the hotel connection. Try again when it is back.' : (e as Error).message }) }
    },
    requestVerification: (taskId) => { dispatch({ type: 'requestVerification', taskId }) },
    verifyTask: (taskId) => { dispatch({ type: 'verifyTask', taskId }) },
    endUrgent: (taskId, reason) => { dispatch({ type: 'endUrgent', taskId, reason }) },
    markUrgentSeen: (taskId) => { dispatch({ type: 'markUrgentSeen', taskId }) },
    reportIssue: (taskId, _p, text) => { dispatch({ type: 'reportIssue', id: uid('iss'), taskId, text }) },
    resolveIssue: (issueId) => { dispatch({ type: 'resolveIssue', issueId }) },
    checkIn: (_p, mark) => { dispatch({ type: 'checkIn', id: uid('att'), mark }) },
    endShift: (_p, early) => { dispatch({ type: 'endShift', id: uid('cov'), early }) },
    requestTimeOff: (shiftId, date, note) => { dispatch({ type: 'requestTimeOff', id: uid('cov'), shiftId, date, note }) },
    openRef: (_p, kind, refId) => {
      const me = actor().personId
      if (get().ackEvents.some((a) => a.personId === me && a.kind === kind && a.refId === refId && a.openedAt)) return
      dispatch({ type: 'openRef', id: uid('ack'), kind, refId })
    },
    acknowledge: (_p, kind, refId, reply) => { dispatch({ type: 'acknowledge', id: uid('ack'), kind, refId, reply }) },
    assignTask: ({ assignedById: _a, ...t }) => (dispatch({ type: 'assignTask', id: uid('task'), ...t, priority: t.priority as Priority }) as Task | undefined) ?? null,
    setTaskMode: (taskId, mode) => { dispatch({ type: 'setTaskMode', taskId, mode }) },
    decideCover: (coverId, status) => { dispatch({ type: 'decideCover', coverId, status }) },
    approveBackup: (o) => { dispatch({ type: 'approveBackup', id: uid('cov'), ...o }) },
    saveNoticeTemplate: (o) => { dispatch({ type: 'saveNoticeTemplate', id: uid('ntc'), ...o }) },
    sendNotice: ({ sentById: _s, ...n }) => { dispatch({ type: 'sendNotice', id: uid('ntc'), title: n.title, body: n.body, replyNeeded: n.replyNeeded, audience: n.audience, teamShiftId: n.teamShiftId, recipientIds: n.recipientIds }) },
    decideJoin: (joinId, status) => { dispatch({ type: 'decideJoin', joinId, status, personId: status === 'approved' ? uid('person') : undefined }) },
    saveDraft: (version) => (dispatch({ type: 'saveDraft', version }) as SopVersion | undefined) ?? version,
    newDraftFrom: (versionId, _a, seedNote) => dispatch({ type: 'newDraftFrom', id: uid('ver'), sopId: uid('sop'), versionId, seedNote }) as SopVersion,
    deleteDraft: (versionId) => { dispatch({ type: 'deleteDraft', versionId }) },
    submitForReview: (versionId) => { set({ error: null }); dispatch({ type: 'submitForReview', versionId }); return get().error === null },
    review: (versionId, d) => { dispatch({ type: 'review', id: uid('rev'), versionId, decision: d.decision, comment: d.comment, stepId: d.stepId }) },
    release: (versionId) => (dispatch({ type: 'release', versionId }) as string | undefined) ?? null,
    addFeedback: (lane, sopVersionId, _f, text, o = {}) => { dispatch({ type: 'addFeedback', id: uid('fb'), lane, sopVersionId, text, ...o }) },
    resolveFeedback: (feedbackId) => { dispatch({ type: 'resolveFeedback', feedbackId }) },
  }
})

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useDB.getState().retryConnection())
  window.addEventListener('offline', () => useDB.setState((s) => ({ connection: { ...s.connection, hotel: 'offline' } })))
}

export const byId = <T extends { id: string }>(xs: T[], id?: string | null) => xs.find((x) => x.id === id)
export const priorityLabel: Record<Priority, string> = { standard: 'Standard priority', high: 'High priority', urgent: 'Urgent priority' }
