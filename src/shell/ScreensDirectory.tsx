import { ArrowUpRight, Briefcase, ClipboardList, Library, Lock, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Logo, PageHeader } from '@/components/ui'

// The product's own feature inventory. Gated screens need Senior manager / Property admin.
const GROUPS: { title: string; who: string; icon: LucideIcon; screens: [string, string, boolean?][] }[] = [
  { title: 'Employee', who: 'Room attendants, bell desk and public-area staff on shift', icon: Briefcase, screens: [
    ['My work', '/employee'], ['Room task', '/employee/tasks/t-114'], ['SOP guides', '/employee/guides'], ['Guide reader', '/employee/guides/hk-reset'],
    ['Reports & incidents', '/employee/reports'], ['Me · attendance & notices', '/employee/me'],
  ] },
  { title: 'Manager', who: 'Shift managers running the floor', icon: ClipboardList, screens: [
    ['Overview', '/manager'], ['Live tasks', '/manager/tasks'], ['Assign work', '/manager/assign-rooms'], ['Incidents', '/manager/incidents'],
    ['Shift cover & time off', '/manager/shift-cover'], ['Staff directory', '/manager/staff'], ['Hotel notices', '/manager/notices'], ['Employee SOPs', '/manager/sops'],
    ['Staff detail', '/manager/staff/maya', true], ['Acknowledgment ledger', '/manager/acknowledgments', true], ['Team progress', '/manager/team-progress', true],
    ['SOP results', '/manager/sop-results', true], ['Property board', '/manager/lead/board', true], ['Shift planner', '/manager/lead/planner', true],
    ['Operations pulse', '/manager/lead/pulse', true], ['Guided or Standard', '/manager/guided-or-standard'], ['Join requests', '/manager/join-requests'], ['Hotel SOP policy', '/manager/sop-policy'],
  ] },
  { title: 'Author', who: 'Standards authors and reviewers', icon: Library, screens: [
    ['SOP library', '/author'], ['SOP detail', '/author/sops/hk-reset'], ['Create SOP', '/author/new'], ['Import from PDF', '/author/new?import=1'],
    ['Reviews & releases', '/author/reviews'], ['Feedback & requests', '/author/feedback'], ['Use & results', '/author/use-results', true], ['Platform & audit', '/author/platform', true],
  ] },
]

export function ScreensDirectory() {
  return (
    <div className="min-h-full bg-canvas">
      <header className="sidebar-surface px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between"><Link to="/" aria-label="Mise home"><Logo /></Link><Link to="/" className="text-sm font-medium text-sage-200 hover:text-white">Sign in</Link></div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <PageHeader eyebrow="Product map" title="All screens" description="Every part of Mise, grouped by who uses it. Locked screens need a Senior manager or Property admin tier." />
        <div className="grid gap-5 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <section key={g.title} className="card overflow-hidden">
              <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                <span className="grid h-9 w-9 place-items-center rounded-cell bg-forest-50 text-forest-700"><g.icon size={17} /></span>
                <div><h2 className="text-[15px] font-semibold text-ink">{g.title} <Badge className="ml-1">{g.screens.length}</Badge></h2><p className="text-xs text-muted">{g.who}</p></div>
              </div>
              <ul className="divide-y divide-line">
                {g.screens.map(([label, to, gated]) => (
                  <li key={label}>
                    <Link to={to} className="group flex items-center gap-2 px-5 py-2.5 text-sm text-ink hover:bg-surface-2">
                      <span className="flex-1">{label}</span>
                      {gated && <Lock size={13} className="text-muted" aria-label="Needs a higher access tier" />}
                      <ArrowUpRight size={14} className="text-muted opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
