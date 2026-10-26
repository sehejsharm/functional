import type {
  Account, AckEvent, Attendance, AuditEntry, CoverItem, Feedback, JobRole, JoinRequest, Notice, Person, Property,
  Room, Shift, Sop, SopStep, SopVersion, Task,
} from './types'
import { HOUR, MIN, hotelDateKey, hotelMidnight, iso } from './time'

export const PROPERTY: Property = { id: 'aurora-colombo', name: 'Aurora Grand Colombo', city: 'Colombo' }
const P = PROPERTY.id

const step = (id: string, icon: string, instruction: string, o: Partial<SopStep> = {}): SopStep => ({
  id, icon, instruction, guestCare: '', requireCheck: false, allowPhoto: false, ...o,
})

export function buildSeed(now = Date.now()) {
  const mid = hotelMidnight(now)
  const day = (d: number) => mid + d * 24 * HOUR

  const jobRoles: JobRole[] = [
    { id: 'room-attendant', propertyId: P, name: 'Room attendant', team: 'Housekeeping' },
    { id: 'hk-supervisor', propertyId: P, name: 'Housekeeping supervisor', team: 'Housekeeping' },
    { id: 'front-desk', propertyId: P, name: 'Front desk colleague', team: 'Front office' },
    { id: 'public-area', propertyId: P, name: 'Public area attendant', team: 'Housekeeping' },
  ]

  const mk = (id: string, name: string, jobRoleId: string, title: string, catalogue: Person['catalogue'] = ['pilot', 'whole']): Person => ({
    id, propertyId: P, name, initials: name.split(' ').map((s) => s[0]).join('').slice(0, 2), jobRoleId, title, catalogue,
  })
  const people: Person[] = [
    mk('maya', 'Maya Fernando', 'room-attendant', 'Room attendant'),
    mk('elena', 'Elena Rossi', 'hk-supervisor', 'Housekeeping shift manager'),
    mk('amina', 'Amina Rahman', 'hk-supervisor', 'Standards author'),
    mk('kasun', 'Kasun Perera', 'room-attendant', 'Room attendant'),
    mk('dilani', 'Dilani Silva', 'room-attendant', 'Room attendant'),
    mk('ravi', 'Ravi Jayasinghe', 'room-attendant', 'Room attendant'),
    mk('nimal', 'Nimal Wickrama', 'room-attendant', 'Room attendant', ['whole']),
    mk('sara', 'Sara Mendis', 'room-attendant', 'Room attendant', ['whole']),
    mk('tharindu', 'Tharindu Bandara', 'front-desk', 'Front desk colleague', ['whole']),
    mk('ishara', 'Ishara Gunawardena', 'front-desk', 'Front desk colleague', ['whole']),
    mk('omar', 'Omar Haddad', 'front-desk', 'Front desk colleague', ['whole']),
    mk('priya', 'Priya Nair', 'public-area', 'Public area attendant', ['whole']),
    mk('marco', 'Marco Bianchi', 'hk-supervisor', 'Senior housekeeping manager'),
    mk('leah', 'Leah Cohen', 'hk-supervisor', 'Standards reviewer'),
  ]

  const accounts: Account[] = [
    {
      id: 'shared-demo', label: 'Shared demo', primary: 'employee',
      grants: [
        { propertyId: P, portal: 'employee', tier: 'base', personId: 'maya' },
        { propertyId: P, portal: 'manager', tier: 'base', personId: 'elena' },
        { propertyId: P, portal: 'author', tier: 'base', personId: 'amina' },
      ],
    },
  ]

  const resetSteps = [
    step('s1', 'door', 'Knock, announce housekeeping, and confirm the room is clear to enter.', { guestCare: 'If a guest answers, offer a later time and note it — never enter an occupied room.' }),
    step('s2', 'bed', 'Reset bed, bathroom, surfaces, supplies, and guest touchpoints in the shown order.', { allowPhoto: true }),
    step('s3', 'eye', 'Walk the guest path, correct anything visible, then request independent verification.', { requireCheck: true }),
  ]
  const t0 = iso(day(-12))
  const v = (o: Partial<SopVersion> & Pick<SopVersion, 'id' | 'sopId' | 'version' | 'status' | 'title' | 'code'>): SopVersion => ({
    propertyId: P, baseVersionId: null, jobRoleId: 'room-attendant', language: 'English', tags: [], timeTargetMin: 27, steps: resetSteps,
    authorId: 'amina', createdAt: t0, updatedAt: t0, reviews: [], catalogue: ['pilot', 'whole'], ...o,
  })
  const sopVersions: SopVersion[] = [
    v({ id: 'hk-reset-2', sopId: 'hk-reset', version: '2.1', status: 'superseded', code: 'HK-ROOM-RESET', title: 'Guest room reset', publishedAt: iso(day(-60)), effectiveAt: iso(day(-60)), steps: resetSteps.slice(0, 2) }),
    v({ id: 'hk-reset-3', sopId: 'hk-reset', version: '3.0', status: 'published', code: 'HK-ROOM-RESET', title: 'Guest room reset', baseVersionId: 'hk-reset-2',
      tags: ['roomcare', 'reset'], publishedAt: iso(day(-12)), effectiveAt: iso(day(-12)),
      reviews: [
        { id: 'r1', reviewerId: 'marco', decision: 'approve', at: iso(day(-13)), comment: 'Clear and short.' },
        { id: 'r2', reviewerId: 'leah', decision: 'approve', at: iso(day(-13)), comment: 'Verification step is right.' },
      ] }),
    v({ id: 'hk-turndown-1', sopId: 'hk-turndown', version: '1.2', status: 'published', code: 'HK-TURNDOWN', title: 'Evening turndown', timeTargetMin: 12,
      publishedAt: iso(day(-30)), effectiveAt: iso(day(-30)), tags: ['guestcare', 'evening'],
      steps: [
        step('t1', 'door', 'Knock twice, announce turndown, wait ten seconds before entering.'),
        step('t2', 'moon', 'Fold back the bed, set slippers and the night card, dim the lights to the evening scene.', { guestCare: 'Leave personal items exactly where they are.' }),
        step('t3', 'check', 'Close the curtains and confirm the room is calm and tidy.'),
      ] }),
    v({ id: 'hk-102-1', sopId: 'hk-102', version: '1.0', status: 'in_review', code: 'HK-102', title: 'Prepare the trolley for a room reset', timeTargetMin: 8,
      tags: ['roomcare', 'trolley', 'safety'], submittedAt: iso(now - 3 * HOUR), catalogue: ['pilot', 'whole'],
      steps: [
        step('p1', 'cart', 'Load linen, amenities, and chemicals on the shelves shown in the trolley photo.'),
        step('p2', 'shield', 'Lock chemical caps and keep them on the bottom shelf, away from guest reach.', { requireCheck: true }),
      ] }),
  ]
  const sops: Sop[] = [
    { id: 'hk-reset', propertyId: P, code: 'HK-ROOM-RESET', currentVersionId: 'hk-reset-3' },
    { id: 'hk-turndown', propertyId: P, code: 'HK-TURNDOWN', currentVersionId: 'hk-turndown-1' },
    { id: 'hk-102', propertyId: P, code: 'HK-102', currentVersionId: null },
  ]

  const shifts: Shift[] = [
    { id: 'morning', propertyId: P, name: 'Morning', start: iso(mid + 6 * HOUR), end: iso(mid + 14 * HOUR), staffTarget: 2, team: 'Housekeeping', memberIds: ['maya', 'kasun'] },
    { id: 'afternoon', propertyId: P, name: 'Afternoon', start: iso(mid + 14 * HOUR), end: iso(mid + 22 * HOUR), staffTarget: 2, team: 'Housekeeping', memberIds: ['dilani', 'ravi'] },
    { id: 'night', propertyId: P, name: 'Night', start: iso(mid + 22 * HOUR), end: iso(mid + 30 * HOUR), staffTarget: 1, team: 'Housekeeping', memberIds: ['nimal'] },
  ]
  // Maya always works the live shift in the demo so her Today view has something real.
  const live = shifts.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end)) ?? shifts[0]
  if (!live.memberIds.includes('maya')) live.memberIds.unshift('maya')

  const rooms: Room[] = ['101', '104', '108', '114', '120', '201', '208', '214', '305', '309', '312', '318'].map((n, i) => ({
    id: `r${n}`, propertyId: P, number: n, floor: Number(n[0]), wing: i % 2 ? 'East' : 'West',
    yesterdayAttendantId: ['maya', 'kasun', 'dilani'][i % 3],
  }))

  const task = (id: string, roomId: string, startMs: number, o: Partial<Task> = {}): Task => ({
    id, propertyId: P, shiftId: live.id, personId: 'maya', roomId, sopVersionId: 'hk-reset-3',
    start: iso(startMs), end: iso(startMs + 27 * MIN), priority: 'standard', status: 'scheduled',
    doneStepIds: [], photoStepIds: [], mode: 'guided', assignedById: 'elena', reviewedVersionConfirmed: true, ...o,
  })
  const tasks: Task[] = [
    task('t-114', 'r114', now - 2 * MIN, { priority: 'urgent' }),
    task('t-208', 'r208', now + 40 * MIN),
    task('t-305', 'r305', now - 3 * HOUR, { status: 'done', doneStepIds: ['s1', 's2', 's3'], completedAt: iso(now - 2.5 * HOUR),
      urgentEnded: { at: iso(now - 20 * MIN), reason: "It's been pending for too long", seen: false } }),
    task('t-k1', 'r101', now - 4 * HOUR, { personId: 'kasun', status: 'done', doneStepIds: ['s1', 's2', 's3'], completedAt: iso(now - 3.4 * HOUR) }),
    task('t-k2', 'r120', now - 30 * MIN, { personId: 'kasun', status: 'in_progress', doneStepIds: ['s1'], startedAt: iso(now - 30 * MIN) }),
    task('t-k3', 'r309', now - 70 * MIN, { personId: 'kasun', status: 'awaiting_verification', doneStepIds: ['s1', 's2', 's3'] }),
  ]
  // Historical tasks across the last 10 shifts for Team progress / SOP results.
  const crew = ['maya', 'kasun', 'dilani', 'ravi']
  for (let d = 1; d <= 10; d++) {
    crew.forEach((pid, i) => {
      for (let k = 0; k < 3; k++) {
        const s = day(-d) + (7 + k * 2 + i * 0.25) * HOUR
        const dur = 22 + ((d * 7 + i * 5 + k * 3) % 14) // 22–35 min vs 27 target
        tasks.push(task(`h-${d}-${pid}-${k}`, rooms[(d + i + k) % rooms.length].id, s, {
          personId: pid, shiftId: 'morning', status: 'done', doneStepIds: ['s1', 's2', 's3'],
          startedAt: iso(s), completedAt: iso(s + dur * MIN), sopVersionId: d > 8 ? 'hk-reset-2' : 'hk-reset-3',
          priority: (d + k) % 9 === 0 ? 'urgent' : 'standard',
        }))
      }
    })
  }

  const ackEvents: AckEvent[] = [
    { id: 'a1', propertyId: P, personId: 'maya', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-11)), acknowledgedAt: iso(9 * HOUR + day(-11) + 4 * MIN) },
    { id: 'a2', propertyId: P, personId: 'kasun', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-10)), acknowledgedAt: iso(9 * HOUR + day(-10) + 9 * MIN) },
    { id: 'a3', propertyId: P, personId: 'dilani', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-3)), acknowledgedAt: null },
    { id: 'a4', propertyId: P, personId: 'ravi', kind: 'sop', refId: 'hk-reset-3', openedAt: null, acknowledgedAt: null },
    { id: 'a5', propertyId: P, personId: 'maya', kind: 'sop', refId: 'hk-turndown-1', openedAt: iso(9 * HOUR + day(-20)), acknowledgedAt: iso(9 * HOUR + day(-20) + 2 * MIN) },
    { id: 'a6', propertyId: P, personId: 'nimal', kind: 'sop', refId: 'hk-turndown-1', openedAt: iso(9 * HOUR + day(-2)), acknowledgedAt: iso(9 * HOUR + day(-2) + 3 * MIN) },
    { id: 'a7', propertyId: P, personId: 'sara', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-1)), acknowledgedAt: iso(9 * HOUR + day(-1) + 6 * MIN) },
  ]

  const notices: Notice[] = [
    { id: 'n-vip', propertyId: P, title: 'VIP arrival on floor 3', body: 'A VIP family arrives at 2 PM. Rooms 305–318 must be verified by 1:30 PM. Reply when your rooms are ready.',
      replyNeeded: true, sample: true, audience: 'team', teamShiftId: live.id, recipientIds: [], sentAt: null },
    { id: 'n-lift', propertyId: P, title: 'Service lift B closed until noon', body: 'Use lift A for trolleys this morning. No reply needed.',
      replyNeeded: false, sample: true, audience: 'team', teamShiftId: live.id, recipientIds: live.memberIds, sentAt: iso(now - 2 * HOUR), sentById: 'elena' },
  ]
  ackEvents.push({ id: 'a-n1', propertyId: P, personId: 'kasun', kind: 'notice', refId: 'n-lift', openedAt: iso(now - 100 * MIN), acknowledgedAt: null })

  const attendance: Attendance[] = []
  for (let d = 1; d <= 24; d++) {
    const ms = day(-d)
    const dow = new Date(ms).getUTCDay()
    if (dow === 0) continue
    crew.forEach((pid, i) => {
      if ((d + i) % 6 === 0) return
      const mark = (d + i) % 11 === 0 ? 'extra' : (d + i) % 13 === 0 ? 'pending' : 'checkin'
      attendance.push({ id: `at-${pid}-${d}`, propertyId: P, personId: pid, date: hotelDateKey(ms + 7 * HOUR), mark, at: iso(ms + 6 * HOUR + i * MIN) })
    })
  }

  const cover: CoverItem[] = [
    { id: 'c1', propertyId: P, kind: 'time_off', personId: 'dilani', shiftId: 'afternoon', date: hotelDateKey(day(3)), note: 'Family event', status: 'pending' },
    { id: 'c2', propertyId: P, kind: 'time_off', personId: 'ravi', shiftId: 'afternoon', date: hotelDateKey(day(5)), note: 'Medical appointment', status: 'pending' },
    { id: 'c3', propertyId: P, kind: 'arrival', personId: 'kasun', shiftId: 'morning', date: hotelDateKey(now), note: 'Checked in 14 min late — bus delay', status: 'pending' },
    { id: 'c4', propertyId: P, kind: 'arrival', personId: 'nimal', shiftId: 'night', date: hotelDateKey(day(-1)), note: 'Check-in without device location', status: 'pending' },
    { id: 'c5', propertyId: P, kind: 'early_departure', personId: 'ravi', shiftId: 'afternoon', date: hotelDateKey(day(-1)), note: 'Left 40 min early — unwell', status: 'pending' },
    { id: 'c6', propertyId: P, kind: 'early_close', personId: 'dilani', shiftId: 'afternoon', date: hotelDateKey(day(-2)), note: 'Closed shift with 1 room unverified', status: 'pending' },
    { id: 'c7', propertyId: P, kind: 'ended', personId: 'kasun', shiftId: 'morning', date: hotelDateKey(day(-1)), note: 'Ended normally · 8 rooms', status: 'approved' },
  ]

  const feedback: Feedback[] = [
    { id: 'f1', propertyId: P, lane: 'suggestion', sopVersionId: 'hk-reset-3', stepId: 's2', fromId: 'kasun', text: 'Step 2: say "restock minibar" explicitly — new staff skip it.', at: iso(day(-2)), status: 'open' },
    { id: 'f2', propertyId: P, lane: 'manager_request', sopVersionId: 'hk-reset-3', fromId: 'elena', text: 'Please add a step for checking the safe is left open and empty on checkout rooms.', at: iso(day(-1)), status: 'open' },
    { id: 'f3', propertyId: P, lane: 'suggestion', sopVersionId: 'hk-turndown-1', stepId: 't2', fromId: 'maya', text: 'Night card holders moved to the drawer.', at: iso(day(-9)), status: 'done' },
  ]

  const joinRequests: JoinRequest[] = [
    { id: 'j1', propertyId: P, name: 'Anushka Peiris', jobRoleId: 'room-attendant', shiftId: 'morning', at: iso(now - 5 * HOUR), status: 'pending' },
    { id: 'j2', propertyId: P, name: 'Ben Okafor', jobRoleId: 'public-area', shiftId: 'night', at: iso(day(-1)), status: 'pending' },
  ]

  const audit: AuditEntry[] = [
    { id: 'au1', propertyId: P, actorId: 'amina', action: 'sop.released', detail: 'HK-ROOM-RESET 3.0', at: iso(day(-12)) },
    { id: 'au2', propertyId: P, actorId: 'amina', action: 'sop.submitted', detail: 'HK-102 1.0 sent for review', at: iso(now - 3 * HOUR) },
  ]

  return { properties: [PROPERTY], accounts, jobRoles, people, sops, sopVersions, shifts, rooms, tasks, ackEvents, notices, attendance, cover, feedback, joinRequests, audit }
}

export type Seed = ReturnType<typeof buildSeed>
