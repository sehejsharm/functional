import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo, PageHeader } from '@/components/ui'

// The product's own feature inventory. [gated] screens need Senior manager / Property admin.
const GROUPS: { title: string; screens: [string, string, boolean?][] }[] = [
  { title: 'Staff V2B · Daily operations', screens: [
    ['Today', '/employee'], ['My shift', '/employee'], ['Guest requests', '/employee'], ['My attendance', '/employee/me'], ['Me', '/employee/me'],
    ['Notices', '/employee'], ['End shift', '/employee'], ['Go early', '/employee'], ['SOP guides', '/employee/guides'],
    ['Room steps', '/employee'], ['Do room task', '/employee'], ['Step photo', '/employee'],
  ] },
  { title: 'Lead operations', screens: [['Property board', '/manager/lead/board', true], ['Shift planner', '/manager/lead/planner', true], ['Operations pulse', '/manager/lead/pulse', true]] },
  { title: 'Manage people & standards', screens: [
    ['Manager overview', '/manager', true], ['Team progress', '/manager/team-progress', true], ['Staff detail', '/manager/team-progress', true], ['SOP results', '/manager/sop-results', true],
    ['Assignments & verification', '/manager/assign-rooms'], ['Hotel notices', '/manager/notices'], ['Guided or Standard', '/manager/guided-or-standard'],
    ['Join requests', '/manager/join-requests'], ['Employee SOPs', '/manager/sops'], ['Hotel SOP policy', '/manager/sop-policy'], ['Acknowledgment ledger', '/manager/acknowledgments', true],
  ] },
  { title: 'Author standards', screens: [
    ['My SOPs', '/author'], ['Create SOP', '/author/new'], ['Feedback & requests', '/author/feedback'],
    ['Use & results', '/author/use-results', true], ['Platform foundation', '/manager/platform', true],
  ] },
]

export function ScreensDirectory() {
  return (
    <div className="brand-sheen min-h-full px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <Link to="/"><Logo /></Link>
        <div className="mt-8"><PageHeader title="All screens" tagline="Every part of Mise, by who uses it." /></div>
        <div className="grid gap-6 md:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} className="card p-5">
              <h2 className="mb-3 font-semibold text-white">{g.title} <span className="text-sm font-normal text-sage-300">({g.screens.length} screens)</span></h2>
              <ul className="grid grid-cols-2 gap-1.5 text-sm">
                {g.screens.map(([label, to, gated]) => (
                  <li key={label}><Link to={to} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sage-200 hover:bg-white/5 hover:text-gold-400">{label}{gated && <Lock size={12} className="text-sage-300" />}</Link></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
