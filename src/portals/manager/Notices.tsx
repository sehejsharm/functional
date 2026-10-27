import clsx from 'clsx'
import { BellRing, FileText, Megaphone, MessageSquareReply, Plus, Send, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Avatar, Badge, Button, Card, Checkbox, DataTable, Drawer, EmptyState, Field, Input, Modal, PageHeader, SearchBox, Segmented, Select, StatCard, Switch, Tabs, Textarea, type Column, type Tone,
} from '@/components/ui'
import { byId, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { fDateTime, fTime } from '@/lib/time'
import { toast } from '@/lib/toast'
import type { AckEvent, Notice } from '@/lib/types'
import { relTime, usePersona } from '@/shell/PortalShell'
import { sendAckReminder } from './actions'
import { Callout, Meter, useLookups, useQueryParam } from './components'
import { DAY, liveShiftAt, pct } from './model'

type Prio = NonNullable<Notice['priority']>
const PRIO: Record<Prio, { label: string; tone: Tone }> = { normal: { label: 'Normal', tone: 'neutral' }, important: { label: 'Important', tone: 'warning' }, urgent: { label: 'Urgent', tone: 'danger' } }

function reachOf(n: Notice, acks: AckEvent[]) {
  const mine = acks.filter((a) => a.kind === 'notice' && a.refId === n.id && n.recipientIds.includes(a.personId))
  const read = mine.filter((a) => a.openedAt || a.acknowledgedAt).length
  const replied = mine.filter((a) => a.repliedAt).length
  return { total: n.recipientIds.length, read, replied, readPct: pct(read, n.recipientIds.length), replyPct: pct(replied, n.recipientIds.length) }
}

export function HotelNotices() {
  const now = useNow(60_000)
  const { notices, ackEvents, shifts } = useDB()
  const L = useLookups()
  const [params, setParams] = useSearchParams()
  const [noticeId, setNoticeId] = useQueryParam('notice')
  const [tab, setTab] = useState<'sent' | 'drafts'>('sent')
  const [prefill, setPrefill] = useState<Partial<Notice> | null>(null)
  const composing = params.get('new') === '1'
  const openComposer = (p: Partial<Notice> | null) => { setPrefill(p); setParams((x) => { const n = new URLSearchParams(x); n.set('new', '1'); return n }, { replace: true }) }
  const closeComposer = (openNotice?: string) => setParams((x) => { const n = new URLSearchParams(x); n.delete('new'); n.delete('to'); if (openNotice) n.set('notice', openNotice); return n }, { replace: true })

  const sent = notices.filter((n) => n.sentAt).sort((a, b) => b.sentAt!.localeCompare(a.sentAt!))
  const drafts = notices.filter((n) => n.sample)
  const reach = (n: Notice) => reachOf(n, ackEvents)
  const week = sent.filter((n) => Date.parse(n.sentAt!) > now - 7 * DAY)
  const avgRead = sent.length ? Math.round(sent.reduce((a, n) => a + reach(n).readPct, 0) / sent.length) : 0
  const awaitingReplies = sent.filter((n) => n.replyNeeded).reduce((a, n) => a + (reach(n).total - reach(n).replied), 0)
  const audienceLabel = (n: Notice) => n.audience === 'team' ? `${byId(shifts, n.teamShiftId)?.name ?? 'Shift'} team` : `${n.recipientIds.length} chosen ${n.recipientIds.length === 1 ? 'person' : 'people'}`

  const columns: Column<Notice>[] = [
    { key: 'title', header: 'Notice', sort: (n) => n.title, csv: (n) => n.title, cell: (n) => <div className="min-w-0 max-w-[300px]"><div className="truncate font-medium text-ink">{n.title}</div><div className="truncate text-xs text-muted">{n.body}</div></div> },
    { key: 'prio', header: 'Priority', sort: (n) => ['normal', 'important', 'urgent'].indexOf(n.priority ?? 'normal'), csv: (n) => PRIO[n.priority ?? 'normal'].label, cell: (n) => <Badge tone={PRIO[n.priority ?? 'normal'].tone}>{PRIO[n.priority ?? 'normal'].label}</Badge> },
    { key: 'aud', header: 'Audience', hideOnMobile: true, sort: (n) => audienceLabel(n), csv: (n) => audienceLabel(n), cell: (n) => <div className="whitespace-nowrap text-sm text-ink-2">{audienceLabel(n)}<div className="text-xs text-muted">{n.recipientIds.length} recipients</div></div> },
    { key: 'sent', header: 'Sent', hideOnMobile: true, sort: (n) => n.sentAt, csv: (n) => n.sentAt, cell: (n) => <div className="whitespace-nowrap text-sm text-ink-2">{relTime(n.sentAt!)}<div className="text-xs text-muted">by {L.name(n.sentById)}</div></div> },
    { key: 'read', header: 'Read', sort: (n) => reach(n).readPct, csv: (n) => reach(n).readPct, cell: (n) => { const r = reach(n); return <div className="w-28"><div className="mb-1 flex justify-between text-xs"><span className="tabular text-ink-2">{r.read}/{r.total}</span><span className="font-semibold tabular text-ink">{r.readPct}%</span></div><Meter value={r.read} max={r.total} tone={r.readPct === 100 ? 'success' : 'brand'} label={`${n.title}: ${r.readPct}% read`} /></div> } },
    { key: 'reply', header: 'Replied', hideOnMobile: true, sort: (n) => (n.replyNeeded ? reach(n).replyPct : -1), csv: (n) => (n.replyNeeded ? reach(n).replyPct : ''), cell: (n) => { const r = reach(n); return n.replyNeeded ? <div className="w-28"><div className="mb-1 flex justify-between text-xs"><span className="tabular text-ink-2">{r.replied}/{r.total}</span><span className="font-semibold tabular text-ink">{r.replyPct}%</span></div><Meter value={r.replied} max={r.total} tone="gold" label={`${n.title}: ${r.replyPct}% replied`} /></div> : <span className="text-xs text-muted">No reply needed</span> } },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Hotel notices" description="Tell the team once and see exactly who has read it. Reading or replying is never the same as accepting a task."
        actions={<Button variant="primary" icon={Plus} onClick={() => openComposer(null)}>New notice</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sent this week" value={week.length} icon={Megaphone} hint={`${sent.length} in total`} />
        <StatCard label="Average read rate" value={avgRead} unit="%" icon={Users} hint="across sent notices" />
        <StatCard label="Replies outstanding" value={awaitingReplies} icon={MessageSquareReply} hint="on notices that need one" />
        <StatCard label="Drafts & samples" value={drafts.filter((n) => !n.sentAt).length} icon={FileText} hint="ready to send" />
      </div>
      <div>
        <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'sent', label: 'Sent', count: sent.length }, { id: 'drafts', label: 'Drafts & samples', count: drafts.length }]} />
        {tab === 'sent' ? (
          <DataTable rows={sent} columns={columns} rowKey={(n) => n.id} caption="Sent notices" onRowClick={(n) => setNoticeId(n.id)} rowClassName={(n) => (n.id === noticeId ? 'bg-forest-50/70' : undefined)}
            search={(n) => `${n.title} ${n.body}`} searchPlaceholder="Search notices" exportName="hotel-notices"
            empty={<EmptyState compact icon={Megaphone} title="No notices sent yet" action={<Button size="sm" variant="primary" onClick={() => openComposer(null)}>Write one</Button>} />} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {drafts.map((n) => (
              <Card key={n.id} className="flex flex-col p-5">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={PRIO[n.priority ?? 'normal'].tone}>{PRIO[n.priority ?? 'normal'].label}</Badge>{n.sentAt ? <Badge>Sample · sent {relTime(n.sentAt)}</Badge> : <Badge tone="gold">Draft</Badge>}{n.replyNeeded && <Badge tone="info">Reply needed</Badge>}</div>
                <h3 className="mt-3 text-[15px] font-semibold text-ink">{n.title}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-2">{n.body}</p>
                <div className="mt-4 flex justify-end"><Button size="sm" variant={n.sentAt ? 'secondary' : 'primary'} icon={Send} onClick={() => openComposer({ title: n.title, body: n.body, priority: n.priority, replyNeeded: n.replyNeeded, teamShiftId: n.teamShiftId })}>{n.sentAt ? 'Use as template' : 'Review & send'}</Button></div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <NoticeDrawer noticeId={noticeId || null} onClose={() => setNoticeId(null)} onResend={(n) => openComposer({ title: n.title, body: n.body, priority: n.priority, replyNeeded: n.replyNeeded, teamShiftId: n.teamShiftId, audience: n.audience, recipientIds: n.recipientIds })} />
      <Composer open={composing} prefill={prefill} toParam={params.get('to')} onClose={() => closeComposer()} onSent={(id) => { setTab('sent'); closeComposer(id) }} />
    </div>
  )
}

function NoticeDrawer({ noticeId, onClose, onResend }: { noticeId: string | null; onClose: () => void; onResend: (n: Notice) => void }) {
  const { notices, ackEvents, shifts } = useDB()
  const { person: me } = usePersona('manager')
  const L = useLookups()
  const n = byId(notices, noticeId)
  if (!n) return <Drawer open={!!noticeId} onClose={onClose} title="Notice not found"><EmptyState title="This notice isn’t available" /></Drawer>
  const r = reachOf(n, ackEvents)
  const ev = (pid: string) => ackEvents.find((a) => a.kind === 'notice' && a.refId === n.id && a.personId === pid)
  const unread = n.recipientIds.filter((pid) => { const a = ev(pid); return !a?.openedAt && !a?.acknowledgedAt })
  const replies = n.recipientIds.map((pid) => ({ pid, a: ev(pid) })).filter((x) => x.a?.repliedAt).sort((a, b) => b.a!.repliedAt!.localeCompare(a.a!.repliedAt!))
  return (
    <Drawer open={!!noticeId} onClose={onClose} width="md" title={n.title} description={`Sent ${fDateTime(n.sentAt!)} by ${L.name(n.sentById)} · ${n.audience === 'team' ? `${byId(shifts, n.teamShiftId)?.name} team` : 'chosen people'}`}
      footer={<>
        <Button variant="ghost" className="mr-auto" onClick={() => onResend(n)}>Send again</Button>
        <Button variant="primary" icon={BellRing} disabled={!unread.length} onClick={() => { sendAckReminder(me?.id ?? 'elena', unread, `Notice “${n.title}”`); toast.success(`Reminder sent to ${unread.length} unread`, { description: unread.map((p) => L.name(p).split(' ')[0]).join(', ') }) }}>Remind {unread.length || ''} unread</Button>
      </>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2"><Badge tone={PRIO[n.priority ?? 'normal'].tone}>{PRIO[n.priority ?? 'normal'].label}</Badge>{n.replyNeeded ? <Badge tone="info">Reply needed</Badge> : <Badge>No reply needed</Badge>}</div>
        <p className="whitespace-pre-line rounded-cell border border-line bg-surface-2 px-4 py-3 text-sm text-ink">{n.body}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="card-inset p-3"><div className="text-xs text-muted">Read</div><div className="mt-1 text-xl font-semibold tabular text-ink">{r.readPct}%</div><Meter className="mt-2" value={r.read} max={r.total} label="Read" /><div className="mt-1 text-2xs text-muted">{r.read} of {r.total}</div></div>
          <div className="card-inset p-3"><div className="text-xs text-muted">Replied</div><div className="mt-1 text-xl font-semibold tabular text-ink">{n.replyNeeded ? `${r.replyPct}%` : '—'}</div><Meter className="mt-2" value={r.replied} max={r.total} tone="gold" label="Replied" /><div className="mt-1 text-2xs text-muted">{n.replyNeeded ? `${r.replied} of ${r.total}` : 'Not asked'}</div></div>
        </div>
        {replies.length > 0 && (
          <section aria-label="Replies">
            <h3 className="mb-2 text-sm font-semibold text-ink">Replies</h3>
            <ul className="space-y-2">{replies.map(({ pid, a }) => (
              <li key={pid} className="flex gap-3 rounded-cell border border-line p-3"><Avatar name={L.name(pid)} size={28} /><div className="min-w-0"><div className="text-sm font-medium text-ink">{L.name(pid)} <span className="text-xs font-normal text-muted">· {fTime(a!.repliedAt!)}</span></div><p className="text-sm text-ink-2">“{a!.reply}”</p></div></li>
            ))}</ul>
          </section>
        )}
        <section aria-label="Recipients">
          <h3 className="mb-2 text-sm font-semibold text-ink">Recipients</h3>
          <ul className="divide-y divide-line rounded-cell border border-line">
            {n.recipientIds.map((pid) => { const a = ev(pid); return (
              <li key={pid} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2.5"><Avatar name={L.name(pid)} size={24} /><span className="truncate text-sm text-ink">{L.name(pid)}</span></span>
                {a?.repliedAt ? <Badge tone="success" dot>Replied</Badge> : a?.acknowledgedAt ? <Badge tone="success" dot>Confirmed {fTime(a.acknowledgedAt)}</Badge> : a?.openedAt ? <Badge tone="info" dot>Opened {fTime(a.openedAt)}</Badge> : <Badge tone="danger" dot>Not opened</Badge>}
              </li>
            ) })}
          </ul>
        </section>
      </div>
    </Drawer>
  )
}

function Composer({ open, prefill, toParam, onClose, onSent }: { open: boolean; prefill: Partial<Notice> | null; toParam: string | null; onClose: () => void; onSent: (id: string) => void }) {
  const now = useNow(60_000)
  const { shifts, people, notices, jobRoles } = useDB()
  const { person: me } = usePersona('manager')
  const live = liveShiftAt(now, shifts)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<Prio>('normal')
  const [audience, setAudience] = useState<'team' | 'people'>('team')
  const [teamShiftId, setTeamShiftId] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [replyNeeded, setReplyNeeded] = useState(false)
  const [q, setQ] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (!open) return
    const to = byId(people, toParam)
    setTitle(prefill?.title ?? ''); setBody(prefill?.body ?? ''); setPriority(prefill?.priority ?? 'normal'); setReplyNeeded(prefill?.replyNeeded ?? false)
    setAudience(to ? 'people' : prefill?.audience ?? 'team'); setChosen(to ? [to.id] : prefill?.audience === 'people' ? prefill.recipientIds ?? [] : [])
    setTeamShiftId(prefill?.teamShiftId ?? live?.id ?? shifts[0].id); setQ(''); setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const team = byId(shifts, teamShiftId) ?? shifts[0]
  const recipients = audience === 'team' ? team.memberIds : chosen
  const templates = notices.filter((n) => n.sample)
  const list = useMemo(() => people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || (jobRoles.find((r) => r.id === p.jobRoleId)?.name.toLowerCase().includes(q.toLowerCase()) ?? false)), [people, q, jobRoles])
  const errors = { title: !title.trim() ? 'Add a title.' : null, body: !body.trim() ? 'Write the message.' : null, to: !recipients.length ? 'Choose at least one person.' : null }
  const send = () => {
    setTried(true)
    if (errors.title || errors.body || errors.to) return
    useDB.getState().sendNotice({ title: title.trim(), body: body.trim(), replyNeeded, audience, teamShiftId: audience === 'team' ? team.id : undefined, recipientIds: recipients, sentById: me?.id ?? 'elena', priority })
    const id = useDB.getState().notices[0]?.id
    toast.success('Notice sent', { description: `“${title.trim()}” to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}${replyNeeded ? ' · reply requested' : ''}` })
    if (id) onSent(id); else onClose()
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New hotel notice" description="Arrives on each person’s phone with a confirm button. Opening or replying is never task acceptance."
      footer={<><span className="mr-auto text-xs text-muted">Sends to <b className="text-ink">{recipients.length}</b> {recipients.length === 1 ? 'person' : 'people'}</span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Send} onClick={send}>Send notice</Button></>}>
      <div className="space-y-4">
        <Field label="Start from a sample" htmlFor="tpl" hint="Optional">
          <Select id="tpl" value="" onChange={(e) => { const t = byId(notices, e.target.value); if (t) { setTitle(t.title); setBody(t.body); setPriority(t.priority ?? 'normal'); setReplyNeeded(t.replyNeeded) } }}>
            <option value="">Choose a sample…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </Field>
        <Field label="Title" htmlFor="ntitle" required error={tried ? errors.title : undefined}><Input id="ntitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Service lift B closed until noon" maxLength={80} invalid={tried && !!errors.title} /></Field>
        <Field label="Message" htmlFor="nbody" required error={tried ? errors.body : undefined}><Textarea id="nbody" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What’s happening, what you need staff to do, and by when" invalid={tried && !!errors.body} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority"><Segmented value={priority} onChange={setPriority} items={(Object.keys(PRIO) as Prio[]).map((k) => ({ id: k, label: PRIO[k].label }))} /></Field>
          <Field label="Reply"><Switch checked={replyNeeded} onChange={setReplyNeeded} label="Ask for a reply" description="Staff answer in a sentence; you see every reply here." /></Field>
        </div>
        {priority === 'urgent' && <Callout tone="warning" title="Urgent notices interrupt staff mid-room">Use them for safety and guest-impacting changes only.</Callout>}
        <Field label="Send to" error={tried ? errors.to : undefined}>
          <Segmented value={audience} onChange={setAudience} items={[{ id: 'team', label: 'A shift team' }, { id: 'people', label: 'Selected people' }]} />
        </Field>
        {audience === 'team' ? (
          <Field label="Team" htmlFor="nteam" hint={`${team.memberIds.map((id) => byId(people, id)?.name.split(' ')[0]).join(', ')}`}>
            <Select id="nteam" value={team.id} onChange={(e) => setTeamShiftId(e.target.value)}>{shifts.map((s) => <option key={s.id} value={s.id}>{s.team} · {s.name.toLowerCase()} · {s.memberIds.length} people{s.id === live?.id ? ' (on shift now)' : ''}</option>)}</Select>
          </Field>
        ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><SearchBox value={q} onChange={setQ} placeholder="Search name or role" className="flex-1" /><span className="text-xs text-muted">{chosen.length} selected</span>{chosen.length > 0 && <Button size="xs" variant="ghost" onClick={() => setChosen([])}>Clear</Button>}</div>
            <div className="grid max-h-60 gap-1.5 overflow-y-auto rounded-cell border border-line p-2 sm:grid-cols-2">
              {list.map((p) => (
                <div key={p.id} className={clsx('rounded-md px-2 py-1.5', chosen.includes(p.id) && 'bg-forest-50')}>
                  <Checkbox checked={chosen.includes(p.id)} onChange={() => setChosen((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))} label={p.name} description={jobRoles.find((r) => r.id === p.jobRoleId)?.name} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
