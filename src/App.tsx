import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LoginScreen } from './auth/LoginScreen'
import { RequirePortal, TierGate } from './shell/Guards'
import { PortalShell, SwitchingOverlay } from './shell/PortalShell'
import { ScreensDirectory } from './shell/ScreensDirectory'
import { useSession } from './lib/session'
import type { Portal, Tier } from './lib/types'
import { EmployeeWork } from './portals/employee/Work'
import { TaskDetail } from './portals/employee/TaskDetail'
import { EmployeeGuides } from './portals/employee/Guides'
import { EmployeeMe } from './portals/employee/Me'
import { AssignRooms } from './portals/manager/AssignRooms'
import { ShiftCover } from './portals/manager/ShiftCover'
import { AcknowledgmentLedger } from './portals/manager/Ledger'
import { HotelNotices } from './portals/manager/Notices'
import { SopResults, StaffDetail, TeamProgress } from './portals/manager/Analytics'
import { EmployeeSops, SopPolicy } from './portals/manager/EmployeeSops'
import { GuidedOrStandard, JoinRequests, ManagerOverview } from './portals/manager/Misc'
import { OperationsPulse, PropertyBoard, ShiftPlanner } from './portals/manager/Lead'
import { MySops } from './portals/author/MySops'
import { CreateSop } from './portals/author/CreateSop'
import { FeedbackRequests } from './portals/author/Feedback'
import { ReviewsReleases, VersionReview } from './portals/author/Reviews'
import { PlatformFoundation, UseResults } from './portals/author/Gated'

function PortalLayout({ portal }: { portal: Portal }) {
  return <RequirePortal portal={portal}><PortalShell portal={portal}><Outlet /></PortalShell></RequirePortal>
}
const gate = (portal: Portal, need: Tier, feature: string, el: JSX.Element) => <TierGate portal={portal} need={need} feature={feature}>{el}</TierGate>

export default function App() {
  const portal = useSession((s) => s.portal)
  const accountId = useSession((s) => s.accountId)
  return (
    <>
      <SwitchingOverlay />
      <Routes>
        <Route path="/" element={accountId && portal ? <Navigate to={`/${portal}`} replace /> : <LoginScreen />} />
        <Route path="/screens" element={<ScreensDirectory />} />
        <Route path="/employee" element={<PortalLayout portal="employee" />}>
          <Route index element={<EmployeeWork />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="guides" element={<EmployeeGuides />} />
          <Route path="me" element={<EmployeeMe />} />
        </Route>
        <Route path="/manager" element={<PortalLayout portal="manager" />}>
          <Route index element={<ManagerOverview />} />
          <Route path="assign-rooms" element={<AssignRooms />} />
          <Route path="shift-cover" element={<ShiftCover />} />
          <Route path="acknowledgments" element={gate('manager', 'senior', 'Acknowledgment ledger', <AcknowledgmentLedger />)} />
          <Route path="notices" element={<HotelNotices />} />
          <Route path="team-progress" element={gate('manager', 'senior', 'Team progress', <TeamProgress />)} />
          <Route path="staff/:id" element={gate('manager', 'senior', 'Staff detail', <StaffDetail />)} />
          <Route path="sop-results" element={gate('manager', 'senior', 'SOP results', <SopResults />)} />
          <Route path="sops" element={<EmployeeSops />} />
          <Route path="sop-policy" element={<SopPolicy />} />
          <Route path="guided-or-standard" element={<GuidedOrStandard />} />
          <Route path="join-requests" element={<JoinRequests />} />
          <Route path="lead/board" element={gate('manager', 'senior', 'Property board', <PropertyBoard />)} />
          <Route path="lead/planner" element={gate('manager', 'senior', 'Shift planner', <ShiftPlanner />)} />
          <Route path="lead/pulse" element={gate('manager', 'senior', 'Operations pulse', <OperationsPulse />)} />
        </Route>
        <Route path="/author" element={<PortalLayout portal="author" />}>
          <Route index element={<MySops />} />
          <Route path="new" element={<CreateSop />} />
          <Route path="edit/:id" element={<CreateSop />} />
          <Route path="feedback" element={<FeedbackRequests />} />
          <Route path="reviews" element={<ReviewsReleases />} />
          <Route path="reviews/:id" element={<VersionReview />} />
          <Route path="use-results" element={gate('author', 'senior', 'Use & results', <UseResults />)} />
          <Route path="platform" element={gate('author', 'admin', 'Platform foundation', <PlatformFoundation />)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
