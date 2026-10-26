import {
  BarChart3, BookOpen, CalendarClock, ClipboardList, FilePlus2, FileText, Gauge, Home, LayoutGrid, LineChart, Lock, Megaphone,
  MessageSquare, Settings2, ShieldCheck, ToggleLeft, UserPlus, Users, Activity, CalendarRange, Briefcase, User, Hammer,
  type LucideIcon,
} from 'lucide-react'
import type { Portal, Tier } from '@/lib/types'

export interface NavItem { to: string; label: string; icon: LucideIcon; need?: Tier; count?: 'cover' | 'reviews' | 'feedback' | 'join'; hidden?: boolean; group?: string }

export const NAV: Record<Portal, NavItem[]> = {
  employee: [
    { to: '/employee', label: 'Work', icon: Briefcase },
    { to: '/employee/guides', label: 'Guides', icon: BookOpen },
    { to: '/employee/me', label: 'Me', icon: User },
  ],
  manager: [
    { to: '/manager', label: 'Overview', icon: Home },
    { to: '/manager/assign-rooms', label: 'Assign rooms', icon: ClipboardList },
    { to: '/manager/shift-cover', label: 'Shift cover & time off', icon: CalendarClock, count: 'cover' },
    { to: '/manager/acknowledgments', label: 'Acknowledgment ledger', icon: ShieldCheck, need: 'senior' },
    { to: '/manager/notices', label: 'Hotel notices', icon: Megaphone },
    { to: '/manager/team-progress', label: 'Team progress', icon: BarChart3, need: 'senior' },
    { to: '/manager/sops', label: 'Employee SOPs', icon: FileText },
    { to: '/manager/sop-results', label: 'SOP results', icon: LineChart, need: 'senior', group: 'More' },
    { to: '/manager/guided-or-standard', label: 'Guided or Standard', icon: ToggleLeft, group: 'More' },
    { to: '/manager/join-requests', label: 'Join requests', icon: UserPlus, count: 'join', group: 'More' },
    { to: '/manager/sop-policy', label: 'Hotel SOP policy', icon: BookOpen, group: 'More' },
    { to: '/manager/lead/board', label: 'Property board', icon: LayoutGrid, need: 'senior', group: 'Lead operations' },
    { to: '/manager/lead/planner', label: 'Shift planner', icon: CalendarRange, need: 'senior', group: 'Lead operations' },
    { to: '/manager/lead/pulse', label: 'Operations pulse', icon: Activity, need: 'senior', group: 'Lead operations' },
  ],
  author: [
    { to: '/author', label: 'My SOPs', icon: FileText },
    { to: '/author/new', label: 'Create SOP', icon: FilePlus2 },
    { to: '/author/feedback', label: 'Feedback & requests', icon: MessageSquare, count: 'feedback' },
    { to: '/author/reviews', label: 'Reviews & releases', icon: Gauge, count: 'reviews' },
    { to: '/author/use-results', label: 'Use & results', icon: LineChart, need: 'senior', group: 'More' },
    { to: '/author/platform', label: 'Platform foundation', icon: Settings2, need: 'admin', group: 'More' },
  ],
}

export const LockIcon = Lock
export const ScreensIcon = Hammer
export const PeopleIcon = Users

export const PORTAL_CONTEXT: Record<Portal, string> = {
  employee: 'Housekeeping · Daily operations',
  manager: 'Manager · Shift operations',
  author: 'Author · Hotel standards',
}
