import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { Bell, CheckCheck, ChevronDown, ChevronRight, ChevronsUpDown, HelpCircle, LogOut, Menu as MenuIcon, Search, SlidersHorizontal, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Count, Drawer, IconButton, Kbd, Logo, Menu } from '@/components/ui'
import { useCrumbStore } from '@/lib/crumbs'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { useNotifications, type AppNotification } from '@/lib/notifications'
import { canAccess, tierLabel } from '@/lib/permissions'
import { useGrant, useGrants, useSession } from '@/lib/session'
import { fTime, hotelDateKey } from '@/lib/time'
import type { Portal, Tier } from '@/lib/types'
import { confirm, toast } from '@/lib/toast'
import { CommandPalette } from './CommandPalette'
import { HelpDrawer } from './HelpDrawer'
import { LockIcon, NAV, PORTAL_CONTEXT, PORTAL_LABEL, navFor, type CountKey, type NavItem } from './nav'
import { RouteBoundary } from './RouteBoundary'

export function usePersona(portal: Portal) {
  const grant = useGrant(portal)
  const people = useDB((s) => s.people)
  return { grant, person: byId(people, grant?.personId) }
}

function useCounts(portal: Portal): Record<CountKey, number> {
  const { person } = usePersona(portal)
  const s = useDB()
  return useMemo(() => {
    const today = hotelDateKey()
    const pid = person?.id
    return {
      cover: s.cover.filter((c) => c.status === 'pending').length,
      reviews: s.sopVersions.filter((v) => v.status === 'in_review' || v.status === 'changes_requested').length,
      feedback: s.feedback.filter((f) => f.status === 'open' && f.lane !== 'rating').length,
      join: s.joinRequests.filter((j) => j.status === 'pending').length,
      incidents: s.issues.filter((i) => i.status !== 'resolved').length,
      verify: s.tasks.filter((t) => t.status === 'awaiting_verification').length,
      myRooms: s.tasks.filter((t) => t.personId === pid && hotelDateKey(t.start) === today && (t.status === 'scheduled' || t.status === 'in_progress')).length,
      notices: s.notices.filter((n) => n.sentAt && pid && n.recipientIds.includes(pid) && !s.ackEvents.some((a) => a.personId === pid && a.refId === n.id && a.acknowledgedAt)).length,
    }
  }, [s, person?.id])
}

export function PortalSwitcher({ current }: { current: Portal }) {
  const grants = useGrants()
  const people = useDB((s) => s.people)
  const setSwitching = useSession((s) => s.setSwitching)
  const setPortal = useSession((s) => s.setPortal)
  const nav = useNavigate()
  if (grants.length < 2) return null
  const go = (p: Portal) => {
    const g = grants.find((x) => x.portal === p)
    if (!g || p === current) return
    setSwitching(byId(people, g.personId)?.name ?? p)
    setTimeout(() => { setPortal(p); nav(`/${p}`) }, 450)
    setTimeout(() => setSwitching(null), 1000)
  }
  return (
    <div role="group" aria-label="Switch portal" className="grid grid-cols-3 gap-0.5 rounded-cell bg-white/[0.06] p-0.5">
      {(['employee', 'manager', 'author'] as Portal[]).filter((p) => grants.some((g) => g.portal === p)).map((p) => (
        <button key={p} type="button" aria-pressed={p === current} onClick={() => go(p)}
          className={clsx('relative rounded-[7px] px-2 py-1.5 text-xs font-semibold transition-colors', p === current ? 'text-forest-950' : 'text-sage-300 hover:text-white')}>
          {p === current && <span aria-hidden className="absolute inset-0 rounded-[7px] bg-gold-500" />}
          <span className="relative">{PORTAL_LABEL[p]}</span>
        </button>
      ))}
    </div>
  )
}

