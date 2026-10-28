// Client mirror of this property's data. Live: kept in sync with the Cloudflare Durable Object over the API and a
// WebSocket. Demo (no API configured): the same rules run against a hotel kept in this browser (demo.ts).
// Writes run the shared domain rules locally first (instant UI), then go to the hotel, which is the authority.
// Writes made while the hotel connection is down wait in an outbox and replay in order.
import { create } from 'zustand'
import { api, ApiError, DEMO, demoPhotos, OfflineError, uid, wsUrl } from './api'
import { apply, assignBlocker as blockerFor, DomainError, emptyState, normalizeState, rosterOn, type Action, type Actor, type State } from './domain'
import { demoHub } from './demo'
import { useSession } from './session'
import { hotelDateKey, iso, setHotelTimeZone, shiftWindow } from './time'
import { toast } from './toast'
import type {
  AttendanceMark, CoverItem, FeedbackLane, Issue, IssueCategory, IssueSeverity, IssueStatus, Notice, Priority, ReviewDecision, SopVersion, Task,
} from './types'

export { APPROVALS_REQUIRED, proposeVersion } from './domain'

interface Connection { hotel: 'online' | 'offline' | 'connecting'; checkin: 'ok' | 'attention' }
/** `as`: in demo mode, the staff member who made the change (each portal acts as a different person). */
type Queued = { action: Action; at: string; as?: string }
type Assign = Pick<Task, 'shiftId' | 'personId' | 'roomId' | 'start' | 'end' | 'priority' | 'assignedById'> & { sopId: string; notes?: string }
type Result = { ok: true; value: unknown } | { ok: false; error: string }

interface Store extends State {
  /** 'demo' runs on this browser's own copy of the hotel; 'live' on the Cloudflare server. */
  mode: 'demo' | 'live'
  ready: boolean; rev: number; connection: Connection; outbox: Queued[]
  /** Last error from a rejected write. */
  error: string | null
  clearError: () => void
  load: () => Promise<void>
  /** Apply locally, then send. `as` names the acting person in demo mode (ignored live: the server knows who you are). */
  dispatch: (action: Action, as?: string, opts?: { quiet?: boolean }) => Result
  /** Apply and wait for the hotel to accept it (throws with the reason if not). */
  send: (action: Action) => Promise<void>
  /** Reconnect and resend anything queued. Resolves once the hotel has answered (or not). */
  retryConnection: () => Promise<void>
  /** Demo controls: simulate the hotel system or the check-in service failing. Live: reconnects. */
  setConnection: (c: Partial<Connection>) => void
  flushOutbox: () => Promise<void>
  /** Demo only: start the shared demo hotel again from today's sample data. */
  reset: () => void
  log: (actorId: string, event: string, detail: string) => void

  startTask: (taskId: string) => void
  toggleStep: (taskId: string, stepId: string) => void
  attachPhoto: (taskId: string, stepId: string, file?: File) => Promise<void>
  requestVerification: (taskId: string) => void
  verifyTask: (taskId: string, actorId?: string) => boolean
  returnTask: (taskId: string, actorId: string, note: string) => boolean
  cancelTask: (taskId: string, actorId: string, reason: string) => boolean
  reassignTask: (taskId: string, personId: string, actorId: string) => boolean
  setTaskPriority: (taskId: string, priority: Priority, actorId: string) => boolean
  endUrgent: (taskId: string, reason: string) => void
  markUrgentSeen: (taskId: string) => void
  reportIssue: (taskId: string | null, personId: string, text: string, o?: { category?: IssueCategory; severity?: IssueSeverity; title?: string; roomId?: string }) => Issue | null
  updateIssue: (id: string, actorId: string, patch: { status?: IssueStatus; assignedToId?: string | null; note?: string; severity?: IssueSeverity }) => boolean
  resolveIssue: (issueId: string) => void
  checkIn: (personId: string, mark?: AttendanceMark) => void
  endShift: (personId: string, early: boolean) => void
  requestTimeOff: (shiftId: string, date: string, note: string) => void
  openRef: (personId: string, kind: 'sop' | 'notice', refId: string) => void
  acknowledge: (personId: string, kind: 'sop' | 'notice', refId: string, reply?: string) => void

