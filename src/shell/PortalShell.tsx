import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { LogOut, Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Count, Drawer, HelpBadge, Logo } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { canAccess, tierLabel } from '@/lib/permissions'
import { useGrant, useGrants, useSession } from '@/lib/session'
import type { Portal, Tier } from '@/lib/types'
import { HelpDrawer } from './HelpDrawer'
import { LockIcon, NAV, PORTAL_CONTEXT, type NavItem } from './nav'

export function usePersona(portal: Portal) {
  const grant = useGrant(portal)
  const people = useDB((s) => s.people)
  return { grant, person: byId(people, grant?.personId) }
}

function useCounts() {
  const cover = useDB((s) => s.cover.filter((c) => c.status === 'pending').length)
  const reviews = useDB((s) => s.sopVersions.filter((v) => v.status === 'in_review' || v.status === 'changes_requested').length)
  const feedback = useDB((s) => s.feedback.filter((f) => f.status === 'open').length)
  const join = useDB((s) => s.joinRequests.filter((j) => j.status === 'pending').length)
  return { cover, reviews, feedback, join }
}

export function PortalSwitcher({ current }: { current: Portal }) {
  const grants = useGrants()
  const people = useDB((s) => s.people)
  const setSwitching = useSession((s) => s.setSwitching)
  const setPortal = useSession((s) => s.setPortal)
  const nav = useNavigate()
  if (grants.length < 2) return null
  const go = (g: (typeof grants)[number]) => {
    if (g.portal === current) return
    setSwitching(byId(people, g.personId)?.name ?? g.portal)
    setTimeout(() => { setPortal(g.portal); nav(`/${g.portal}`) }, 650)
    setTimeout(() => setSwitching(null), 1300)
  }
  return (
    <div role="tablist" aria-label="Switch portal" className="flex rounded-pill bg-forest-950/70 p-1">
      {(['employee', 'manager', 'author'] as Portal[]).map((p) => {
        const g = grants.find((x) => x.portal === p)
        if (!g) return null
        return (
          <button key={p} role="tab" aria-selected={p === current} onClick={() => go(g)}
            className={clsx('relative flex-1 rounded-pill px-2.5 py-1.5 text-xs font-semibold capitalize', p === current ? 'text-forest-950' : 'text-sage-300 hover:text-white')}>
            {p === current && <motion.span layoutId="portal-pill" className="absolute inset-0 rounded-pill bg-gold-500" />}
            <span className="relative">{p}</span>
          </button>
        )
      })}
    </div>
  )
}

