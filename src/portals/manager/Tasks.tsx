import clsx from 'clsx'
import { ArrowRightLeft, ClipboardList, Crown, ShieldCheck, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, DataTable, EmptyState, PageHeader, Segmented, Tabs, type Column } from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fLongDate, hotelDateKey } from '@/lib/time'
import { prompt, toast } from '@/lib/toast'
import type { Task } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { verifyAs } from './actions'
import { FilterChip, FilterSelect, OccupancyChip, PersonCell, PriorityBadge, TaskStatusBadge, useLookups, useQueryParam } from './components'
import { DAY, PRIORITY, fWindow, isOpen, isOverdue, liveShiftAt, taskState, taskTiming } from './model'
import { ReassignDialog, TaskDrawer, useTaskActions } from './TaskDrawer'

type StatusTab = 'all' | 'awaiting_verification' | 'overdue' | 'in_progress' | 'scheduled' | 'done' | 'cancelled'
const ATTENTION: Record<string, number> = { awaiting_verification: 0, returned: 1, overdue: 1, in_progress: 2, ready: 3, scheduled: 3, done: 4, cancelled: 5 }

export function ManagerTasks() {
  const now = useNow(15_000)
  const nav = useNavigate()
  const { tasks, shifts, people, sopVersions } = useDB()
  const { person: me } = usePersona('manager')
  const L = useLookups()
  const A = useTaskActions()
  const [taskId, setTaskId] = useQueryParam('task')
  const [roomId, setRoomId] = useQueryParam('room')
  const [status, setStatus] = useQueryParam('status')
  const [scope, setScope] = useQueryParam('scope')
  const [shift, setShift] = useState('')
  const [staff, setStaff] = useState('')
  const [sop, setSop] = useState('')
  const [priority, setPriority] = useState('')
  const [reassign, setReassign] = useState<{ tasks: Task[]; done?: () => void } | null>(null)
  const live = liveShiftAt(now, shifts)
  const days = scope === '14' ? 14 : scope === '7' ? 7 : 1
  const tab = (status || 'all') as StatusTab

  const scoped = useMemo(() => {
    const today = hotelDateKey(now)
    const from = hotelDateKey(now - (days - 1) * DAY)
    return tasks.filter((t) => { const k = hotelDateKey(t.start); return days === 1 ? k === today : k >= from && k <= today })
  }, [tasks, now, days])

  const filtered = scoped.filter((t) => (!roomId || t.roomId === roomId) && (!shift || t.shiftId === shift) && (!staff || t.personId === staff)
    && (!sop || byId(sopVersions, t.sopVersionId)?.sopId === sop) && (!priority || t.priority === priority))
  const matches = (t: Task, s: StatusTab) => s === 'all' || (s === 'overdue' ? isOverdue(t, now) : s === 'in_progress' ? t.status === 'in_progress' : t.status === s)
  const rows = filtered.filter((t) => matches(t, tab))
    .sort((a, b) => ATTENTION[taskState(a, now).key] - ATTENTION[taskState(b, now).key] || PRIORITY[b.priority].rank - PRIORITY[a.priority].rank || a.start.localeCompare(b.start))
  const count = (s: StatusTab) => filtered.filter((t) => matches(t, s)).length

  const staffOptions = [...new Set(scoped.map((t) => t.personId))].map((id) => byId(people, id)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  const sopOptions = [...new Map(scoped.map((t) => { const v = byId(sopVersions, t.sopVersionId)!; return [v.sopId, v] as const })).values()]
  const room = L.room(roomId)
  const anyFilter = !!(shift || staff || sop || priority || roomId)

  const columns: Column<Task>[] = [
    { key: 'room', header: 'Room', sort: (t) => L.room(t.roomId)?.number, csv: (t) => L.room(t.roomId)?.number, cell: (t) => { const r = L.room(t.roomId); return (
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-semibold tabular text-ink">{r?.number}{r?.vip && <Crown size={12} className="text-gold-700" aria-label="VIP" />}</div>
        <div className="truncate text-xs text-muted">{r?.type}</div>
      </div>) } },
    { key: 'guest', header: 'Guest', hideOnMobile: true, sort: (t) => L.room(t.roomId)?.guestName ?? '', csv: (t) => L.room(t.roomId)?.guestName ?? L.room(t.roomId)?.occupancy, cell: (t) => { const r = L.room(t.roomId); return (
      <div className="min-w-0 max-w-[150px]"><div className="truncate text-sm text-ink">{r?.guestName ?? <span className="text-muted">No guest</span>}</div><OccupancyChip occ={r?.occupancy} /></div>) } },
    { key: 'staff', header: 'Staff', sort: (t) => L.name(t.personId), csv: (t) => L.name(t.personId), cell: (t) => <div className="max-w-[150px]"><PersonCell person={L.person(t.personId)} size={22} /></div> },
    { key: 'sop', header: 'SOP', hideOnMobile: true, sort: (t) => L.version(t.sopVersionId)?.code, csv: (t) => { const v = L.version(t.sopVersionId); return `${v?.code} v${v?.version}` }, cell: (t) => { const v = L.version(t.sopVersionId); return (
      <div className="min-w-0 whitespace-nowrap"><div className="text-xs font-semibold text-ink">{v?.code}</div><div className="text-xs text-muted">v{v?.version}</div></div>) } },
    { key: 'window', header: 'Window', hideOnMobile: true, sort: (t) => t.start, csv: (t) => fWindow(t), cell: (t) => <span className="whitespace-nowrap text-sm tabular text-ink-2">{days > 1 && <span className="text-muted">{hotelDateKey(t.start).slice(5)} · </span>}{fWindow(t)}</span> },
    { key: 'status', header: 'Status', sort: (t) => ATTENTION[taskState(t, now).key], csv: (t) => taskState(t, now).label, cell: (t) => <TaskStatusBadge task={t} now={now} /> },
    { key: 'priority', header: 'Priority', hideOnMobile: true, sort: (t) => PRIORITY[t.priority].rank, csv: (t) => PRIORITY[t.priority].label, cell: (t) => <PriorityBadge priority={t.priority} hideStandard /> },
    { key: 'elapsed', header: 'Time', align: 'right', hideOnMobile: true, sort: (t) => taskTiming(t, L.version(t.sopVersionId), now).elapsed ?? -1,
      csv: (t) => { const x = taskTiming(t, L.version(t.sopVersionId), now); return x.elapsed == null ? '' : `${x.elapsed}/${x.target}` },
      cell: (t) => { const x = taskTiming(t, L.version(t.sopVersionId), now); return x.elapsed == null ? <span className="whitespace-nowrap text-xs text-muted">—/{x.target}m</span> : (
        <span className="whitespace-nowrap text-sm" aria-label={`${x.elapsed} of ${x.target} minutes`}><b className={clsx('tabular', x.over ? 'text-danger' : 'text-ink')}>{x.elapsed}</b><span className="text-muted">/{x.target}m</span></span>) } },
    { key: 'go', header: '', align: 'right', cell: (t) => A.canVerify(t) ? (
      <Button size="xs" variant="primary" onClick={(e) => { e.stopPropagation(); A.verify(t) }} aria-label={`Verify room ${L.room(t.roomId)?.number}`}>Verify</Button>
    ) : null },
  ]

  const bulkVerify = (sel: Task[], clear: () => void) => {
    const ready = sel.filter((t) => t.status === 'awaiting_verification')
    let ok = 0; const refused: string[] = []
    ready.forEach((t) => { const r = verifyAs(t.id, me?.id ?? 'elena'); if (r.ok) ok++; else refused.push(L.room(t.roomId)?.number ?? '') })
    const skipped = sel.length - ok
    if (ok) toast.success(`${ok} room${ok === 1 ? '' : 's'} verified`, { description: skipped ? `${skipped} skipped — not waiting for verification${refused.length ? ` or your own (${refused.join(', ')})` : ''}.` : undefined })
    else toast.error('Nothing to verify', { description: 'None of the selected rooms are waiting for verification.' })
    clear()
  }
  const bulkCancel = async (sel: Task[], clear: () => void) => {
    const open = sel.filter(isOpen)
    if (!open.length) { toast.error('Nothing to cancel', { description: 'The selected rooms are already finished or cancelled.' }); return }
    const reason = await prompt({ title: `Cancel ${open.length} room${open.length === 1 ? '' : 's'}?`, body: 'They come off staff lists straight away. This can’t be undone.', input: { label: 'Reason', placeholder: 'e.g. Floor closed for a private event', required: true }, confirmLabel: `Cancel ${open.length}`, cancelLabel: 'Keep tasks', tone: 'danger' })
    if (!reason) return
    let ok = 0
    open.forEach((t) => { if (useDB.getState().cancelTask(t.id, me?.id ?? 'elena', reason)) ok++ })
    toast.success(`${ok} room${ok === 1 ? '' : 's'} cancelled`, { description: sel.length - ok ? `${sel.length - ok} skipped — already finished or cancelled.` : reason })
    clear()
  }

  const clearAll = () => nav('/manager/tasks' + (scope ? `?scope=${scope}` : ''), { replace: true })
  const done = scoped.filter((t) => t.status === 'done').length

  return (
    <div>
      <PageHeader title="Live tasks" description="Every room on the list — check it, move it or chase it without leaving the table."
        meta={<><span>{fLongDate(now)}</span><span>{live ? `${live.name} shift live` : 'Between shifts'}</span><span className="tabular">{scoped.length} tasks · {done} done · {count('awaiting_verification')} awaiting check · {count('overdue')} overdue</span></>}
        actions={<>
          <Segmented size="sm" value={scope || '1'} onChange={(v) => setScope(v === '1' ? null : v)} items={[{ id: '1', label: 'Today' }, { id: '7', label: '7 days' }, { id: '14', label: '14 days' }]} />
          <Link to="/manager/assign-rooms"><Button variant="primary" icon={ClipboardList}>Assign work</Button></Link>
        </>}>
        <Tabs value={tab} onChange={(v) => setStatus(v === 'all' ? null : v)} items={[
          { id: 'all', label: 'All', count: count('all') },
          { id: 'awaiting_verification', label: 'Awaiting verification', count: count('awaiting_verification') },
          { id: 'overdue', label: 'Overdue', count: count('overdue') },
          { id: 'in_progress', label: 'In progress', count: count('in_progress') },
          { id: 'scheduled', label: 'Scheduled', count: count('scheduled') },
          { id: 'done', label: 'Done', count: count('done') },
          { id: 'cancelled', label: 'Cancelled', count: count('cancelled') },
        ]} />
      </PageHeader>

      <DataTable rows={rows} columns={columns} rowKey={(t) => t.id} pageSize={15} caption="Tasks"
        onRowClick={(t) => setTaskId(t.id)} rowClassName={(t) => (t.id === taskId ? 'bg-forest-50/70' : undefined)}
        search={(t) => { const r = L.room(t.roomId); const v = L.version(t.sopVersionId); return `${r?.number} ${r?.guestName ?? ''} ${r?.type ?? ''} ${L.name(t.personId)} ${v?.code} ${v?.title}` }}
        searchPlaceholder="Search room, guest, staff or SOP" exportName={`tasks-${hotelDateKey(now)}`}
        filters={<>
          {room && <FilterChip label={`Room ${room.number}`} onClear={() => setRoomId(null)} />}
          <FilterSelect label="Shift" value={shift} onChange={setShift}><option value="">All shifts</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === live?.id ? ' (live)' : ''}</option>)}</FilterSelect>
          <FilterSelect label="Staff" value={staff} onChange={setStaff}><option value="">All staff</option>{staffOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</FilterSelect>
          <FilterSelect label="SOP" value={sop} onChange={setSop}><option value="">All SOPs</option>{sopOptions.map((v) => <option key={v.sopId} value={v.sopId}>{v.code}</option>)}</FilterSelect>
          <FilterSelect label="Priority" value={priority} onChange={setPriority}><option value="">Any priority</option>{(['urgent', 'high', 'standard'] as const).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}</FilterSelect>
          {anyFilter && <Button size="sm" variant="ghost" onClick={() => { setShift(''); setStaff(''); setSop(''); setPriority(''); if (roomId) clearAll() }}>Clear filters</Button>}
        </>}
        selectable bulkActions={(sel, clear) => <>
          <Button size="sm" variant="primary" icon={ShieldCheck} disabled={!sel.some((t) => t.status === 'awaiting_verification')} onClick={() => bulkVerify(sel, clear)}>
            Verify {sel.filter((t) => t.status === 'awaiting_verification').length || ''}
          </Button>
          <Button size="sm" variant="secondary" icon={ArrowRightLeft} disabled={!sel.some(isOpen)} onClick={() => setReassign({ tasks: sel, done: clear })}>Reassign</Button>
          <Button size="sm" variant="secondary" icon={XCircle} className="text-danger" disabled={!sel.some(isOpen)} onClick={() => bulkCancel(sel, clear)}>Cancel</Button>
        </>}
        empty={room ? (
          <EmptyState compact icon={ClipboardList} title={`No work on room ${room.number} ${days === 1 ? 'today' : `in the last ${days} days`}`}
            description={`${room.type} · ${room.guestName ?? 'no guest'}. Assign it now or widen the date range.`}
            action={<div className="flex gap-2"><Link to={`/manager/assign-rooms?room=${room.id}`}><Button size="sm" variant="primary">Assign work</Button></Link>{days < 14 && <Button size="sm" variant="secondary" onClick={() => setScope('14')}>Show 14 days</Button>}</div>} />
        ) : (
          <EmptyState compact title="No tasks match" description={anyFilter || tab !== 'all' ? 'Try another status tab or clear the filters.' : 'Nothing is assigned yet today.'}
            action={anyFilter ? <Button size="sm" variant="secondary" onClick={() => { setShift(''); setStaff(''); setSop(''); setPriority(''); setRoomId(null) }}>Clear filters</Button> : <Link to="/manager/assign-rooms"><Button size="sm" variant="primary">Assign work</Button></Link>} />
        )} />

      <TaskDrawer taskId={taskId || null} onClose={() => setTaskId(null)} />
      <ReassignDialog tasks={reassign?.tasks ?? []} open={!!reassign} onClose={() => setReassign(null)} onDone={reassign?.done} />
    </div>
  )
}