  assignTask: (t: Assign) => Task | null
  /** Why a room can't take this assignment right now, or null when it can. */
  assignBlocker: (t: { sopId: string; roomId: string; shiftId: string; start: string; end?: string }) => string | null
  bulkAssign: (items: Assign[]) => { created: Task[]; skipped: { roomId: string; reason: string }[] }
  setTaskMode: (taskId: string, mode: Task['mode']) => void
  decideCover: (id: string, status: CoverItem['status']) => boolean
  approveBackup: (o: { shiftId: string; date: string; personId: string; backupId: string; actorId?: string; coverId?: string }) => boolean
  saveNoticeTemplate: (o: { title: string; body: string; replyNeeded: boolean }) => void
  sendNotice: (n: Omit<Notice, 'id' | 'propertyId' | 'sentAt' | 'sample'> & { sentById: string }) => boolean
  decideJoin: (id: string, status: 'approved' | 'declined') => boolean

  saveDraft: (v: SopVersion, o?: { department?: string; created?: boolean }) => SopVersion
  newDraftFrom: (versionId: string | null, authorId: string, seedNote?: { feedbackId: string; text: string; stepId?: string }, sopId?: string) => SopVersion | null
  deleteDraft: (versionId: string) => boolean
  submitForReview: (versionId: string) => boolean
  review: (versionId: string, d: Omit<ReviewDecision, 'id' | 'at'>) => boolean
  release: (versionId: string, actorId: string) => string | null
  retireSop: (sopId: string, actorId: string) => void
  restoreSop: (sopId: string, actorId: string) => void
  addFeedback: (lane: FeedbackLane, sopVersionId: string, fromId: string, text: string, o?: { stepId?: string; rating?: number }) => void
  resolveFeedback: (id: string, reopen?: boolean) => void
}
export type DB = Store

const PLACEHOLDER = emptyState({ id: '', name: '', city: '', timeZone: 'Asia/Colombo', codeScheme: '', defaultTimeTargetMin: 15 })

const outboxKey = () => `mise-outbox-${DEMO ? 'demo' : useSession.getState().account?.id ?? 'anon'}`
const loadOutbox = (): Queued[] => { try { return JSON.parse(localStorage.getItem(outboxKey()) ?? '[]') } catch { return [] } }
const saveOutbox = (q: Queued[]) => { try { localStorage.setItem(outboxKey(), JSON.stringify(q)) } catch { /* storage full or blocked */ } }

/** Who is acting. Live: the signed-in person. Demo: the person this portal is shown as (or `as`), with the demo tier. */
function actor(as?: string): Actor {
  const s = useSession.getState()
  const grants = s.account?.grants ?? []
  if (!DEMO) return { personId: s.account?.personId ?? '', grants: grants.map(({ portal, tier }) => ({ portal, tier })) }
  const portal = s.portal ?? 'employee'
  const mine = grants.find((g) => g.portal === portal)?.personId
  const personId = as ?? (portal === 'employee' ? s.demoEmployeeId ?? mine : mine) ?? ''
  return { personId, grants: grants.map(({ portal: p, tier }) => ({ portal: p, tier: p === 'employee' ? tier : s.demoTier ?? tier })) }
}

/**
 * Screens get each shift as its concrete instance for the current hotel day (ISO start/end), with memberIds being who is
 * on it that day (approved backups swapped in). The stored recurring times and standing roster ride along for editing.
 */
function materialize(s: State, now = Date.now()): State {
  return {
    ...s,
    shifts: s.shifts.map((sh) => {
      const w = shiftWindow(sh, now)
      return { ...sh, start: iso(w.start), end: iso(w.end), startTime: sh.start, endTime: sh.end, rosterIds: sh.memberIds, memberIds: rosterOn(s, sh.id, hotelDateKey(w.start)) }
    }),
  }
}