export function SwitchingOverlay() {
  const name = useSession((s) => s.switching)
  return (
    <AnimatePresence>
      {name && (
        <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-canvas/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} className="card flex flex-col items-center gap-4 px-10 py-8 shadow-lift">
            <Logo size={40} wordmark={false} />
            <div className="text-lg font-semibold text-ink">Opening workspace for {name}…</div>
            <div className="h-1 w-40 overflow-hidden rounded-pill bg-ink/10">
              <motion.div className="h-full bg-forest-700" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.8 }} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Connection status and the demo's simulated failure states. */
export function ConnectionChip({ compact }: { compact?: boolean }) {
  const conn = useDB((s) => s.connection)
  const outbox = useDB((s) => s.outbox.length)
  const setConnection = useDB((s) => s.setConnection)
  const [open, setOpen] = useState(false)
  const offline = conn.hotel === 'offline'
  return (
    <>
      <button onClick={() => setOpen(true)} className={clsx('flex w-full items-center gap-2 rounded-cell px-2.5 py-2 text-left text-xs transition', compact ? 'text-ink-2 hover:bg-ink/5' : 'text-sage-300 hover:bg-white/5 hover:text-white')}>
        <span className="relative flex h-2 w-2">{!offline && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />}<span className={clsx('relative inline-flex h-2 w-2 rounded-full', offline ? 'bg-danger' : 'bg-ok')} /></span>
        <span className="flex-1">{offline ? 'Offline · changes queued' : 'All systems live'}</span>
        {outbox > 0 && <Badge tone="warning">{outbox} queued</Badge>}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="System status" description="Live connection to the hotel system and the check-in service.">
        <div className="space-y-3">
          {([['Hotel system', offline ? 'Offline' : 'Connected', offline], ['Check-in service', conn.checkin === 'ok' ? 'Confirmed' : 'Needs attention', conn.checkin !== 'ok'], ['Changes waiting to sync', String(outbox), outbox > 0]] as const).map(([k, v, bad]) => (
            <div key={k} className="flex items-center justify-between rounded-cell border border-line px-3 py-2.5 text-sm">
              <span className="text-ink-2">{k}</span><Badge tone={bad ? 'warning' : 'success'} dot>{v}</Badge>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-card border border-dashed border-line-strong p-4">
          <div className="text-sm font-semibold text-ink">Demo controls</div>
          <p className="mt-1 text-xs text-muted">Simulate the two independent failure states. Step ticks made offline queue and clear on reconnect.</p>
          <div className="mt-3 grid gap-2">
            <Button variant="secondary" icon={offline ? Wifi : WifiOff} onClick={() => setConnection({ hotel: offline ? 'online' : 'offline' })}>{offline ? 'Restore hotel connection' : 'Drop hotel connection'}</Button>
            <Button variant="secondary" onClick={() => setConnection({ checkin: conn.checkin === 'ok' ? 'attention' : 'ok' })}>{conn.checkin === 'ok' ? 'Fail check-in confirmation' : 'Confirm check-in service'}</Button>
          </div>
        </div>
      </Drawer>
    </>
  )
}

function DemoControls({ portal }: { portal: Portal }) {
  const demoTier = useSession((s) => s.demoTier)
  const setDemoTier = useSession((s) => s.setDemoTier)
  const demoEmployeeId = useSession((s) => s.demoEmployeeId)
  const setDemoEmployee = useSession((s) => s.setDemoEmployee)
  const grant = useGrants().find((g) => g.portal === 'employee')
  const people = useDB((s) => s.people)
  const roles = useDB((s) => s.jobRoles)
  const shifts = useDB((s) => s.shifts)
  const reset = useDB((s) => s.reset)
  const [open, setOpen] = useState(false)
  const staff = people.filter((p) => shifts.some((s) => s.memberIds.includes(p.id)))
  const onReset = async () => {
    if (await confirm({ title: 'Reset demo data?', body: 'Every portal goes back to today’s starting point. Anything created in this browser is removed.', confirmLabel: 'Reset data', tone: 'danger' })) {
      reset(); toast.success('Demo data reset')
    }
  }
  return (
    <div className="rounded-cell border border-white/10 bg-white/[0.03]">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-2 text-xs font-medium text-sage-300 hover:text-white">
        <SlidersHorizontal size={13} className="shrink-0" /> <span className="flex-1 whitespace-nowrap text-left">Demo</span>
        <span className="min-w-0 max-w-[110px] truncate text-2xs text-sage-300/80">{portal === 'employee' ? byId(people, demoEmployeeId ?? grant?.personId)?.name.split(' ')[0] : tierLabel[demoTier ?? 'base']}</span>
        <ChevronDown size={13} className={clsx('transition', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2.5 px-2.5 pb-2.5">
              {portal === 'employee' ? (
                <label className="block text-2xs text-sage-300">Viewing as
                  <select className="mt-1 w-full rounded-md border border-white/10 bg-forest-900 px-2 py-1.5 text-xs text-white" value={demoEmployeeId ?? grant?.personId ?? ''}
                    onChange={(e) => setDemoEmployee(e.target.value === grant?.personId ? null : e.target.value)}>
                    {staff.map((p) => <option key={p.id} value={p.id}>{p.name} · {byId(roles, p.jobRoleId)?.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="block text-2xs text-sage-300">Access tier
                  <select className="mt-1 w-full rounded-md border border-white/10 bg-forest-900 px-2 py-1.5 text-xs text-white" value={demoTier ?? ''} onChange={(e) => setDemoTier((e.target.value || null) as Tier | null)}>
                    <option value="">{tierLabel.base} (as granted)</option>
                    <option value="senior">{tierLabel.senior}</option>
                    <option value="admin">{tierLabel.admin}</option>
                  </select>
                </label>
              )}
              <button className="text-2xs font-medium text-gold-400 hover:underline" onClick={onReset}>Reset demo data</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NavRow({ item, locked, count, onNavigate }: { item: NavItem; locked: boolean; count: number; onNavigate?: () => void }) {
  const I = item.icon
  return (
    <li>
      <NavLink to={item.to} end={item.to.split('/').length <= 2} onClick={onNavigate}
        className={({ isActive }) => clsx('group relative flex items-center gap-3 rounded-cell px-2.5 py-1.5 text-[13px] font-medium transition-colors',
          isActive ? 'bg-white/[0.09] text-white' : 'text-sage-300 hover:bg-white/[0.05] hover:text-white')}>
        {({ isActive }) => (<>
          {isActive && <span aria-hidden className="absolute inset-y-1.5 -left-3 w-[3px] rounded-r-pill bg-gold-500" />}
          <I size={16} className={clsx('shrink-0', isActive ? 'text-gold-400' : 'text-sage-300/80 group-hover:text-white')} />
          <span className="flex-1 truncate">{item.label}</span>
          {locked && <LockIcon size={12} className="text-sage-300/60" aria-label="Locked" />}
          {!locked && count > 0 && <Count n={count} tone={item.count === 'incidents' || item.count === 'verify' ? 'danger' : 'gold'} />}
        </>)}
      </NavLink>
    </li>
  )
}

const COLLAPSE_KEY = 'mise-nav-collapsed'
function readCollapsed(): string[] { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') } catch { return [] } }

function NavList({ portal, onNavigate }: { portal: Portal; onNavigate?: () => void }) {
  const counts = useCounts(portal)
  const { grant } = usePersona(portal)
  const loc = useLocation()
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const groups = NAV[portal].reduce<Record<string, NavItem[]>>((acc, i) => { (acc[i.group ?? ''] ??= []).push(i); return acc }, {})
  const toggle = (key: string) => setCollapsed((c) => { const n = c.includes(key) ? c.filter((x) => x !== key) : [...c, key]; try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(n)) } catch { /* private mode */ } return n })
  return (
    <nav aria-label={`${PORTAL_LABEL[portal]} navigation`} className="space-y-4">
      {Object.entries(groups).map(([g, items]) => {
        const key = `${portal}:${g}`
        // A group holding the current screen always stays open.
        const open = !g || !collapsed.includes(key) || items.some((i) => loc.pathname.startsWith(i.to))
        const waiting = items.reduce((n, i) => n + (i.count ? counts[i.count] : 0), 0)
        return (
          <div key={g}>
            {g && (
              <button type="button" onClick={() => toggle(key)} aria-expanded={open}
                className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-sage-300/85 hover:text-white">
                <span className="flex-1 text-left">{g}</span>
                {!open && waiting > 0 && <Count n={waiting} tone="neutral" />}
                <ChevronDown size={12} className={clsx('transition', !open && '-rotate-90')} />
              </button>
            )}
            {open && <ul className="space-y-0.5">{items.map((i) => <NavRow key={i.to} item={i} locked={!!i.need && !canAccess(grant?.tier, i.need)} count={i.count ? counts[i.count] : 0} onNavigate={onNavigate} />)}</ul>}
          </div>
        )
      })}
    </nav>
  )
}

function Sidebar({ portal, onNavigate }: { portal: Portal; onNavigate?: () => void }) {
  const { person, grant } = usePersona(portal)
  const property = useDB((s) => s.properties.find((p) => p.id === grant?.propertyId))
  const signOut = useSession((s) => s.signOut)
  const nav = useNavigate()
  return (
    <div className="sidebar-surface flex h-full flex-col text-sage-50">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Logo size={32} wordmark={false} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{property?.name}</div>
          <div className="truncate text-2xs text-sage-300">{PORTAL_CONTEXT[portal]} · {property?.city}</div>
        </div>
      </div>
      <div className="px-3 pb-3"><PortalSwitcher current={portal} /></div>
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto px-3 pb-6"><NavList portal={portal} onNavigate={onNavigate} /></div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-forest-950 to-transparent" />
      </div>
      <div className="space-y-1.5 border-t border-white/[0.07] px-3 py-2.5">
        <DemoControls portal={portal} />
        <ConnectionChip />
        {person && (
          <Menu align="start" width={232} label="Account menu" block trigger={({ toggle }) => (
            <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-cell px-2 py-2 text-left hover:bg-white/[0.06]">
              <Avatar name={person.name} size={32} tone="gold" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{person.name}</span><span className="block truncate text-2xs text-sage-300">{person.title}</span></span>
              <ChevronsUpDown size={14} className="text-sage-300/60" />
            </button>
          )} items={[
            { heading: person.email ?? person.name },
            { label: 'Help & shortcuts', icon: HelpCircle, onClick: () => window.dispatchEvent(new CustomEvent('mise:help')) },
            'separator',
            { label: 'Sign out of shared demo', icon: LogOut, danger: true, onClick: () => { signOut(); nav('/') } },
          ]} />
        )}
      </div>
    </div>
  )
}

function Breadcrumbs({ portal }: { portal: Portal }) {
  const loc = useLocation()
  const detail = useCrumbStore((s) => s.label)
  const item = navFor(portal, loc.pathname)
  const isDetail = !!item && loc.pathname !== item.to
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link to={`/${portal}`} className="hidden shrink-0 text-muted hover:text-ink sm:inline">{PORTAL_LABEL[portal]}</Link>
      {item && <ChevronRight size={14} className="hidden shrink-0 text-line-strong sm:inline" />}
      {item && (isDetail ? <Link to={item.to} className="truncate text-muted hover:text-ink">{item.label}</Link> : <span className="truncate font-medium text-ink" aria-current="page">{item.label}</span>)}
      {isDetail && <><ChevronRight size={14} className="shrink-0 text-line-strong" /><span className="truncate font-medium text-ink" aria-current="page">{detail ?? 'Details'}</span></>}
    </nav>
  )
}

export function relTime(at: string) {
  const m = Math.round((Date.now() - Date.parse(at)) / 60000)
  if (m < -1) return `in ${m > -60 ? `${-m}m` : `${Math.round(-m / 60)}h`}`
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

function NotificationsButton({ portal }: { portal: Portal }) {
  const { person } = usePersona(portal)
  const items = useNotifications(portal, person?.id)
  const seen = useSession((s) => s.seenNotifications)
  const markSeen = useSession((s) => s.markNotificationsSeen)
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const unread = items.filter((n) => !seen.includes(n.id))
  const [pos, setPos] = useState({ top: 64, right: 16 })
  useEffect(() => {
    if (!open) return
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('button')?.focus(), 30)
    const close = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.querySelector('button')?.focus() } }
    document.addEventListener('mousedown', close); window.addEventListener('keydown', key)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close); window.removeEventListener('keydown', key) }
  }, [open])
  const toneDot: Record<AppNotification['tone'], string> = { info: 'bg-info', warning: 'bg-amber', danger: 'bg-danger', success: 'bg-ok', neutral: 'bg-muted' }
  return (
    <>
      <span ref={btn}><IconButton icon={Bell} label={`Notifications${unread.length ? ` (${unread.length} unread)` : ''}`} badge={unread.length} onClick={() => setOpen((o) => !o)} /></span>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={panel} role="dialog" aria-label="Notifications" style={{ top: pos.top, right: pos.right }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
              className="fixed z-[70] w-[min(400px,calc(100vw-16px))] overflow-hidden rounded-card border border-line bg-surface shadow-pop">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="text-sm font-semibold text-ink">Notifications {unread.length > 0 && <Badge tone="danger" className="ml-1">{unread.length} new</Badge>}</div>
                <button className="inline-flex items-center gap-1 text-xs font-medium text-forest-700 hover:underline disabled:opacity-40" disabled={!unread.length} onClick={() => markSeen(items.map((n) => n.id))}><CheckCheck size={14} /> Mark all read</button>
              </div>
              <ul className="max-h-[60vh] overflow-y-auto">
                {!items.length && <li className="px-4 py-10 text-center text-sm text-muted">You're all caught up.</li>}
                {items.map((n) => {
                  const isNew = !seen.includes(n.id)
                  return (
                    <li key={n.id}>
                      <button onClick={() => { markSeen([n.id]); setOpen(false); nav(n.to) }} className={clsx('flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2', isNew && 'bg-forest-50/60')}>
                        <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', isNew ? toneDot[n.tone] : 'bg-transparent')} />
                        <span className="min-w-0 flex-1">
                          <span className={clsx('block text-sm', isNew ? 'font-semibold text-ink' : 'text-ink-2')}>{n.title}</span>
                          {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
                          <span className="mt-1 block text-2xs text-muted">{relTime(n.at)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function TopBar({ portal, onMenu }: { portal: Portal; onMenu: () => void }) {
  const now = useNow(30_000)
  const setCommandOpen = useSession((s) => s.setCommandOpen)
  const offline = useDB((s) => s.connection.hotel === 'offline')
  const [help, setHelp] = useState(false)
  useEffect(() => { const h = () => setHelp(true); window.addEventListener('mise:help', h); return () => window.removeEventListener('mise:help', h) }, [])
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <IconButton icon={MenuIcon} label="Open navigation" className="lg:hidden" onClick={onMenu} />
        <div className="min-w-0 flex-1"><Breadcrumbs portal={portal} /></div>
        <button onClick={() => setCommandOpen(true)} className="hidden h-9 w-64 items-center gap-2 rounded-cell border border-line-strong bg-surface px-3 text-sm text-muted shadow-sm transition hover:border-ink-2/30 md:flex" aria-label="Search">
          <Search size={15} /><span className="flex-1 text-left">Search…</span><Kbd>⌘K</Kbd>
        </button>
        <IconButton icon={Search} label="Search" className="md:hidden" onClick={() => setCommandOpen(true)} />
        <div className="hidden items-center gap-1.5 rounded-cell border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2 xl:flex" title="Hotel time (Asia/Colombo)">
          {offline ? <WifiOff size={13} className="text-danger" /> : <span className="h-1.5 w-1.5 rounded-full bg-ok" />}
          <span className="font-medium tabular text-ink">{fTime(now)}</span><span className="text-muted">hotel time</span>
        </div>
        <NotificationsButton portal={portal} />
        <IconButton icon={HelpCircle} label="Help" className="max-sm:hidden" onClick={() => setHelp(true)} />
      </div>
      <HelpDrawer open={help} onClose={() => setHelp(false)} portal={portal} />
    </header>
  )
}

function BottomTabs({ portal }: { portal: Portal }) {
  const counts = useCounts(portal)
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto flex max-w-md">
        {NAV[portal].filter((i) => i.tab).map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink to={i.to} end={i.to === `/${portal}`} className={({ isActive }) => clsx('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', isActive ? 'text-forest-900' : 'text-muted')}>
              {({ isActive }) => (<>
                {isActive && <span aria-hidden className="absolute top-0 h-0.5 w-10 rounded-pill bg-forest-900" />}
                <span className="relative"><i.icon size={21} />{i.count && counts[i.count] > 0 && <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-pill bg-danger px-1 text-[9px] font-bold text-white">{counts[i.count]}</span>}</span>
                {i.label}
              </>)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function PortalShell({ portal, children }: { portal: Portal; children: ReactNode }) {
  const loc = useLocation()
  const [menu, setMenu] = useState(false)
  const isEmployee = portal === 'employee'
  const crumb = useCrumbStore((s) => s.label)
  const first = useRef(true)
  useEffect(() => {
    window.scrollTo(0, 0)
    // Move focus to the new screen so keyboard and screen-reader users start at its content.
    if (first.current) { first.current = false; return }
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [loc.pathname])
  useEffect(() => {
    const item = navFor(portal, loc.pathname)
    const isDetail = !!item && loc.pathname !== item.to
    document.title = [isDetail ? crumb : null, item?.label, `${PORTAL_LABEL[portal]} · Mise`].filter(Boolean).join(' · ')
  }, [portal, loc.pathname, crumb])
  return (
    <div data-portal={portal} className="flex min-h-full bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-cell focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block"><Sidebar portal={portal} /></aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar portal={portal} onMenu={() => setMenu(true)} />
        {/* Enter-only fade: no exit wait, so a new screen can never be held back by the old one. */}
        <motion.main id="main" tabIndex={-1} key={loc.pathname} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}
          className={clsx('mx-auto w-full flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8', isEmployee ? 'max-w-3xl pb-28 lg:pb-10' : 'max-w-[1400px]')}>
          <RouteBoundary resetKey={loc.pathname}>{children}</RouteBoundary>
        </motion.main>
        {isEmployee && <BottomTabs portal={portal} />}
      </div>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Navigation" side="left" width="sm" dark>
        <div className="-m-5 h-[calc(100%+2.5rem)]"><Sidebar portal={portal} onNavigate={() => setMenu(false)} /></div>
      </Drawer>
      <CommandPalette portal={portal} />
    </div>
  )
}
