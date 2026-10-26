import { DurableObject } from 'cloudflare:workers'
import { apply, COLLECTIONS, DomainError, emptyState, viewFor, type Action, type Actor, type Collection, type State } from '../../src/lib/domain'
import type { JoinRequest, Person, Property } from '../../src/lib/types'

export interface Env {
  DB: D1Database
  HUB: DurableObjectNamespace<PropertyHub>
  PHOTOS: R2Bucket
  ALLOWED_ORIGINS: string
  PASSKEY_PEPPER: string
  SETUP_TOKEN: string
}

/**
 * One Durable Object per property: the single, strongly consistent writer for that hotel's
 * operational data. Actions run one at a time through the shared domain rules, are persisted
 * to the object's SQLite storage, and every connected device is told to refresh over WebSocket.
 */
export class PropertyHub extends DurableObject<Env> {
  private state: State | null = null
  private rev = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql
      sql.exec('CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (coll, id))')
      sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, json TEXT NOT NULL)')
      const prop = sql.exec<{ json: string }>("SELECT json FROM meta WHERE key = 'property'").toArray()[0]
      if (!prop) return
      const s = emptyState(JSON.parse(prop.json) as Property)
      for (const row of sql.exec<{ coll: string; json: string }>('SELECT coll, json FROM docs')) {
        const c = row.coll as Collection
        if (COLLECTIONS.includes(c)) (s[c] as unknown[]).push(JSON.parse(row.json))
      }
      s.audit.sort((a, b) => b.at.localeCompare(a.at))
      this.state = s
      this.rev = Number(sql.exec<{ json: string }>("SELECT json FROM meta WHERE key = 'rev'").toArray()[0]?.json ?? 0)
    })
  }

  private persist(prev: State, next: State) {
    const sql = this.ctx.storage.sql
    if (prev.property !== next.property) sql.exec("INSERT OR REPLACE INTO meta (key, json) VALUES ('property', ?)", JSON.stringify(next.property))
    for (const c of COLLECTIONS) {
      if (prev[c] === next[c]) continue
      const before = new Map((prev[c] as { id: string }[]).map((x) => [x.id, x]))
      for (const x of next[c] as { id: string }[]) {
        if (before.get(x.id) !== x) sql.exec('INSERT OR REPLACE INTO docs (coll, id, json) VALUES (?, ?, ?)', c, x.id, JSON.stringify(x))
        before.delete(x.id)
      }
      for (const id of before.keys()) sql.exec('DELETE FROM docs WHERE coll = ? AND id = ?', c, id)
    }
    this.rev++
    sql.exec("INSERT OR REPLACE INTO meta (key, json) VALUES ('rev', ?)", String(this.rev))
  }

  private broadcast() {
    const msg = JSON.stringify({ type: 'changed', rev: this.rev })
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg) } catch { /* closed */ } }
  }

  async init(property: Property, admin: Person, roles: { id: string; name: string; team: string }[]) {
    if (this.state) throw new Error('Property already initialised')
    const s = emptyState(property)
    s.jobRoles = roles.map((r) => ({ ...r, propertyId: property.id }))
    s.people = [admin]
    this.persist(emptyState(property), s)
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (key, json) VALUES ('property', ?)", JSON.stringify(property))
    this.state = s
  }

  async view(actor: Actor) {
    if (!this.state) throw new Error('Property not initialised')
    return { rev: this.rev, state: viewFor(this.state, actor) }
  }

  async act(actor: Actor, action: Action): Promise<{ ok: true; value?: unknown; rev: number } | { ok: false; error: string }> {
    if (!this.state) return { ok: false, error: 'Property not initialised' }
    const prev = this.state
    try {
      const { state, value } = apply(prev, actor, action, new Date().toISOString())
      this.persist(prev, state)
      this.state = state
      this.broadcast()
      return { ok: true, value, rev: this.rev }
    } catch (e) {
      if (e instanceof DomainError) return { ok: false, error: e.message }
      throw e
    }
  }

  async addJoinRequest(j: Omit<JoinRequest, 'propertyId' | 'status' | 'at'>) {
    if (!this.state) throw new Error('Property not initialised')
    const prev = this.state
    if (!prev.jobRoles.some((r) => r.id === j.jobRoleId) || !prev.shifts.some((s) => s.id === j.shiftId)) return { ok: false, error: 'Unknown role or shift' }
    const next = { ...prev, joinRequests: [{ ...j, propertyId: prev.property.id, status: 'pending' as const, at: new Date().toISOString() }, ...prev.joinRequests] }
    this.persist(prev, next); this.state = next; this.broadcast()
    return { ok: true }
  }

  async publicInfo() {
    if (!this.state) return null
    return { property: { id: this.state.property.id, name: this.state.property.name }, jobRoles: this.state.jobRoles.map(({ id, name }) => ({ id, name })), shifts: this.state.shifts.map(({ id, name }) => ({ id, name })) }
  }

  async personExists(personId: string) { return !!this.state?.people.some((p) => p.id === personId) }

  async canSeePhoto(actor: Actor, key: string) {
    if (!this.state) return false
    const t = this.state.tasks.find((x) => Object.values(x.photoKeys ?? {}).includes(key))
    if (!t) return actor.grants.length > 0 // just-uploaded, not yet attached: uploader only reaches it via its key
    return t.personId === actor.personId || actor.grants.some((g) => g.portal !== 'employee')
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 })
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].send(JSON.stringify({ type: 'hello', rev: this.rev }))
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (msg === 'ping') ws.send('pong')
  }
  async webSocketClose(ws: WebSocket, code: number) { try { ws.close(code, 'bye') } catch { /* already closed */ } }
}
