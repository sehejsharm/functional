import {
  Activity, AlertOctagon, BarChart3, BookOpen, Briefcase, CalendarClock, CalendarRange, ClipboardCheck, ClipboardList, Contact, FilePlus2, FileText, Flag, Gauge,
  Hammer, Home, LayoutGrid, Library, LineChart, ListChecks, Lock, Megaphone, MessageSquare, Settings2, ShieldCheck, ToggleLeft, User, UserPlus, Users,
  type LucideIcon,
} from 'lucide-react'
import type { Portal, Tier } from '@/lib/types'

export type CountKey = 'cover' | 'reviews' | 'feedback' | 'join' | 'incidents' | 'verify' | 'myRooms' | 'notices'
export interface NavItem { to: string; label: string; icon: LucideIcon; need?: Tier; count?: CountKey; group?: string; /** shown in bottom tabs on phones */ tab?: boolean }

export const NAV: Record<Portal, NavItem[]> = {
  employee: [
    { to: '/employee', label: 'My work', icon: Briefcase, count: 'myRooms', tab: true },
    { to: '/employee/guides', label: 'Guides', icon: BookOpen, tab: true },
    { to: '/employee/reports', label: 'Reports', icon: Flag, tab: true },
    { to: '/employee/me', label: 'Me', icon: User, count: 'notices', tab: true },
  ],
  manager: [
    { to: '/manager', label: 'Overview', icon: Home },
    { to: '/manager/tasks', label: 'Live tasks', icon: ListChecks, count: 'verify' },
    { to: '/manager/assign-rooms', label: 'Assign work', icon: ClipboardList },
    { to: '/manager/incidents', label: 'Incidents', icon: AlertOctagon, count: 'incidents' },
    { to: '/manager/shift-cover', label: 'Shift cover & time off', icon: CalendarClock, count: 'cover' },
    { to: '/manager/staff', label: 'Staff directory', icon: Contact },
    { to: '/manager/notices', label: 'Hotel notices', icon: Megaphone },
    { to: '/manager/sops', label: 'Employee SOPs', icon: FileText },
    { to: '/manager/acknowledgments', label: 'Acknowledgment ledger', icon: ShieldCheck, need: 'senior', group: 'Insights' },
    { to: '/manager/team-progress', label: 'Team progress', icon: BarChart3, need: 'senior', group: 'Insights' },
    { to: '/manager/sop-results', label: 'SOP results', icon: LineChart, need: 'senior', group: 'Insights' },
    { to: '/manager/lead/board', label: 'Property board', icon: LayoutGrid, need: 'senior', group: 'Lead operations' },
    { to: '/manager/lead/planner', label: 'Shift planner', icon: CalendarRange, need: 'senior', group: 'Lead operations' },
    { to: '/manager/lead/pulse', label: 'Operations pulse', icon: Activity, need: 'senior', group: 'Lead operations' },
    { to: '/manager/guided-or-standard', label: 'Guided or Standard', icon: ToggleLeft, group: 'Settings' },
    { to: '/manager/join-requests', label: 'Join requests', icon: UserPlus, count: 'join', group: 'Settings' },
    { to: '/manager/sop-policy', label: 'Hotel SOP policy', icon: ClipboardCheck, group: 'Settings' },
    { to: '/manager/platform', label: 'Platform & audit', icon: Settings2, need: 'admin', group: 'Administration' },
  ],
  author: [
    { to: '/author', label: 'SOP library', icon: Library },
    { to: '/author/new', label: 'Create SOP', icon: FilePlus2 },
    { to: '/author/reviews', label: 'Reviews & releases', icon: Gauge, count: 'reviews' },
    { to: '/author/feedback', label: 'Feedback & requests', icon: MessageSquare, count: 'feedback' },
    { to: '/author/use-results', label: 'Use & results', icon: LineChart, need: 'senior', group: 'Insights' },
    { to: '/author/platform', label: 'Platform & audit', icon: Settings2, need: 'admin', group: 'Administration' },
  ],
}

export const PORTAL_LABEL: Record<Portal, string> = { employee: 'Employee', manager: 'Manager', author: 'Author' }

export const LockIcon = Lock
export const ScreensIcon = Hammer
export const PeopleIcon = Users

export const PORTAL_CONTEXT: Record<Portal, string> = {
  employee: 'Daily operations',
  manager: 'Shift operations',
  author: 'Hotel standards',
}

/** Best nav match for a path (longest prefix), used by breadcrumbs and the command palette. */
export function navFor(portal: Portal, path: string): NavItem | undefined {
  return [...NAV[portal]].sort((a, b) => b.to.length - a.to.length).find((n) => path === n.to || path.startsWith(n.to + '/'))
}