export function SwitchingOverlay() {
  const name = useSession((s) => s.switching)
  return (
    <AnimatePresence>
      {name && (
        <motion.div className="brand-sheen fixed inset-0 z-[60] grid place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} className="card flex flex-col items-center gap-4 px-10 py-8">
            <Logo size={44} wordmark={false} />
            <div className="font-display text-2xl font-bold text-white">Changing to {name}…</div>
            <div className="h-1 w-40 overflow-hidden rounded-pill bg-white/10">
              <motion.div className="h-full bg-gold-500" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.1 }} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ConnectionChip() {
  const conn = useDB((s) => s.connection)
  const outbox = useDB((s) => s.outbox.length)
  const setConnection = useDB((s) => s.setConnection)
  const [open, setOpen] = useState(false)
  const offline = conn.hotel === 'offline'
  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-forest-950/50 px-3 py-2 text-xs">
        <span className="flex items-center gap-2">
          <span className={clsx('h-2 w-2 rounded-full', offline ? 'bg-danger' : 'bg-ok')} />
          {offline ? 'Hotel connection offline · shared demo' : 'Hotel connection live'}
        </span>
        <button className="text-gold-400 underline-offset-2 hover:underline" onClick={() => setOpen(true)}>Details</button>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="Hotel connection">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-sage-300">Hotel system</dt><dd>{conn.hotel}</dd></div>
          <div className="flex justify-between"><dt className="text-sage-300">Check-in service</dt><dd>{conn.checkin === 'ok' ? 'confirmed' : 'needs attention'}</dd></div>
          <div className="flex justify-between"><dt className="text-sage-300">Changes waiting to sync</dt><dd>{outbox}</dd></div>
        </dl>
        <p className="mt-5 text-xs text-sage-300">Demo controls — simulate the two independent failure states:</p>
        <div className="mt-2 grid gap-2">
          <button className="card px-3 py-2 text-left text-sm" onClick={() => setConnection({ hotel: offline ? 'online' : 'offline' })}>
            {offline ? 'Restore hotel connection' : 'Drop hotel connection'}
          </button>
          <button className="card px-3 py-2 text-left text-sm" onClick={() => setConnection({ checkin: conn.checkin === 'ok' ? 'attention' : 'ok' })}>
            {conn.checkin === 'ok' ? 'Fail check-in confirmation' : 'Confirm check-in service'}
          </button>
        </div>
      </Drawer>
    </>
  )
}

function DemoTierPicker({ portal }: { portal: Portal }) {
  const demoTier = useSession((s) => s.demoTier)
  const setDemoTier = useSession((s) => s.setDemoTier)
  const demoEmployeeId = useSession((s) => s.demoEmployeeId)
  const setDemoEmployee = useSession((s) => s.setDemoEmployee)
  const grant = useGrants().find((g) => g.portal === 'employee')
  const people = useDB((s) => s.people)
  const roles = useDB((s) => s.jobRoles)
  const shifts = useDB((s) => s.shifts)
  if (portal === 'employee') {
    const staff = people.filter((p) => shifts.some((s) => s.memberIds.includes(p.id)))
    return (
      <label className="block text-[11px] text-sage-300">
        Demo · viewing as
        <select className="input mt-1 !py-1.5 !text-xs" value={demoEmployeeId ?? grant?.personId ?? ''} onChange={(e) => setDemoEmployee(e.target.value === grant?.personId ? null : e.target.value)}>
          {staff.map((p) => <option key={p.id} value={p.id}>{p.name} · {byId(roles, p.jobRoleId)?.name}</option>)}
        </select>
      </label>
    )
  }
  return (
    <label className="block text-[11px] text-sage-300">
      Demo access tier
      <select className="input mt-1 !py-1.5 !text-xs" value={demoTier ?? ''} onChange={(e) => setDemoTier((e.target.value || null) as Tier | null)}>
        <option value="">{tierLabel.base} (as granted)</option>
        <option value="senior">{tierLabel.senior}</option>
        <option value="admin">{tierLabel.admin}</option>
      </select>
    </label>
  )
}

function NavList({ portal, onNavigate }: { portal: Portal; onNavigate?: () => void }) {
  const counts = useCounts()
  const { grant } = usePersona(portal)
  const items = NAV[portal]
  const groups = [...new Set(items.map((i) => i.group ?? ''))]
  return (
    <nav aria-label={`${portal} navigation`} className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          {g && <div className="eyebrow mb-1.5 px-3 !text-sage-300/70">{g}</div>}
          <ul className="space-y-0.5">
            {items.filter((i) => (i.group ?? '') === g).map((i) => <NavRow key={i.to} item={i} locked={!!i.need && !canAccess(grant?.tier, i.need)} count={i.count ? counts[i.count] : 0} onNavigate={onNavigate} />)}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function NavRow({ item, locked, count, onNavigate }: { item: NavItem; locked: boolean; count: number; onNavigate?: () => void }) {
  const I = item.icon
  return (
    <li>
      <NavLink to={item.to} end onClick={onNavigate}
        className={({ isActive }) => clsx('relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
          isActive ? 'bg-white/8 text-white' : 'text-sage-300 hover:bg-white/5 hover:text-white')}>
        {({ isActive }) => (<>
          {isActive && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 left-0 w-1 rounded-pill bg-gold-500" />}
          <I size={16} className="shrink-0" />
          <span className="flex-1">{item.label}{item.count === 'cover' && count > 0 && <span className="text-sage-300"> ({count})</span>}</span>
          {locked && <LockIcon size={13} className="text-sage-300/70" aria-label="Locked" />}
          {item.count && item.count !== 'cover' && count > 0 && <Count n={count} />}
        </>)}
      </NavLink>
    </li>
  )
}

function Sidebar({ portal, onNavigate }: { portal: Portal; onNavigate?: () => void }) {
  const { person, grant } = usePersona(portal)
  const property = useDB((s) => s.properties.find((p) => p.id === grant?.propertyId))
  const allProps = useDB((s) => s.properties)
  const signOut = useSession((s) => s.signOut)
  const nav = useNavigate()
  const [help, setHelp] = useState(false)
  return (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center justify-between"><Logo size={32} /><HelpBadge onClick={() => setHelp(true)} /></div>
      <PortalSwitcher current={portal} />
      {person && (
        <div className="flex items-center gap-3">
          <Avatar initials={person.initials} />
          <div className="min-w-0"><div className="truncate font-semibold text-white">{person.name}</div><div className="truncate text-xs text-sage-300">{person.title}</div></div>
        </div>
      )}
      <button className="-mt-3 flex items-center gap-1.5 self-start text-xs text-sage-300 hover:text-white" onClick={() => { signOut(); nav('/') }}>
        <LogOut size={12} /> Leave shared demo
      </button>
      <div className="rounded-xl border border-white/10 bg-forest-950/40 px-3 py-2.5">
        {allProps.length > 1
          ? <select className="input !py-1" aria-label="Property">{allProps.map((p) => <option key={p.id}>{p.name}</option>)}</select>
          : <div className="text-sm font-semibold text-white">{property?.name}</div>}
        <div className="text-xs text-sage-300">{PORTAL_CONTEXT[portal]}</div>
      </div>
      <div className="flex-1 overflow-y-auto"><NavList portal={portal} onNavigate={onNavigate} /></div>
      <div className="space-y-3">
        <DemoTierPicker portal={portal} />
        <ConnectionChip />
      </div>
      <HelpDrawer open={help} onClose={() => setHelp(false)} portal={portal} />
    </div>
  )
}

export function PortalShell({ portal, children }: { portal: Portal; children: ReactNode }) {
  const loc = useLocation()
  const [menu, setMenu] = useState(false)
  const isEmployee = portal === 'employee'
  return (
    <div data-portal={portal} className="brand-sheen flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/5 bg-forest-950/40 lg:block"><Sidebar portal={portal} /></aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-forest-900/90 px-4 py-3 backdrop-blur lg:hidden">
          <Logo size={28} />
          <div className="flex items-center gap-2">
            <div className="w-56 max-w-[50vw]"><PortalSwitcher current={portal} /></div>
            <button aria-label="Open menu" onClick={() => setMenu(true)} className="rounded-lg p-2 text-sage-200"><Menu size={20} /></button>
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
            className={clsx('mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10', isEmployee ? 'max-w-3xl pb-28 lg:pb-10' : 'max-w-7xl')}>
            {children}
          </motion.main>
        </AnimatePresence>
        {isEmployee && <BottomTabs />}
      </div>
      <Drawer open={menu} onClose={() => setMenu(false)} title="Menu"><div className="-m-5"><Sidebar portal={portal} onNavigate={() => setMenu(false)} /></div></Drawer>
    </div>
  )
}

function BottomTabs() {
  return (
    <nav aria-label="Employee tabs" className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-forest-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto flex max-w-md">
        {NAV.employee.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink to={i.to} end className={({ isActive }) => clsx('relative flex flex-col items-center gap-1 py-3 text-xs font-semibold', isActive ? 'text-gold-400' : 'text-sage-300')}>
              {({ isActive }) => (<>{isActive && <motion.span layoutId="tab-active" className="absolute top-0 h-0.5 w-10 rounded-pill bg-gold-500" />}<i.icon size={20} />{i.label}</>)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