// ── Transports: where the authoritative copy lives ─────────────────────────────
interface Transport {
  fetch: () => Promise<{ rev: number; state: State }>
  act: (action: Action, as?: string) => Promise<unknown>
  connect: (on: { changed: (rev: number) => void; status: (h: Connection['hotel']) => void }) => void
}

let ws: WebSocket | null = null
let wsRetry = 0
let wsTimer: ReturnType<typeof setTimeout> | undefined

const live: Transport = {
  fetch: () => api<{ rev: number; state: State }>('/state'),
  act: async (action) => (await api<{ value?: unknown }>('/action', { method: 'POST', json: { action } })).value,
  connect: (on) => {
    const token = useSession.getState().token
    if (!token || typeof WebSocket === 'undefined') return
    clearTimeout(wsTimer)
    try { ws?.close() } catch { /* ignore */ }
    on.status('connecting')
    const sock = new WebSocket(wsUrl(token))
    ws = sock
    const ping = setInterval(() => { if (sock.readyState === WebSocket.OPEN) sock.send('ping') }, 25_000)
    sock.onopen = () => { wsRetry = 0; on.status('online') }
    sock.onmessage = (ev) => {
      if (ev.data === 'pong') return
      try { const m = JSON.parse(ev.data); if (m.type === 'changed' || m.type === 'hello') on.changed(m.rev) } catch { /* ignore */ }
    }
    sock.onclose = () => {
      clearInterval(ping)
      if (ws !== sock) return
      on.status('offline')
      if (!useSession.getState().token) return
      wsTimer = setTimeout(() => live.connect(on), Math.min(30_000, 1000 * 2 ** wsRetry++))
    }
  },
}

/** Demo failure simulation (Connection details → demo controls). */
const sim = { hotelDown: false, checkinDown: false }
const demoOffline = () => sim.hotelDown || (typeof navigator !== 'undefined' && navigator.onLine === false)
let demoUnsub: (() => void) | undefined

const demo: Transport = {
  fetch: async () => { if (demoOffline()) throw new OfflineError('Hotel system offline'); return demoHub.read() },
  act: async (action, as) => {
    if (demoOffline() || (sim.checkinDown && action.type === 'checkIn')) throw new OfflineError('Hotel system offline')
    try { return demoHub.act(actor(as), action) } catch (e) { throw e instanceof DomainError ? new ApiError(e.message, 422) : e }
  },
  connect: (on) => {
    demoUnsub?.()
    demoUnsub = demoHub.subscribe(on.changed)
    on.status(demoOffline() ? 'offline' : 'online')
  },
}
const transport = DEMO ? demo : live

let refetchTimer: ReturnType<typeof setTimeout> | undefined
let tick: ReturnType<typeof setInterval> | undefined
let flushing = false
let sendChain: Promise<unknown> = Promise.resolve()
/** The authoritative copy plus this device's unsent changes, exactly as the domain rules see it (stored shift times). */
let raw: State = PLACEHOLDER

