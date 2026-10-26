// Core domain model. Every record is scoped to a propertyId (multi-tenant from day one).
// The backbone: a Task is a live instance of one exact, pinned SopVersion.

export type Portal = 'employee' | 'manager' | 'author'
/** base = shift manager / room attendant / author; senior = senior manager; admin = property admin */
export type Tier = 'base' | 'senior' | 'admin'

export interface Property {
  id: string; name: string; city: string; timeZone: string
  /** Platform foundation settings */
  codeScheme: string; defaultTimeTargetMin: number
}

export interface RoleGrant { propertyId: string; portal: Portal; tier: Tier; personId: string }

export interface Account { id: string; personId: string; name: string; grants: RoleGrant[]; disabled?: boolean }

export interface JobRole { id: string; propertyId: string; name: string; team: string }

export interface Person {
  id: string; propertyId: string; name: string; initials: string; jobRoleId: string; title: string
  catalogue: CatalogueId[]
}

export type CatalogueId = 'pilot' | 'whole'

export interface SopStep {
  id: string; icon: string; instruction: string; guestCare: string; requireCheck: boolean; allowPhoto: boolean
}

export type VersionStatus = 'draft' | 'in_review' | 'changes_requested' | 'published' | 'superseded' | 'rejected'

export interface ReviewDecision {
  id: string; reviewerId: string; decision: 'approve' | 'request_changes' | 'reject'; at: string; comment: string; stepId?: string
}

export interface SopVersion {
  id: string; sopId: string; propertyId: string
  /** semantic-style label; drafts carry the label they were based on and get bumped on release */
  version: string; baseVersionId: string | null
  status: VersionStatus
  title: string; code: string; jobRoleId: string; language: string; tags: string[]
  timeTargetMin: number; steps: SopStep[]
  authorId: string; createdAt: string; updatedAt: string; submittedAt?: string
  reviews: ReviewDecision[]
  publishedAt?: string; effectiveAt?: string
  catalogue: CatalogueId[]
}

export interface Sop { id: string; propertyId: string; code: string; currentVersionId: string | null }

/** A recurring shift. start/end are hotel-local "HH:MM"; an end before start crosses midnight. */
export interface Shift {
  id: string; propertyId: string; name: string; start: string; end: string; staffTarget: number
  team: string; memberIds: string[]
}

export interface Room { id: string; propertyId: string; number: string; floor: number; wing: string; yesterdayAttendantId?: string }

export type Priority = 'standard' | 'high' | 'urgent'
export type TaskStatus = 'scheduled' | 'ready' | 'in_progress' | 'awaiting_verification' | 'done'

export interface Task {
  id: string; propertyId: string; shiftId: string; personId: string; roomId: string
  /** pinned at assignment; a later release never changes it */
  sopVersionId: string
  start: string; end: string; priority: Priority; status: TaskStatus
  doneStepIds: string[]; photoStepIds: string[]
  /** stepId → R2 object key */
  photoKeys: Record<string, string>
  mode: 'guided' | 'standard'
  startedAt?: string; completedAt?: string
  urgentEnded?: { at: string; reason: string; seen: boolean }
  assignedById: string; reviewedVersionConfirmed: boolean
}

export type AckKind = 'sop' | 'notice'
export interface AckEvent {
  id: string; propertyId: string; personId: string; kind: AckKind; refId: string
  openedAt: string | null; acknowledgedAt: string | null; repliedAt?: string | null; reply?: string
}

export interface Notice {
  id: string; propertyId: string; title: string; body: string; replyNeeded: boolean; sample: boolean
  audience: 'team' | 'people'; teamShiftId?: string; recipientIds: string[]; sentAt: string | null; sentById?: string
}

export type AttendanceMark = 'checkin' | 'extra' | 'pending'
export interface Attendance { id: string; propertyId: string; personId: string; date: string; mark: AttendanceMark; at: string }

export type CoverKind = 'backup' | 'time_off' | 'arrival' | 'early_departure' | 'early_close' | 'ended'
export interface CoverItem {
  id: string; propertyId: string; kind: CoverKind; personId: string; shiftId: string; date: string
  backupId?: string; note: string; status: 'pending' | 'approved' | 'declined'
}

export type FeedbackLane = 'suggestion' | 'rating' | 'manager_request'
export interface Feedback {
  id: string; propertyId: string; lane: FeedbackLane; sopVersionId: string; stepId?: string
  fromId: string; rating?: number; text: string; at: string; status: 'open' | 'done'
}

export interface JoinRequest { id: string; propertyId: string; name: string; jobRoleId: string; shiftId: string; at: string; status: 'pending' | 'approved' | 'declined' }

export interface Issue { id: string; propertyId: string; taskId: string; personId: string; text: string; at: string; status: 'open' | 'resolved' }

export interface AuditEntry { id: string; propertyId: string; actorId: string; action: string; detail: string; at: string }
