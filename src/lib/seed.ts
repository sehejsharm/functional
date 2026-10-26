import type {
  Account, AckEvent, Attendance, AuditEntry, CoverItem, Feedback, Issue, JobRole, JoinRequest, Notice, Occupancy, Person, Property,
  Room, Shift, Sop, SopStep, SopVersion, Task,
} from './types'
import { HOUR, MIN, hotelDateKey, hotelMidnight, iso } from './time'

export const PROPERTY: Property = { id: 'aurora-colombo', name: 'Aurora Grand Colombo', city: 'Colombo' }
const P = PROPERTY.id

const step = (id: string, icon: string, instruction: string, o: Partial<SopStep> = {}): SopStep => ({
  id, icon, instruction, guestCare: '', requireCheck: false, allowPhoto: false, ...o,
})

/** Deterministic pseudo-random so every reseed of the same day looks the same. */
const rnd = (n: number) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x) }

export function buildSeed(now = Date.now()) {
  const mid = hotelMidnight(now)
  const day = (d: number) => mid + d * 24 * HOUR

  const jobRoles: JobRole[] = [
    { id: 'room-attendant', propertyId: P, name: 'Room attendant', team: 'Housekeeping' },
    { id: 'hk-supervisor', propertyId: P, name: 'Housekeeping supervisor', team: 'Housekeeping' },
    { id: 'front-desk', propertyId: P, name: 'Front desk colleague', team: 'Front office' },
    { id: 'public-area', propertyId: P, name: 'Public area attendant', team: 'Housekeeping' },
    { id: 'bellman', propertyId: P, name: 'Bellman / Porter', team: 'Front office' },
    { id: 'bell-captain', propertyId: P, name: 'Bell Captain', team: 'Front office' },
    { id: 'engineering', propertyId: P, name: 'Maintenance technician', team: 'Engineering' },
    { id: 'duty-manager', propertyId: P, name: 'Duty manager', team: 'Front office' },
  ]

  let empNo = 1040
  const mk = (id: string, name: string, jobRoleId: string, title: string, o: Partial<Person> = {}): Person => ({
    id, propertyId: P, name, initials: name.split(' ').map((s) => s[0]).join('').slice(0, 2), jobRoleId, title, catalogue: ['pilot', 'whole'],
    employeeNo: `AGC-${empNo++}`, email: `${name.split(' ')[0].toLowerCase()}.${name.split(' ').slice(-1)[0].toLowerCase()}@auroragrand.lk`,
    phone: `+94 77 ${String(2000000 + empNo * 7919).slice(0, 3)} ${String(empNo * 37).padStart(4, '0').slice(-4)}`,
    hiredAt: iso(day(-90 - ((empNo * 53) % 900))), languages: ['English', 'Sinhala'], status: 'active', ...o,
  })
  const people: Person[] = [
    mk('maya', 'Maya Fernando', 'room-attendant', 'Room attendant'),
    mk('elena', 'Elena Rossi', 'hk-supervisor', 'Housekeeping shift manager', { languages: ['English', 'Italian'] }),
    mk('amina', 'Amina Rahman', 'hk-supervisor', 'Standards author', { languages: ['English', 'Tamil'] }),
    mk('kasun', 'Kasun Perera', 'room-attendant', 'Room attendant'),
    mk('dilani', 'Dilani Silva', 'room-attendant', 'Room attendant'),
    mk('ravi', 'Ravi Jayasinghe', 'room-attendant', 'Room attendant', { languages: ['Sinhala', 'Tamil'] }),
    mk('nimal', 'Nimal Wickrama', 'room-attendant', 'Room attendant', { catalogue: ['whole'] }),
    mk('sara', 'Sara Mendis', 'room-attendant', 'Room attendant', { catalogue: ['whole'], status: 'on_leave' }),
    mk('tharindu', 'Tharindu Bandara', 'front-desk', 'Front desk colleague', { catalogue: ['whole'] }),
    mk('ishara', 'Ishara Gunawardena', 'front-desk', 'Front desk colleague', { catalogue: ['whole'] }),
    mk('omar', 'Omar Haddad', 'front-desk', 'Front desk colleague', { catalogue: ['whole'], languages: ['English', 'Arabic'] }),
    mk('priya', 'Priya Nair', 'public-area', 'Public area attendant', { catalogue: ['whole'], languages: ['English', 'Tamil', 'Malayalam'] }),
    mk('arjun', 'Arjun Mehta', 'bellman', 'Bellman', { languages: ['English', 'Hindi'] }),
    mk('farah', 'Farah Sheikh', 'bellman', 'Bellman', { languages: ['English', 'Urdu'] }),
    mk('vikram', 'Vikram Rao', 'bell-captain', 'Bell Captain', { languages: ['English', 'Hindi', 'Tamil'] }),
    mk('suresh', 'Suresh Kumar', 'engineering', 'Maintenance technician', { languages: ['English', 'Tamil'] }),
    mk('nadia', 'Nadia Karim', 'duty-manager', 'Duty manager', { languages: ['English', 'French'] }),
    mk('marco', 'Marco Bianchi', 'hk-supervisor', 'Senior housekeeping manager', { languages: ['English', 'Italian'] }),
    mk('leah', 'Leah Cohen', 'hk-supervisor', 'Standards reviewer', { languages: ['English', 'Hebrew'] }),
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

  // ── SOP library ───────────────────────────────────────────────────────────
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
  const approvals = (d: number) => [
    { id: `ra-${d}`, reviewerId: 'marco', decision: 'approve' as const, at: iso(day(d)), comment: 'Clear and practical.' },
    { id: `rb-${d}`, reviewerId: 'leah', decision: 'approve' as const, at: iso(day(d) + 2 * HOUR), comment: 'Checks are in the right places.' },
  ]
  const sopVersions: SopVersion[] = [
    v({ id: 'hk-reset-2', sopId: 'hk-reset', version: '2.1', status: 'superseded', code: 'HK-ROOM-RESET', title: 'Guest room reset', publishedAt: iso(day(-60)), effectiveAt: iso(day(-60)), steps: resetSteps.slice(0, 2), createdAt: iso(day(-64)), updatedAt: iso(day(-61)), reviews: approvals(-61) }),
    v({ id: 'hk-reset-3', sopId: 'hk-reset', version: '3.0', status: 'published', code: 'HK-ROOM-RESET', title: 'Guest room reset', baseVersionId: 'hk-reset-2',
      tags: ['roomcare', 'reset'], publishedAt: iso(day(-12)), effectiveAt: iso(day(-12)), createdAt: iso(day(-16)), updatedAt: iso(day(-13)),
      reviews: [
        { id: 'r1', reviewerId: 'marco', decision: 'approve', at: iso(day(-13)), comment: 'Clear and short.' },
        { id: 'r2', reviewerId: 'leah', decision: 'approve', at: iso(day(-13)), comment: 'Verification step is right.' },
      ] }),
    v({ id: 'hk-turndown-1', sopId: 'hk-turndown', version: '1.2', status: 'published', code: 'HK-TURNDOWN', title: 'Evening turndown', timeTargetMin: 12,
      publishedAt: iso(day(-30)), effectiveAt: iso(day(-30)), tags: ['guestcare', 'evening'], createdAt: iso(day(-34)), updatedAt: iso(day(-31)), reviews: approvals(-31),
      steps: [
        step('t1', 'door', 'Knock twice, announce turndown, wait ten seconds before entering.'),
        step('t2', 'moon', 'Fold back the bed, set slippers and the night card, dim the lights to the evening scene.', { guestCare: 'Leave personal items exactly where they are.' }),
        step('t3', 'check', 'Close the curtains and confirm the room is calm and tidy.'),
      ] }),
    v({ id: 'hk-minibar-1', sopId: 'hk-minibar', version: '1.1', status: 'published', code: 'HK-MINIBAR', title: 'Minibar audit and restock', timeTargetMin: 6,
      publishedAt: iso(day(-21)), effectiveAt: iso(day(-21)), tags: ['minibar', 'revenue'], createdAt: iso(day(-25)), updatedAt: iso(day(-22)), reviews: approvals(-22),
      steps: [
        step('m1', 'eye', 'Count every item against the par sheet; note anything consumed.'),
        step('m2', 'food', 'Check expiry dates; remove anything within 7 days of expiry.', { guestCare: 'Never restock an item the guest has moved aside.' }),
        step('m3', 'cart', 'Restock to par with labels facing out and cold items at the back.'),
        step('m4', 'clipboard', 'Post consumption to the room folio before leaving the floor.', { requireCheck: true }),
      ] }),
    v({ id: 'pa-lobby-1', sopId: 'pa-lobby', version: '2.0', status: 'published', code: 'PA-LOBBY-ROUND', title: 'Lobby and public area round', timeTargetMin: 20, jobRoleId: 'public-area',
      publishedAt: iso(day(-40)), effectiveAt: iso(day(-40)), tags: ['public', 'lobby'], createdAt: iso(day(-44)), updatedAt: iso(day(-41)), reviews: approvals(-41),
      steps: [
        step('l1', 'eye', 'Walk the lobby, lifts and washrooms in the posted route; note anything out of place.'),
        step('l2', 'spray', 'Polish glass, brass and touchpoints; empty bins that are over half full.'),
        step('l3', 'bath', 'Restock washroom paper, soap and towels; check for leaks.', { allowPhoto: true }),
        step('l4', 'clipboard', 'Sign the round sheet with time and initials.', { requireCheck: true }),
      ] }),
    v({ id: 'safe-spill-1', sopId: 'safe-spill', version: '1.0', status: 'published', code: 'SAFE-SPILL', title: 'Spill response in public areas', timeTargetMin: 10, jobRoleId: 'public-area',
      publishedAt: iso(day(-75)), effectiveAt: iso(day(-75)), tags: ['safety'], createdAt: iso(day(-79)), updatedAt: iso(day(-76)), reviews: approvals(-76),
      steps: [
        step('x1', 'alert', 'Place wet-floor signs on every approach before touching the spill.', { requireCheck: true }),
        step('x2', 'spray', 'Absorb, mop and dry the area; use the chemical kit only for unknown liquids.'),
        step('x3', 'clipboard', 'Log the spill, location and time in the incident sheet.', { requireCheck: true, allowPhoto: true }),
      ] }),
    v({ id: 'fo-checkin-1', sopId: 'fo-checkin', version: '1.4', status: 'published', code: 'FO-CHECKIN', title: 'Guest check-in', timeTargetMin: 8, jobRoleId: 'front-desk',
      publishedAt: iso(day(-18)), effectiveAt: iso(day(-18)), tags: ['frontoffice', 'arrival'], createdAt: iso(day(-22)), updatedAt: iso(day(-19)), reviews: approvals(-19),
      steps: [
        step('c1', 'bell', 'Greet within ten seconds, use the guest’s name from the arrival list.'),
        step('c2', 'case', 'Verify ID and payment; confirm length of stay and room preferences.', { requireCheck: true }),
        step('c3', 'door', 'Issue keys, explain Wi-Fi, breakfast and the lift location.'),
        step('c4', 'luggage', 'Hand over to the bell desk with the room number and piece count.'),
      ] }),
    v({ id: 'hk-102-1', sopId: 'hk-102', version: '1.0', status: 'in_review', code: 'HK-102', title: 'Prepare the trolley for a room reset', timeTargetMin: 8,
      tags: ['roomcare', 'trolley', 'safety'], submittedAt: iso(now - 3 * HOUR), createdAt: iso(day(-2)), updatedAt: iso(now - 3 * HOUR), catalogue: ['pilot', 'whole'],
      reviews: [{ id: 'r-102a', reviewerId: 'marco', decision: 'approve', at: iso(now - 2 * HOUR), comment: 'Good — matches the trolley photo.' }],
      steps: [
        step('p1', 'cart', 'Load linen, amenities, and chemicals on the shelves shown in the trolley photo.'),
        step('p2', 'shield', 'Lock chemical caps and keep them on the bottom shelf, away from guest reach.', { requireCheck: true }),
      ] }),
    v({ id: 'hk-deep-1', sopId: 'hk-deep', version: '1.0', status: 'changes_requested', code: 'HK-DEEP-CLEAN', title: 'Deep clean — checkout room', timeTargetMin: 45,
      tags: ['roomcare', 'deepclean'], submittedAt: iso(day(-1)), createdAt: iso(day(-4)), updatedAt: iso(day(-1)),
      reviews: [{ id: 'r-deep', reviewerId: 'leah', decision: 'request_changes', at: iso(day(-1) + 5 * HOUR), comment: 'Add the mattress-flip rota and the grout check before this goes out.' }],
      steps: [
        step('d1', 'door', 'Strip the room fully: linen, curtains to laundry, amenities to waste.'),
        step('d2', 'spray', 'Clean high to low: vents, lights, frames, then furniture inside and out.'),
        step('d3', 'bath', 'Descale bathroom fixtures; check sealant and replace shower curtain.', { allowPhoto: true }),
        step('d4', 'bed', 'Vacuum mattress and base; remake with fresh protector.'),
        step('d5', 'eye', 'Supervisor inspection with the deep-clean checklist.', { requireCheck: true }),
      ] }),
    v({ id: 'fo-news-1', sopId: 'fo-news', version: '1.0', status: 'published', code: 'FO-NEWSPAPER', title: 'Morning newspaper delivery', timeTargetMin: 25, jobRoleId: 'bellman',
      publishedAt: iso(day(-200)), effectiveAt: iso(day(-200)), tags: ['legacy'], createdAt: iso(day(-205)), updatedAt: iso(day(-201)), reviews: approvals(-201),
      steps: [step('n1', 'luggage', 'Collect papers at 6 AM and deliver to every occupied room by 7 AM.')] }),
  ]
  const sops: Sop[] = [
    { id: 'hk-reset', propertyId: P, code: 'HK-ROOM-RESET', currentVersionId: 'hk-reset-3', department: 'Housekeeping' },
    { id: 'hk-turndown', propertyId: P, code: 'HK-TURNDOWN', currentVersionId: 'hk-turndown-1', department: 'Housekeeping' },
    { id: 'hk-minibar', propertyId: P, code: 'HK-MINIBAR', currentVersionId: 'hk-minibar-1', department: 'Housekeeping' },
    { id: 'pa-lobby', propertyId: P, code: 'PA-LOBBY-ROUND', currentVersionId: 'pa-lobby-1', department: 'Public areas' },
    { id: 'safe-spill', propertyId: P, code: 'SAFE-SPILL', currentVersionId: 'safe-spill-1', department: 'Safety' },
    { id: 'fo-checkin', propertyId: P, code: 'FO-CHECKIN', currentVersionId: 'fo-checkin-1', department: 'Front office' },
    { id: 'hk-102', propertyId: P, code: 'HK-102', currentVersionId: null, department: 'Housekeeping' },
    { id: 'hk-deep', propertyId: P, code: 'HK-DEEP-CLEAN', currentVersionId: null, department: 'Housekeeping' },
    { id: 'fo-news', propertyId: P, code: 'FO-NEWSPAPER', currentVersionId: 'fo-news-1', department: 'Front office', retiredAt: iso(day(-20)), retiredById: 'amina' },
  ]

  // ── Shifts & rooms ────────────────────────────────────────────────────────
  const shifts: Shift[] = [
    { id: 'morning', propertyId: P, name: 'Morning', start: iso(mid + 6 * HOUR), end: iso(mid + 14 * HOUR), staffTarget: 5, team: 'Housekeeping & Bell desk', memberIds: ['maya', 'kasun', 'priya', 'arjun', 'vikram'] },
    { id: 'afternoon', propertyId: P, name: 'Afternoon', start: iso(mid + 14 * HOUR), end: iso(mid + 22 * HOUR), staffTarget: 4, team: 'Housekeeping & Bell desk', memberIds: ['dilani', 'ravi', 'farah', 'tharindu'] },
    { id: 'night', propertyId: P, name: 'Night', start: iso(mid + 22 * HOUR), end: iso(mid + 30 * HOUR), staffTarget: 2, team: 'Housekeeping & Bell desk', memberIds: ['nimal', 'omar'] },
  ]
  // Maya always works the live shift in the demo so her Today view has something real.
  const live = shifts.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end)) ?? shifts[0]
  if (!live.memberIds.includes('maya')) live.memberIds.unshift('maya')
  // A second room attendant on the live shift carries the "colleague" rooms.
  const mate = live.memberIds.find((id) => id !== 'maya' && ['kasun', 'dilani', 'ravi', 'nimal'].includes(id)) ?? 'kasun'
  if (!live.memberIds.includes(mate)) live.memberIds.push(mate)

  const OCC: Occupancy[] = ['occupied', 'occupied', 'due_out', 'vacant_dirty', 'arrival', 'vacant_clean', 'occupied', 'due_out']
  const GUESTS = ['Mr & Mrs Iyer', 'Ms Tanaka', 'Mr Okafor', 'The Lindqvist family', 'Dr Perera', 'Mr Haddad', 'Ms Rossi', 'Mr Chen', 'Mrs Fernando', 'Mr Novak']
  const rooms: Room[] = []
  for (let f = 1; f <= 3; f++) for (let n = 1; n <= 20; n++) {
    const number = `${f}${String(n).padStart(2, '0')}`, i = f * 20 + n
    const occupancy: Occupancy = number === '217' ? 'out_of_order' : OCC[Math.floor(rnd(i) * OCC.length)]
    rooms.push({
      id: `r${number}`, propertyId: P, number, floor: f, wing: n <= 10 ? 'West' : 'East',
      type: n === 20 ? 'Ocean Suite' : n % 5 === 0 ? 'Premier King' : n % 2 ? 'Deluxe King' : 'Deluxe Twin',
      occupancy, vip: (f === 3 && n >= 5 && n <= 18 && n % 4 === 1) || number === '120',
      guestName: occupancy === 'occupied' || occupancy === 'due_out' || occupancy === 'arrival' ? GUESTS[i % GUESTS.length] : undefined,
      yesterdayAttendantId: ['maya', 'kasun', 'dilani', 'ravi'][i % 4],
    })
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const target: Record<string, number> = { 'hk-reset-3': 27, 'hk-reset-2': 27, 'hk-turndown-1': 12, 'hk-minibar-1': 6, 'pa-lobby-1': 20, 'safe-spill-1': 10, 'fo-checkin-1': 8 }
  const stepsOf = (vid: string) => sopVersions.find((x) => x.id === vid)!.steps.map((s) => s.id)
  const task = (id: string, roomId: string, startMs: number, o: Partial<Task> = {}): Task => {
    const vid = o.sopVersionId ?? 'hk-reset-3'
    return {
      id, propertyId: P, shiftId: live.id, personId: 'maya', roomId, sopVersionId: vid,
      start: iso(startMs), end: iso(startMs + (target[vid] ?? 27) * MIN), priority: 'standard', status: 'scheduled',
      doneStepIds: [], photoStepIds: [], mode: 'guided', assignedById: 'elena', reviewedVersionConfirmed: true, ...o,
    }
  }
  const tasks: Task[] = [
    task('t-114', 'r114', now - 2 * MIN, { priority: 'urgent' }),
    task('t-208', 'r208', now + 40 * MIN),
    task('t-312', 'r312', now + 85 * MIN, { priority: 'high', notes: 'VIP arrival at 4 PM — fresh flowers on the desk.' }),
    task('t-305', 'r305', now - 3 * HOUR, { status: 'done', doneStepIds: ['s1', 's2', 's3'], startedAt: iso(now - 3 * HOUR), completedAt: iso(now - 2.5 * HOUR), verifiedById: 'elena', verifiedAt: iso(now - 2.4 * HOUR),
      urgentEnded: { at: iso(now - 20 * MIN), reason: "It's been pending for too long", seen: false } }),
    task('t-m5', 'r309', now - 100 * MIN, { sopVersionId: 'hk-minibar-1', status: 'done', doneStepIds: stepsOf('hk-minibar-1'), startedAt: iso(now - 100 * MIN), completedAt: iso(now - 94 * MIN), verifiedById: 'elena', verifiedAt: iso(now - 80 * MIN) }),
    task('t-k1', 'r101', now - 4 * HOUR, { personId: mate, status: 'done', doneStepIds: ['s1', 's2', 's3'], startedAt: iso(now - 4 * HOUR), completedAt: iso(now - 3.4 * HOUR), verifiedById: 'elena', verifiedAt: iso(now - 3.3 * HOUR) }),
    task('t-k2', 'r120', now - 30 * MIN, { personId: mate, status: 'in_progress', doneStepIds: ['s1'], startedAt: iso(now - 30 * MIN) }),
    task('t-k3', 'r209', now - 70 * MIN, { personId: mate, status: 'awaiting_verification', doneStepIds: ['s1', 's2', 's3'], startedAt: iso(now - 70 * MIN) }),
    task('t-k4', 'r215', now - 150 * MIN, { personId: mate, status: 'scheduled', priority: 'high' }), // overdue
    task('t-k5', 'r118', now + 30 * MIN, { personId: mate }),
    task('t-k6', 'r106', now - 4.6 * HOUR, { personId: mate, status: 'cancelled', cancelled: { byId: 'elena', at: iso(now - 4.5 * HOUR), reason: 'Guest extended stay — do not disturb' } }),
  ]
  // History across the last 14 days for Team progress / SOP results.
  const crew = ['maya', 'kasun', 'dilani', 'ravi']
  const mix = ['hk-reset-3', 'hk-reset-3', 'hk-turndown-1', 'hk-minibar-1']
  for (let d = 1; d <= 14; d++) {
    crew.forEach((pid, i) => {
      for (let k = 0; k < 4; k++) {
        const s = day(-d) + (7 + k * 1.6 + i * 0.25) * HOUR
        const vid = d > 11 && mix[k] === 'hk-reset-3' ? 'hk-reset-2' : mix[k]
        const tgt = target[vid]
        const dur = Math.max(3, Math.round(tgt * (0.8 + rnd(d * 31 + i * 7 + k) * 0.5))) // 80–130% of target
        tasks.push(task(`h-${d}-${pid}-${k}`, rooms[(d * 3 + i * 5 + k * 7) % rooms.length].id, s, {
          personId: pid, shiftId: i < 2 ? 'morning' : 'afternoon', status: 'done', doneStepIds: stepsOf(vid), sopVersionId: vid,
          startedAt: iso(s), completedAt: iso(s + dur * MIN), verifiedById: 'elena', verifiedAt: iso(s + (dur + 6) * MIN),
          priority: (d + k) % 9 === 0 ? 'urgent' : (d + k) % 5 === 0 ? 'high' : 'standard',
        }))
      }
    })
    // Public-area rounds by Priya
    const ps = day(-d) + 9 * HOUR, pd = Math.round(20 * (0.85 + rnd(d * 13) * 0.4))
    tasks.push(task(`h-${d}-priya`, 'r101', ps, { personId: 'priya', shiftId: 'morning', sopVersionId: 'pa-lobby-1', status: 'done', doneStepIds: stepsOf('pa-lobby-1'), startedAt: iso(ps), completedAt: iso(ps + pd * MIN), verifiedById: 'elena', verifiedAt: iso(ps + (pd + 5) * MIN) }))
  }

  // ── Acknowledgments ───────────────────────────────────────────────────────
  const ackEvents: AckEvent[] = [
    { id: 'a1', propertyId: P, personId: 'maya', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-11)), acknowledgedAt: iso(9 * HOUR + day(-11) + 4 * MIN) },
    { id: 'a2', propertyId: P, personId: 'kasun', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-10)), acknowledgedAt: iso(9 * HOUR + day(-10) + 9 * MIN) },
    { id: 'a3', propertyId: P, personId: 'dilani', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-3)), acknowledgedAt: null },
    { id: 'a4', propertyId: P, personId: 'ravi', kind: 'sop', refId: 'hk-reset-3', openedAt: null, acknowledgedAt: null },
    { id: 'a5', propertyId: P, personId: 'maya', kind: 'sop', refId: 'hk-turndown-1', openedAt: iso(9 * HOUR + day(-20)), acknowledgedAt: iso(9 * HOUR + day(-20) + 2 * MIN) },
    { id: 'a6', propertyId: P, personId: 'nimal', kind: 'sop', refId: 'hk-turndown-1', openedAt: iso(9 * HOUR + day(-2)), acknowledgedAt: iso(9 * HOUR + day(-2) + 3 * MIN) },
    { id: 'a7', propertyId: P, personId: 'sara', kind: 'sop', refId: 'hk-reset-3', openedAt: iso(9 * HOUR + day(-1)), acknowledgedAt: iso(9 * HOUR + day(-1) + 6 * MIN) },
    { id: 'a8', propertyId: P, personId: 'maya', kind: 'sop', refId: 'hk-minibar-1', openedAt: iso(8 * HOUR + day(-19)), acknowledgedAt: iso(8 * HOUR + day(-19) + 3 * MIN) },
    { id: 'a9', propertyId: P, personId: 'kasun', kind: 'sop', refId: 'hk-minibar-1', openedAt: iso(8 * HOUR + day(-18)), acknowledgedAt: iso(8 * HOUR + day(-18) + 5 * MIN) },
    { id: 'a10', propertyId: P, personId: 'priya', kind: 'sop', refId: 'pa-lobby-1', openedAt: iso(8 * HOUR + day(-39)), acknowledgedAt: iso(8 * HOUR + day(-39) + 7 * MIN) },
    { id: 'a11', propertyId: P, personId: 'priya', kind: 'sop', refId: 'safe-spill-1', openedAt: iso(8 * HOUR + day(-70)), acknowledgedAt: iso(8 * HOUR + day(-70) + 4 * MIN) },
    { id: 'a12', propertyId: P, personId: 'tharindu', kind: 'sop', refId: 'fo-checkin-1', openedAt: iso(8 * HOUR + day(-17)), acknowledgedAt: iso(8 * HOUR + day(-17) + 6 * MIN) },
    { id: 'a13', propertyId: P, personId: 'ishara', kind: 'sop', refId: 'fo-checkin-1', openedAt: iso(8 * HOUR + day(-6)), acknowledgedAt: null },
  ]

  // ── Notices ───────────────────────────────────────────────────────────────
  const notices: Notice[] = [
    { id: 'n-vip', propertyId: P, title: 'VIP arrival on floor 3', body: 'A VIP family arrives at 2 PM. Rooms 305–318 must be verified by 1:30 PM. Reply when your rooms are ready.',
      replyNeeded: true, sample: true, audience: 'team', teamShiftId: live.id, recipientIds: [], sentAt: null, priority: 'important' },
    { id: 'n-lift', propertyId: P, title: 'Service lift B closed until noon', body: 'Use lift A for trolleys this morning. No reply needed.',
      replyNeeded: false, sample: true, audience: 'team', teamShiftId: live.id, recipientIds: live.memberIds, sentAt: iso(now - 2 * HOUR), sentById: 'elena', priority: 'normal' },
    { id: 'n-fire', propertyId: P, title: 'Fire drill Thursday 10:30 AM', body: 'Assemble at point B by the staff car park. Leave trolleys outside rooms with doors closed. Reply to confirm you have read the route.',
      replyNeeded: true, sample: true, audience: 'team', teamShiftId: live.id, recipientIds: live.memberIds, sentAt: iso(day(-1) + 10 * HOUR), sentById: 'marco', priority: 'urgent' },
    { id: 'n-linen', propertyId: P, title: 'New linen supplier from Monday', body: 'Pillowcases now come folded in threes. Par levels on the trolley sheet are unchanged.',
      replyNeeded: false, sample: true, audience: 'team', teamShiftId: 'morning', recipientIds: shifts[0].memberIds, sentAt: iso(day(-3) + 9 * HOUR), sentById: 'elena', priority: 'normal' },
  ]
  ackEvents.push({ id: 'a-n1', propertyId: P, personId: mate, kind: 'notice', refId: 'n-lift', openedAt: iso(now - 100 * MIN), acknowledgedAt: null })
  ackEvents.push({ id: 'a-n2', propertyId: P, personId: mate, kind: 'notice', refId: 'n-fire', openedAt: iso(day(-1) + 11 * HOUR), acknowledgedAt: iso(day(-1) + 11 * HOUR), repliedAt: iso(day(-1) + 11 * HOUR), reply: 'Read — I know the route.' })

  // ── Attendance ────────────────────────────────────────────────────────────
  const attendance: Attendance[] = []
  for (let d = 1; d <= 28; d++) {
    const ms = day(-d)
    if (new Date(ms).getUTCDay() === 0) continue
    crew.forEach((pid, i) => {
      if ((d + i) % 6 === 0) return
      const mark = (d + i) % 11 === 0 ? 'extra' : (d + i) % 13 === 0 ? 'pending' : 'checkin'
      attendance.push({ id: `at-${pid}-${d}`, propertyId: P, personId: pid, date: hotelDateKey(ms + 7 * HOUR), mark, at: iso(ms + 6 * HOUR + i * MIN) })
    })
  }
  live.memberIds.filter((id) => id !== 'maya').slice(0, -1).forEach((pid, i) =>
    attendance.push({ id: `at-${pid}-today`, propertyId: P, personId: pid, date: hotelDateKey(now), mark: 'checkin', at: iso(Date.parse(live.start) + (2 + i * 4) * MIN) }))

  const cover: CoverItem[] = [
    { id: 'c1', propertyId: P, kind: 'time_off', personId: 'dilani', shiftId: 'afternoon', date: hotelDateKey(day(3)), note: 'Family event', status: 'pending' },
    { id: 'c2', propertyId: P, kind: 'time_off', personId: 'ravi', shiftId: 'afternoon', date: hotelDateKey(day(5)), note: 'Medical appointment', status: 'pending' },
    { id: 'c3', propertyId: P, kind: 'arrival', personId: 'kasun', shiftId: 'morning', date: hotelDateKey(now), note: 'Checked in 14 min late — bus delay', status: 'pending' },
    { id: 'c4', propertyId: P, kind: 'arrival', personId: 'nimal', shiftId: 'night', date: hotelDateKey(day(-1)), note: 'Check-in without device location', status: 'pending' },
    { id: 'c5', propertyId: P, kind: 'early_departure', personId: 'ravi', shiftId: 'afternoon', date: hotelDateKey(day(-1)), note: 'Left 40 min early — unwell', status: 'pending' },
    { id: 'c6', propertyId: P, kind: 'early_close', personId: 'dilani', shiftId: 'afternoon', date: hotelDateKey(day(-2)), note: 'Closed shift with 1 room unverified', status: 'pending' },
    { id: 'c7', propertyId: P, kind: 'ended', personId: 'kasun', shiftId: 'morning', date: hotelDateKey(day(-1)), note: 'Ended normally · 8 rooms', status: 'approved' },
    { id: 'c8', propertyId: P, kind: 'time_off', personId: 'priya', shiftId: 'morning', date: hotelDateKey(day(-6)), note: 'Annual leave', status: 'approved' },
    { id: 'c9', propertyId: P, kind: 'backup', personId: 'sara', backupId: 'nimal', shiftId: 'night', date: hotelDateKey(day(-4)), note: 'Backup approved', status: 'approved' },
  ]

  const feedback: Feedback[] = [
    { id: 'f1', propertyId: P, lane: 'suggestion', sopVersionId: 'hk-reset-3', stepId: 's2', fromId: 'kasun', text: 'Step 2: say "restock minibar" explicitly — new staff skip it.', at: iso(day(-2)), status: 'open' },
    { id: 'f2', propertyId: P, lane: 'manager_request', sopVersionId: 'hk-reset-3', fromId: 'elena', text: 'Please add a step for checking the safe is left open and empty on checkout rooms.', at: iso(day(-1)), status: 'open' },
    { id: 'f3', propertyId: P, lane: 'suggestion', sopVersionId: 'hk-turndown-1', stepId: 't2', fromId: 'maya', text: 'Night card holders moved to the drawer.', at: iso(day(-9)), status: 'done' },
    { id: 'f4', propertyId: P, lane: 'rating', sopVersionId: 'hk-minibar-1', fromId: 'maya', rating: 5, text: 'Quick and clear.', at: iso(day(-4)), status: 'done' },
    { id: 'f5', propertyId: P, lane: 'rating', sopVersionId: 'hk-reset-3', fromId: 'dilani', rating: 4, text: 'Good, but step 2 does a lot at once.', at: iso(day(-3)), status: 'open' },
    { id: 'f6', propertyId: P, lane: 'suggestion', sopVersionId: 'pa-lobby-1', stepId: 'l3', fromId: 'priya', text: 'Washroom near the spa needs its own line — it is off the route.', at: iso(day(-5)), status: 'open' },
  ]

  const joinRequests: JoinRequest[] = [
    { id: 'j1', propertyId: P, name: 'Anushka Peiris', jobRoleId: 'room-attendant', shiftId: 'morning', at: iso(now - 5 * HOUR), status: 'pending' },
    { id: 'j2', propertyId: P, name: 'Ben Okafor', jobRoleId: 'public-area', shiftId: 'night', at: iso(day(-1)), status: 'pending' },
    { id: 'j3', propertyId: P, name: 'Rohan Das', jobRoleId: 'bellman', shiftId: 'afternoon', at: iso(day(-2)), status: 'pending' },
  ]

  // ── Incidents ─────────────────────────────────────────────────────────────
  const issue = (o: Partial<Issue> & Pick<Issue, 'id' | 'title' | 'category' | 'severity' | 'reportedById' | 'status' | 'at'>): Issue => ({
    propertyId: P, text: o.title, updates: [{ at: o.at, byId: o.reportedById, text: 'Reported', status: 'open' }], ...o,
  })
  const issues: Issue[] = [
    issue({ id: 'is-1', title: 'Bathroom tap leaking', text: 'Cold tap in the bathroom drips constantly; towel placed under it.', category: 'maintenance', severity: 'high', roomId: 'r208', reportedById: 'maya', status: 'in_progress', assignedToId: 'suresh', at: iso(now - 95 * MIN),
      updates: [{ at: iso(now - 95 * MIN), byId: 'maya', text: 'Reported', status: 'open' }, { at: iso(now - 80 * MIN), byId: 'elena', text: 'Assigned to Suresh — parts on the way', status: 'in_progress' }] }),
    issue({ id: 'is-2', title: 'Guest left a watch in the safe', text: 'Silver watch found in the safe after checkout. Bagged and handed to the duty manager.', category: 'lost_found', severity: 'medium', roomId: 'r209', reportedById: mate, status: 'open', at: iso(now - 50 * MIN), taskId: 't-k3' }),
    issue({ id: 'is-3', title: 'Out of bath amenities on trolley 2', text: 'Shampoo and body lotion gone on trolley 2; floor 2 rooms waiting.', category: 'supplies', severity: 'medium', reportedById: mate, status: 'open', at: iso(now - 25 * MIN) }),
    issue({ id: 'is-4', title: 'Wet floor near lift A', text: 'Spill from a room-service tray. Signs placed and floor dried.', category: 'safety', severity: 'high', reportedById: 'priya', status: 'resolved', at: iso(day(-1) + 11 * HOUR), resolvedAt: iso(day(-1) + 11.4 * HOUR), resolvedById: 'nadia',
      updates: [{ at: iso(day(-1) + 11 * HOUR), byId: 'priya', text: 'Reported', status: 'open' }, { at: iso(day(-1) + 11.4 * HOUR), byId: 'nadia', text: 'Area dry and signs removed', status: 'resolved' }] }),
    issue({ id: 'is-5', title: 'Guest asked for late checkout', text: 'Guest in 114 asked for a 2 PM checkout; front desk confirmed.', category: 'guest', severity: 'low', roomId: 'r114', reportedById: 'maya', status: 'resolved', at: iso(day(-2) + 9 * HOUR), resolvedAt: iso(day(-2) + 9.2 * HOUR), resolvedById: 'elena',
      updates: [{ at: iso(day(-2) + 9 * HOUR), byId: 'maya', text: 'Reported', status: 'open' }, { at: iso(day(-2) + 9.2 * HOUR), byId: 'elena', text: 'Front desk approved 2 PM', status: 'resolved' }] }),
    issue({ id: 'is-6', title: 'Air-con noisy in 217', text: 'Compressor rattles loudly; room blocked as out of order.', category: 'maintenance', severity: 'critical', roomId: 'r217', reportedById: 'dilani', status: 'in_progress', assignedToId: 'suresh', at: iso(day(-1) + 16 * HOUR),
      updates: [{ at: iso(day(-1) + 16 * HOUR), byId: 'dilani', text: 'Reported', status: 'open' }, { at: iso(day(-1) + 16.5 * HOUR), byId: 'nadia', text: 'Room set out of order; vendor visit booked', status: 'in_progress' }] }),
  ]

  // ── Audit trail ───────────────────────────────────────────────────────────
  const audit: AuditEntry[] = [
    { id: 'au0', propertyId: P, actorId: 'amina', action: 'sop.submitted', detail: 'HK-102 1.0 sent for review', at: iso(now - 3 * HOUR) },
    { id: 'au0b', propertyId: P, actorId: 'marco', action: 'sop.review.approve', detail: 'HK-102 1.0', at: iso(now - 2 * HOUR) },
    { id: 'au0c', propertyId: P, actorId: 'elena', action: 'task.verified', detail: 't-305', at: iso(now - 2.4 * HOUR) },
    { id: 'au0d', propertyId: P, actorId: 'elena', action: 'task.cancelled', detail: 't-k6: Guest extended stay — do not disturb', at: iso(now - 4.5 * HOUR) },
    { id: 'au0e', propertyId: P, actorId: 'leah', action: 'sop.review.request_changes', detail: 'HK-DEEP-CLEAN 1.0', at: iso(day(-1) + 5 * HOUR) },
    { id: 'au0f', propertyId: P, actorId: 'marco', action: 'notice.sent', detail: 'Fire drill Thursday 10:30 AM', at: iso(day(-1) + 10 * HOUR) },
    { id: 'au1', propertyId: P, actorId: 'amina', action: 'sop.released', detail: 'HK-ROOM-RESET 3.0', at: iso(day(-12)) },
    { id: 'au1b', propertyId: P, actorId: 'amina', action: 'sop.released', detail: 'FO-CHECKIN 1.4', at: iso(day(-18)) },
    { id: 'au1c', propertyId: P, actorId: 'amina', action: 'sop.retired', detail: 'FO-NEWSPAPER', at: iso(day(-20)) },
    { id: 'au1d', propertyId: P, actorId: 'amina', action: 'sop.released', detail: 'HK-MINIBAR 1.1', at: iso(day(-21)) },
    { id: 'au1e', propertyId: P, actorId: 'amina', action: 'sop.released', detail: 'HK-TURNDOWN 1.2', at: iso(day(-30)) },
  ].sort((a, b) => b.at.localeCompare(a.at))

  return { properties: [PROPERTY], accounts, jobRoles, people, sops, sopVersions, shifts, rooms, tasks, ackEvents, notices, attendance, cover, feedback, joinRequests, issues, audit }
}

export type Seed = ReturnType<typeof buildSeed>