export const useDB = create<Store>()((set, get) => {
  const expose = (s: State) => { raw = s; set(materialize(s)) }
  const setHotel = (hotel: Connection['hotel']) => { if (get().connection.hotel !== hotel) set((s) => ({ connection: { ...s.connection, hotel } })) }
  const replayOutbox = (base: State): State => {
    let s = base
    for (const q of get().outbox) { try { s = apply(s, actor(q.as), q.action, q.at).state } catch { /* will be rejected by the server too */ } }
    return s
  }
  const reportError = (msg: string) => { set({ error: msg }); toast.error(msg) }

  const refetch = async () => {
    try {
      const r = await transport.fetch()
      setHotelTimeZone(r.state.property.timeZone)
      expose(replayOutbox(normalizeState(r.state)))
      set({ rev: r.rev, ready: true })
      setHotel('online')
    } catch (e) {
      if (e instanceof OfflineError) setHotel('offline')
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
          await transport.act(q.action, q.as)
        } catch (e) {
          if (e instanceof OfflineError) return
          reportError(e instanceof ApiError ? `A change made offline was not saved: ${e.message}` : 'A change made offline was not saved')
        }
        const rest = get().outbox.slice(1); set({ outbox: rest }); saveOutbox(rest)
        if (q.action.type === 'checkIn') set((s) => ({ connection: { ...s.connection, checkin: 'ok' } }))
      }
      await refetch()
    } finally { flushing = false }
  }

  const connect = () => transport.connect({
    changed: (rev) => { if (rev !== get().rev) scheduleRefetch() },
    status: (h) => { setHotel(h); if (h === 'online') void flush() },
  })

  const dispatch: Store['dispatch'] = (action, as, opts = {}) => {
    const at = new Date().toISOString()
    let value: unknown
    try {
      const r = apply(raw, actor(as), action, at)
      value = r.value
      expose(r.state)
    } catch (e) {
      const error = e instanceof DomainError ? e.message : 'That did not work'
      if (!opts.quiet) reportError(error)
      return { ok: false, error }
    }
    const queue = () => {
      const q = [...get().outbox, { action, at, as }]; set({ outbox: q }); saveOutbox(q)
      if (action.type === 'checkIn') set((s) => ({ connection: { ...s.connection, checkin: 'attention' } }))
    }
    if (get().connection.hotel !== 'online' || get().outbox.length) { queue(); void flush(); return { ok: true, value } }
    // Sends go out one at a time so the hotel sees writes in the order they were made.
    sendChain = sendChain.then(() => transport.act(action, as))
      .then(() => { if (action.type === 'checkIn') set((s) => ({ connection: { ...s.connection, checkin: 'ok' } })) })
      .catch((e) => {
        if (e instanceof OfflineError) { if (!(DEMO && sim.checkinDown && !sim.hotelDown)) setHotel('offline'); queue() }
        else { reportError(e.message); void refetch() }
      })
    sendChain = sendChain.catch(() => {})
    return { ok: true, value }
  }
  const run = (action: Action, as?: string) => dispatch(action, as).ok
  const quiet = (action: Action, as?: string) => dispatch(action, as, { quiet: true }).ok
  const valueOf = <T,>(r: Result) => (r.ok ? (r.value as T) : null)

  return {
    ...materialize(PLACEHOLDER),
    mode: DEMO ? 'demo' : 'live',
    ready: false, rev: -1, connection: { hotel: 'connecting', checkin: 'ok' }, outbox: [], error: null,
    clearError: () => set({ error: null }),
    load: async () => {
      set({ outbox: loadOutbox() })
      await refetch()
      connect()
      // Keep "today's" shift instances current as the hotel day moves on.
      clearInterval(tick); tick = setInterval(() => { if (get().ready) set(materialize(raw)) }, 60_000)
    },
    dispatch,
    send: async (action) => {
      apply(raw, actor(), action, new Date().toISOString()) // throws the same rule the server would
      await transport.act(action)
      await refetch()
    },
    retryConnection: async () => {
      if (DEMO) sim.hotelDown = false
      wsRetry = 0; connect(); await refetch(); await flush()
    },
    setConnection: (c) => {
      if (DEMO) {
        if (c.hotel) sim.hotelDown = c.hotel === 'offline'
        if (c.checkin) sim.checkinDown = c.checkin === 'attention'
        if (demoOffline()) setHotel('offline')
        if (c.checkin === 'attention') set((s) => ({ connection: { ...s.connection, checkin: 'attention' } }))
        if (!demoOffline()) { setHotel('online'); void flush() }
        return
      }
      if (c.hotel === 'online') get().retryConnection()
    },
    flushOutbox: () => flush(),
    reset: () => {
      if (!DEMO) return
      sim.hotelDown = false; sim.checkinDown = false
      set({ outbox: [], connection: { hotel: 'online', checkin: 'ok' } }); saveOutbox([])
      demoHub.reset()
      void refetch()
    },
    log: (actorId, event, detail) => { quiet({ type: 'logEvent', event, detail: detail.slice(0, 300) }, actorId) },

    startTask: (taskId) => { run({ type: 'startTask', taskId }) },
    toggleStep: (taskId, stepId) => { run({ type: 'toggleStep', taskId, stepId }) },
    attachPhoto: async (taskId, stepId, file) => {
      if (DEMO) {
        const key = `${raw.property.id}/${uid('photo')}`
        if (file) demoPhotos.set(key, URL.createObjectURL(file))
        run({ type: 'attachPhoto', taskId, stepId, key })
        return
      }
      if (!file) return
      const fd = new FormData(); fd.append('file', file)
      try {
        const { key } = await api<{ key: string }>('/photos', { method: 'POST', body: fd })
        run({ type: 'attachPhoto', taskId, stepId, key })
      } catch (e) { reportError(e instanceof OfflineError ? 'Photos need the hotel connection. Try again when it is back.' : (e as Error).message) }
    },
    requestVerification: (taskId) => { run({ type: 'requestVerification', taskId }) },
    verifyTask: (taskId, actorId) => run({ type: 'verifyTask', taskId }, actorId),
    returnTask: (taskId, actorId, note) => quiet({ type: 'returnTask', taskId, note }, actorId),
    cancelTask: (taskId, actorId, reason) => quiet({ type: 'cancelTask', taskId, reason }, actorId),
    reassignTask: (taskId, personId, actorId) => quiet({ type: 'reassignTask', taskId, personId }, actorId),
    setTaskPriority: (taskId, priority, actorId) => quiet({ type: 'setTaskPriority', taskId, priority }, actorId),
    endUrgent: (taskId, reason) => { run({ type: 'endUrgent', taskId, reason }) },
    markUrgentSeen: (taskId) => { run({ type: 'markUrgentSeen', taskId }) },
    reportIssue: (taskId, personId, text, o = {}) => valueOf<Issue>(dispatch({ type: 'reportIssue', id: uid('iss'), taskId, text, ...o }, personId)),
    updateIssue: (issueId, actorId, patch) => run({ type: 'updateIssue', issueId, ...patch }, actorId),
    resolveIssue: (issueId) => { run({ type: 'resolveIssue', issueId }) },
    checkIn: (personId, mark) => { run({ type: 'checkIn', id: uid('att'), mark }, personId) },
    endShift: (personId, early) => { run({ type: 'endShift', id: uid('cov'), early }, personId) },
    requestTimeOff: (shiftId, date, note) => { run({ type: 'requestTimeOff', id: uid('cov'), shiftId, date, note }) },
    openRef: (personId, kind, refId) => {
      const me = actor(personId).personId
      if (get().ackEvents.some((a) => a.personId === me && a.kind === kind && a.refId === refId && a.openedAt)) return
      quiet({ type: 'openRef', id: uid('ack'), kind, refId }, personId)
    },
    acknowledge: (personId, kind, refId, reply) => { run({ type: 'acknowledge', id: uid('ack'), kind, refId, reply }, personId) },

    assignBlocker: (t) => blockerFor(raw, t),
    assignTask: ({ assignedById, sopId, ...t }) =>
      valueOf<Task>(dispatch({ type: 'assignTask', id: uid('task'), sopId, shiftId: t.shiftId, personId: t.personId, roomId: t.roomId, start: t.start, end: t.end, priority: t.priority, notes: t.notes }, assignedById)),
    bulkAssign: (items) => {
      const created: Task[] = [], skipped: { roomId: string; reason: string }[] = []
      for (const { assignedById, sopId, ...t } of items) {
        const r = dispatch({ type: 'assignTask', id: uid('task'), sopId, shiftId: t.shiftId, personId: t.personId, roomId: t.roomId, start: t.start, end: t.end, priority: t.priority, notes: t.notes }, assignedById, { quiet: true })
        if (r.ok) created.push(r.value as Task); else skipped.push({ roomId: t.roomId, reason: r.error })
      }
      return { created, skipped }
    },
    setTaskMode: (taskId, mode) => { run({ type: 'setTaskMode', taskId, mode }) },
    decideCover: (coverId, status) => quiet({ type: 'decideCover', coverId, status }),
    approveBackup: ({ actorId, ...o }) => run({ type: 'approveBackup', id: uid('cov'), ...o }, actorId),
    saveNoticeTemplate: (o) => { run({ type: 'saveNoticeTemplate', id: uid('ntc'), ...o }) },
    sendNotice: ({ sentById, ...n }) => run({ type: 'sendNotice', id: uid('ntc'), title: n.title, body: n.body, replyNeeded: n.replyNeeded, audience: n.audience, teamShiftId: n.teamShiftId,
      recipientIds: n.recipientIds, priority: n.priority, expiresAt: n.expiresAt }, sentById),
    decideJoin: (joinId, status) => quiet({ type: 'decideJoin', joinId, status, personId: status === 'approved' ? uid('person') : undefined }),

    saveDraft: (version, o = {}) => valueOf<SopVersion>(dispatch({ type: 'saveDraft', version, department: o.department, created: o.created }, version.authorId)) ?? version,
    newDraftFrom: (versionId, authorId, seedNote, sopId) => valueOf<SopVersion>(dispatch({ type: 'newDraftFrom', id: uid('ver'), sopId: sopId ?? uid('sop'), versionId, seedNote }, authorId)),
    deleteDraft: (versionId) => run({ type: 'deleteDraft', versionId }, raw.sopVersions.find((v) => v.id === versionId)?.authorId),
    submitForReview: (versionId) => run({ type: 'submitForReview', versionId }, raw.sopVersions.find((v) => v.id === versionId)?.authorId),
    review: (versionId, d) => run({ type: 'review', id: uid('rev'), versionId, decision: d.decision, comment: d.comment, stepId: d.stepId }, d.reviewerId),
    release: (versionId, actorId) => valueOf<string>(dispatch({ type: 'release', versionId }, actorId)),
    retireSop: (sopId, actorId) => { run({ type: 'retireSop', sopId }, actorId) },
    restoreSop: (sopId, actorId) => { run({ type: 'restoreSop', sopId }, actorId) },
    addFeedback: (lane, sopVersionId, fromId, text, o = {}) => { run({ type: 'addFeedback', id: uid('fb'), lane, sopVersionId, text, ...o }, fromId) },
    resolveFeedback: (feedbackId, reopen) => { run({ type: 'resolveFeedback', feedbackId, reopen }) },
  }
})

// A different sign-in (or signing out) must never show the previous person's data, even for a moment.
useSession.subscribe((s, prev) => {
  if (s.token === prev.token) return
  clearTimeout(wsTimer); clearTimeout(refetchTimer); clearInterval(tick)
  const sock = ws; ws = null; try { sock?.close() } catch { /* ignore */ }
  demoUnsub?.(); demoUnsub = undefined
  raw = PLACEHOLDER
  useDB.setState({ ...materialize(PLACEHOLDER), ready: false, rev: -1, outbox: [], error: null, connection: { hotel: 'connecting', checkin: 'ok' } })
})

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void useDB.getState().retryConnection())
  window.addEventListener('offline', () => useDB.setState((s) => ({ connection: { ...s.connection, hotel: 'offline' } })))
}

export const byId = <T extends { id: string }>(xs: T[], id?: string | null) => xs.find((x) => x.id === id)
export const priorityLabel: Record<Priority, string> = { standard: 'Standard priority', high: 'High priority', urgent: 'Urgent priority' }
