import clsx from 'clsx'
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, CircleDashed, CopyPlus, FileText, FileUp, GitPullRequestArrow, Info, Lock, MessageSquareQuote, MoreHorizontal, Plus,
  RefreshCw, Save, Send, ShieldCheck, Smartphone, Trash2, Undo2, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { create } from 'zustand'
import {
  Button, Card, CardHeader, Drawer, EmptyState, Field, IconButton, Input, Menu, Modal, PageHeader, STEP_ICONS, Select, Spinner, StepIcon, Stepper, Switch, Textarea,
} from '@/components/ui'
import { useBreadcrumb } from '@/lib/crumbs'
import { APPROVALS_REQUIRED, byId, proposeVersion, useDB } from '@/lib/db'
import { useNow } from '@/lib/hooks'
import { parseSop, readPdfLines, textToLines, type ImportedSop } from '@/lib/sopImport'
import { fTime } from '@/lib/time'
import { confirm, toast } from '@/lib/toast'
import type { SopStep, SopVersion } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'
import { currentOf, deleteSopDraft, saveSopDraft, useRevisionLinks } from './actions'
import { StaffPreview, StepFlags, VersionStatusBadge, VersionTag, splitCare, useSopCommands } from './components'

export const MAX_STEPS = 30
const MAX_TAGS = 20
const CODE_RE = /^[A-Z]{2,5}(-[A-Z0-9]+)+$/
const LANGUAGES = ['English', 'Sinhala', 'Tamil', 'Hindi', 'Arabic']
const ICON_LABEL: Record<string, string> = {
  door: 'Door', bed: 'Bed', bath: 'Bathroom', eye: 'Inspect', check: 'Check', moon: 'Evening', cart: 'Trolley', shield: 'Safety', clipboard: 'Record',
  bell: 'Greet', luggage: 'Luggage', spray: 'Clean', food: 'Food', sparkle: 'Finish', case: 'Valuables', alert: 'Alert',
}

interface StepForm extends SopStep { notes: string[] }
interface FormState { title: string; code: string; jobRoleId: string; department: string; language: string; minutes: string; tags: string[]; steps: StepForm[] }
interface Problem { id: string; message: string }

const stepId = () => `st-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const blankStep = (): StepForm => ({ id: stepId(), icon: 'check', instruction: '', guestCare: '', requireCheck: false, allowPhoto: false, notes: [] })
const blankForm = (): FormState => ({ title: '', code: '', jobRoleId: 'room-attendant', department: '', language: 'English', minutes: '15', tags: [], steps: [blankStep()] })
const toForm = (v: SopVersion, department?: string): FormState => ({
  title: v.title, code: v.code, jobRoleId: v.jobRoleId, department: department ?? '', language: v.language, minutes: String(v.timeTargetMin), tags: [...v.tags],
  steps: v.steps.map((s) => { const { care, notes } = splitCare(s.guestCare); return { ...s, guestCare: care, notes } }),
})
const toSteps = (f: FormState): SopStep[] => f.steps.map(({ notes, ...s }) => ({
  ...s, instruction: s.instruction.trim(), guestCare: [s.guestCare.trim(), ...notes.map((n) => `[Feedback] ${n}`)].filter(Boolean).join('\n'),
}))

/** Transient editor state that must survive the first save (import summary, keyed by draft id or 'new'). */
type Imported = ImportedSop & { codeKept?: string }
const useEditorSession = create<{ imports: Record<string, Imported> }>(() => ({ imports: {} }))
const setImport = (key: string, v: Imported | null) => useEditorSession.setState((s) => {
  const imports = { ...s.imports }; if (v) imports[key] = v; else delete imports[key]; return { imports }
})

/** Updates the address bar without remounting the screen (the shell keys the page by path). */
function replaceUrlQuietly(path: string) {
  const st = window.history.state
  if (window.location.hash.startsWith('#/')) window.history.replaceState(st, '', `${window.location.pathname}${window.location.search}#${path}`)
  else window.history.replaceState(st, '', path)
}

const savedAgo = (iso: string) => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? 'Saved just now' : m < 60 ? `Saved ${m} min ago` : `Saved at ${fTime(iso)}`
}

export function CreateSop() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { person } = usePersona('author')
  const me = person?.id ?? 'amina'
  const db = useDB()
  const cmd = useSopCommands()
  useNow(30_000)

  const [draftId, setDraftId] = useState<string | undefined>(id)
  const draft = byId(db.sopVersions, draftId)
  const sopRec = draft ? byId(db.sops, draft.sopId) : undefined
  const current = draft ? currentOf(db, draft.sopId) : undefined
  const codeLocked = !!draft && (!!draft.baseVersionId || !!sopRec?.currentVersionId)

  const initial = useMemo(() => (draft ? toForm(draft, sopRec?.department) : blankForm()), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<FormState>(initial)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial))
  const dirty = JSON.stringify(form) !== savedJson
  const [attempt, setAttempt] = useState<'save' | 'review' | null>(null)
  const [undoForm, setUndoForm] = useState<FormState | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [highlight, setHighlight] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const imported = useEditorSession((s) => s.imports[draftId ?? 'new'])
  const links = useRevisionLinks((s) => (draftId ? s.byDraft[draftId] ?? [] : []))
  const fileRef = useRef<HTMLInputElement>(null)
  const focusNext = useRef<string | null>(null)

  const readOnly = !!draft && draft.status !== 'draft' && draft.status !== 'changes_requested'
  useBreadcrumb(draft ? `${draft.code || 'Untitled'} ${draft.version}` : null)

  const resetTo = (f: FormState) => { setForm(f); setSavedJson(JSON.stringify(f)); setAttempt(null); setUndoForm(null) }

  // ?import=1 opens the file picker straight away (the click that brought us here still counts as a user gesture).
  const opened = useRef(false)
  const openPicker = () => { setHighlight(true); document.getElementById('import')?.scrollIntoView({ block: 'center' }); setTimeout(() => fileRef.current?.click(), 120); setTimeout(() => setHighlight(false), 2600) }
  useEffect(() => { if (!opened.current && params.get('import') === '1' && !id) { opened.current = true; openPicker() } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Choosing "Create SOP" again while on this screen starts a fresh form.
  const firstKey = useRef(loc.key)
  useEffect(() => {
    if (loc.key === firstKey.current) return
    firstKey.current = loc.key
    if (!id) { setDraftId(undefined); setImport('new', null); resetTo(blankForm()); if (params.get('import') === '1') openPicker() }
  }, [loc.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus a step's instruction after adding or duplicating it.
  useEffect(() => { if (focusNext.current) { document.getElementById(focusNext.current)?.focus(); focusNext.current = null } })

  // Unsaved-changes guard: tab close/reload, and in-app links (sidebar, breadcrumbs).
  useEffect(() => {
    if (!dirty || readOnly) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const to = url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname + url.search
      e.preventDefault(); e.stopPropagation()
      void confirm({ title: 'Leave without saving?', body: 'You have unsaved changes to this SOP. They will be lost if you leave now.', confirmLabel: 'Leave without saving', cancelLabel: 'Keep editing', tone: 'danger' })
        .then((ok) => { if (ok) nav(to) })
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onClick, true)
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true) }
  }, [dirty, readOnly, nav])

  // ⌘S / Ctrl+S saves the draft.
  const saveRef = useRef<() => void>(() => {})
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (id && !draft) {
    return <EmptyState icon={FileText} title="Draft not found" description="It may have been deleted, or the link is from another device’s demo data." action={<Link to="/author" className="link text-sm">Back to the SOP library</Link>} />
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const roleName = db.jobRoles.find((r) => r.id === form.jobRoleId)?.name
  const steps = toSteps(form)
  const minutes = Number(form.minutes)
  const draftLike = { steps, timeTargetMin: Number.isFinite(minutes) ? minutes : 0 } as SopVersion
  const proposal = proposeVersion(draftLike, current)
  const reasons: string[] = []
  if (current) {
    if (current.steps.length !== steps.length) reasons.push(`steps ${current.steps.length} → ${steps.length}`)
    if (current.timeTargetMin !== minutes) reasons.push(`time target ${current.timeTargetMin} → ${form.minutes || '?'} min`)
    const flipped = steps.map((s, i) => (current.steps[i] && s.requireCheck !== current.steps[i].requireCheck ? i + 1 : 0)).filter(Boolean)
    if (flipped.length) reasons.push(`independent check changed on step ${flipped.join(', ')}`)
  }
  const label = draft?.status === 'in_review' || draft?.status === 'published' || draft?.status === 'superseded' ? draft.version : proposal.label
  const checks = steps.filter((s) => s.requireCheck).length
  const photos = steps.filter((s) => s.allowPhoto).length
  const stage = !draft || draft.status === 'draft' || draft.status === 'changes_requested' ? 0 : draft.status === 'in_review' ? 1 : draft.status === 'rejected' ? 1 : 3
  const departments = [...new Set([...db.sops.map((s) => s.department).filter(Boolean) as string[], ...db.jobRoles.map((r) => r.team), 'Food & beverage', 'Safety', form.department].filter(Boolean))].sort()

  const validate = (mode: 'save' | 'review'): Problem[] => {
    const out: Problem[] = []
    if (form.title.trim().length < 3) out.push({ id: 'f-title', message: 'Give the SOP a title of at least 3 characters.' })
    const code = form.code.trim().toUpperCase()
    if (mode === 'review' && !code) out.push({ id: 'f-code', message: 'Add an SOP code, for example HK-102.' })
    else if (code && !CODE_RE.test(code)) out.push({ id: 'f-code', message: 'Use a short code like HK-102: 2–5 letters, then hyphen-separated letters or numbers.' })
    else if (code && !codeLocked) {
      const clash = db.sops.find((s) => s.code.toUpperCase() === code && s.id !== draft?.sopId)
        ?? db.sopVersions.find((v) => v.code.toUpperCase() === code && v.sopId !== draft?.sopId)
      if (clash) out.push({ id: 'f-code', message: `${code} is already used by another SOP. Choose a different code.` })
    }
    if (mode === 'review') {
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) out.push({ id: 'f-min', message: 'Set a time target between 1 and 240 minutes.' })
      if (!form.steps.length) out.push({ id: 'add-step', message: 'Add at least one step.' })
      form.steps.forEach((s, i) => {
        if (!s.instruction.trim()) out.push({ id: `step-${i}-instruction`, message: `Step ${i + 1}: say what the employee should do.` })
        if (s.notes.length) out.push({ id: `step-${i}-notes`, message: `Step ${i + 1}: apply the feedback note, then mark it applied.` })
      })
    }
    if (form.steps.length > MAX_STEPS) out.push({ id: 'add-step', message: `An SOP can have at most ${MAX_STEPS} steps.` })
    if (form.tags.length > MAX_TAGS) out.push({ id: 'f-tags', message: `Use at most ${MAX_TAGS} tags.` })
    return out
  }
  const problems = attempt ? validate(attempt) : []
  const err = (fid: string) => problems.find((p) => p.id === fid)?.message
  const focus = (fid: string) => { const el = document.getElementById(fid); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el?.focus(), 250) }

  // ── Mutations ────────────────────────────────────────────────────────────
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setStep = (i: number, patch: Partial<StepForm>) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const moveStep = (i: number, d: -1 | 1) => setForm((f) => { const s = [...f.steps]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); return { ...f, steps: s } })
  const addStep = (at?: number, copy?: StepForm) => {
    if (form.steps.length >= MAX_STEPS) return
    const n = copy ? { ...copy, id: stepId(), notes: [] } : blankStep()
    const idx = at ?? form.steps.length
    setForm((f) => { const s = [...f.steps]; s.splice(idx, 0, n); return { ...f, steps: s } })
    focusNext.current = `step-${idx}-instruction`
  }
  const removeStep = async (i: number) => {
    const s = form.steps[i]
    if ((s.instruction.trim() || s.guestCare.trim()) && !await confirm({ title: `Delete step ${i + 1}?`, body: `“${s.instruction.slice(0, 120) || s.guestCare.slice(0, 120)}” will be removed from this draft.`, tone: 'danger', confirmLabel: 'Delete step' })) return
    setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))
    toast.success(`Step ${i + 1} deleted`, { action: { label: 'Undo', onClick: () => setForm((f) => { const st = [...f.steps]; st.splice(i, 0, s); return { ...f, steps: st } }) } })
  }

  const persist = (mode: 'save' | 'review'): SopVersion | null => {
    const errs = validate(mode)
    setAttempt(mode)
    if (errs.length) {
      toast.error(mode === 'review' ? `Fix ${errs.length} thing${errs.length === 1 ? '' : 's'} before sending for review` : 'Check the highlighted fields', { description: errs[0].message })
      focus(errs[0].id)
      return null
    }
    const created = !draft
    const d = draft ?? useDB.getState().newDraftFrom(null, me)
    const next: SopVersion = {
      ...d, title: form.title.trim(), code: codeLocked ? d.code : form.code.trim().toUpperCase(), jobRoleId: form.jobRoleId, language: form.language,
      timeTargetMin: Number.isInteger(minutes) && minutes > 0 ? Math.min(240, minutes) : d.timeTargetMin, tags: form.tags, steps,
    }
    const s = saveSopDraft(next, me, form.department || undefined, created)
    setSavedJson(JSON.stringify(form)); setUndoForm(null); setAttempt(null)
    if (created) {
      setDraftId(s.id)
      const imp = useEditorSession.getState().imports.new
      if (imp) { setImport(s.id, imp); setImport('new', null) }
      replaceUrlQuietly(`/author/edit/${s.id}`)
    }
    return s
  }
  const onSave = () => {
    if (readOnly) return
    const s = persist('save')
    if (s) toast.success(dirty || !draft ? 'Draft saved' : 'Draft is up to date', { description: `${s.code || 'Untitled'} · ${s.version} draft · not visible to staff` })
  }
  saveRef.current = onSave
  const askReview = () => {
    const errs = validate('review')
    setAttempt('review')
    if (errs.length) { toast.error(`Fix ${errs.length} thing${errs.length === 1 ? '' : 's'} before sending for review`, { description: errs[0].message }); focus(errs[0].id); return }
    setReviewOpen(true)
  }
  const submit = () => {
    const s = persist('review')
    if (!s) { setReviewOpen(false); return }
    useDB.getState().submitForReview(s.id)
    setReviewOpen(false)
    const v = byId(useDB.getState().sopVersions, s.id)
    toast.success(`${s.code} ${v?.version ?? ''} sent for review`, { description: `${APPROVALS_REQUIRED} independent approvals are needed before it can be released.` })
    nav(`/author/reviews/${s.id}`)
  }
  const discard = async () => {
    if (!draft || !await confirm({ title: 'Discard unsaved changes?', body: 'The form goes back to the last saved draft.', confirmLabel: 'Discard changes', tone: 'danger' })) return
    resetTo(toForm(draft, sopRec?.department))
    toast.info('Changes discarded')
  }
  const removeDraft = async () => {
    if (!draft || !await confirm({ title: `Delete draft ${draft.code || 'Untitled'} ${draft.version}?`, body: current ? `The published ${current.version} is not affected.` : 'This SOP has never been published, so it leaves the library.', tone: 'danger', confirmLabel: 'Delete draft' })) return
    setSavedJson(JSON.stringify(form))
    deleteSopDraft(draft.id, me)
    toast.success('Draft deleted')
    nav('/author')
  }

  // ── Import ───────────────────────────────────────────────────────────────
  const onImport = async (file: File | undefined) => {
    if (!file || readOnly) return
    setImportError(null)
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
    if (!isPdf && !/\.(txt|md)$/i.test(file.name) && !file.type.startsWith('text/')) { setImportError('Choose a PDF or a plain-text file (.pdf, .txt or .md).'); return }
    if (file.size > 15 * 1024 * 1024) { setImportError('That file is larger than 15 MB. Export a smaller PDF and try again.'); return }
    const hasContent = form.title.trim() || form.steps.some((s) => s.instruction.trim())
    if (hasContent && !await confirm({ title: 'Replace the form with this document?', body: `Title, code, role, time target, tags and steps will be filled from ${file.name}. You can undo this until you save.`, confirmLabel: 'Replace' })) return
    setImporting(file.name)
    try {
      const lines = isPdf ? await readPdfLines(file) : textToLines(await file.text())
      if (!lines.length) throw new Error('No text could be read from this file. If it is a scanned image, type the steps in instead.')
      const r = parseSop(lines, db.jobRoles, file.name, { propertyName: db.properties[0]?.name })
      if (!r.steps.length) throw new Error(r.warnings[0] ?? 'No steps were found in this document.')
      setUndoForm(form)
      setForm((f) => ({
        ...f, title: r.title, code: codeLocked ? f.code : r.code, minutes: String(r.timeTargetMin), jobRoleId: r.jobRoleId ?? f.jobRoleId,
        department: r.department ?? f.department, tags: r.tags, steps: r.steps.map((s) => ({ ...s, notes: [] })),
      }))
      setImport(draftId ?? 'new', { ...r, codeKept: codeLocked ? form.code : undefined })
      setAttempt(null)
      toast.success(`Imported ${r.steps.length} steps`, { description: `From ${file.name}. Check each step, then save the draft.` })
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'This file could not be read.')
    } finally { setImporting(null) }
  }
  const undoImport = () => { if (!undoForm) return; setForm(undoForm); setUndoForm(null); setImport(draftId ?? 'new', null); toast.info('Import undone', { description: 'The form is back to how it was.' }) }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); void onImport(e.dataTransfer.files?.[0]) }

  const brand = imported?.sourceProperty?.split(/[\s,·]+/)[0]
  const brandHits = brand ? form.steps.map((s, i) => (`${s.instruction} ${s.guestCare}`.toLowerCase().includes(brand.toLowerCase()) ? i + 1 : 0)).filter(Boolean) : []
  const generalLinks = links.map((fid) => byId(db.feedback, fid)).filter((f) => f && (!f.stepId || !form.steps.some((s) => s.id === f.stepId)))

  // ── Render ───────────────────────────────────────────────────────────────
  const preview = <StaffPreview steps={steps} version={label} title={form.title} minutes={form.minutes} roleName={roleName} />
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={draft ? (draft.baseVersionId ? `Revision of ${draft.code}` : 'New SOP') : 'Create SOP'}
        title={form.title.trim() || (draft ? 'Untitled SOP' : 'New SOP')}
        description={draft ? undefined : 'Write it once, in plain words. Every shift follows it exactly — on their phone.'}
        meta={draft && <>
          {draft.code && <span className="font-mono text-[13px] font-semibold text-ink">{draft.code}</span>}
          <VersionTag label={label} draft={!readOnly} />
          <VersionStatusBadge status={draft.status} />
          {current && <span>Staff follow v{current.version} until this is released</span>}
        </>}
        actions={<>
          <Button className="xl:hidden" icon={Smartphone} onClick={() => setPreviewOpen(true)}>Preview</Button>
          {draft?.status === 'draft' && <Menu label="Draft actions" trigger={({ toggle }) => <IconButton icon={MoreHorizontal} variant="secondary" label="Draft actions" onClick={toggle} />}
            items={[{ label: 'Delete draft', icon: Trash2, danger: true, onClick: removeDraft }]} />}
        </>} />

      {readOnly && draft && <ReadOnlyBanner v={draft} current={current} onRevise={() => cmd.revise(draft.sopId)} />}

      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <Stepper steps={['Draft', 'Review', 'Release']} current={stage} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Releases as</span>
            <span className="rounded-md bg-forest-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">v{proposal.label}</span>
            <span className="text-ink-2">· {!current ? 'first version' : proposal.structural ? 'structural change' : 'wording change'}</span>
            <span className="group/why relative">
              <Info size={14} className="text-muted" aria-hidden />
              <span className="sr-only">Why: </span>
              <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 w-72 rounded-cell bg-ink px-3 py-2 text-xs text-white opacity-0 shadow-pop transition group-hover/why:opacity-100">
                {!current ? 'A brand-new SOP always releases as 1.0.' : proposal.structural ? `Structural (major) because ${reasons.join('; ')}.` : 'Wording (minor): same number of steps, same independent checks and same time target as the published version.'}
              </span>
            </span>
          </div>
        </div>
      </Card>

      {problems.length > 0 && (
        <div role="alert" className="rounded-card border border-danger/30 bg-danger/[0.04] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-danger"><AlertTriangle size={16} /> {attempt === 'review' ? `Fix ${problems.length} thing${problems.length === 1 ? '' : 's'} before sending for review` : 'Fix this before saving'}</div>
          <ul className="mt-2 space-y-1">{problems.map((p, i) => <li key={i}><button type="button" onClick={() => focus(p.id)} className="text-left text-sm text-ink underline decoration-danger/40 underline-offset-2 hover:decoration-danger">{p.message}</button></li>)}</ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <fieldset disabled={readOnly} aria-label="SOP content" className="min-w-0 space-y-6">

          {/* Start from a document */}
          <Card id="import" className={clsx('transition-shadow', highlight && 'shadow-ring-gold')}>
            <CardHeader icon={FileUp} title="Start from a document" description="Upload an existing SOP. Mise reads its title, code, role, time target and steps into this form. Nothing is saved until you save the draft." />
            <div className="p-5">
              <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" className="sr-only" aria-label="Upload SOP document" tabIndex={-1}
                onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = '' }} />
              {!imported && !importing && draft && (draft.baseVersionId || draft.steps.some((st) => st.instruction.trim())) ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-2">Replace this draft’s content from a PDF or text file. You can undo it until you save.</p>
                  <Button size="sm" icon={FileUp} onClick={() => fileRef.current?.click()}>Import from a document</Button>
                </div>
              ) : imported && !importing ? (
                <ImportSummary r={imported} steps={form.steps} canUndo={!!undoForm} onUndo={undoImport} onReplace={() => fileRef.current?.click()} saved={!!draft && !dirty} />
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
                  aria-describedby="import-help" disabled={!!importing}
                  className={clsx('flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-8 text-center transition',
                    drag ? 'border-forest-600 bg-forest-50' : 'border-line-strong bg-surface-2 hover:border-forest-600/60 hover:bg-forest-50/50', highlight && 'border-gold-500 bg-gold-50')}>
                  {importing ? <><Spinner size={22} /><span className="text-sm font-semibold text-ink">Reading {importing}…</span><span className="text-xs text-muted">Finding the title, code, role, time target and steps</span></> : <>
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-forest-700 shadow-card ring-1 ring-line"><FileUp size={20} /></span>
                    <span className="text-sm font-semibold text-ink">Drop a PDF here, or <span className="text-forest-700 underline underline-offset-2">choose a file</span></span>
                    <span id="import-help" className="text-xs text-muted">PDF, TXT or Markdown · up to 15 MB · read on this device, never uploaded</span>
                  </>}
                </button>
              )}
              {importError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-cell bg-danger/[0.06] px-3 py-2 text-sm text-danger"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {importError}</p>}
            </div>
          </Card>

          {/* Essentials */}
          <Card>
            <CardHeader title="SOP essentials" description="How the SOP is found, who it is for and how long it should take." />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Title" required htmlFor="f-title" error={err('f-title')} className="md:col-span-2">
                <Input id="f-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Luggage handling on arrival" maxLength={120} invalid={!!err('f-title')} />
              </Field>
              <Field label="SOP code" required htmlFor="f-code" error={err('f-code')} hint={codeLocked ? 'Fixed once an SOP has been published.' : 'Short and unique, e.g. HK-102 or FO-BELL-04.'}>
                <Input id="f-code" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, '-'))} placeholder="HK-102" readOnly={codeLocked}
                  className={clsx('font-mono uppercase', codeLocked && 'bg-surface-2 text-ink-2')} invalid={!!err('f-code')} maxLength={24} />
              </Field>
              <Field label="Who it is for" required htmlFor="f-role" hint="Staff in this role are asked to acknowledge each release.">
                <Select id="f-role" value={form.jobRoleId} onChange={(e) => set('jobRoleId', e.target.value)}>
                  {db.jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.team}</option>)}
                </Select>
              </Field>
              <Field label="Department" htmlFor="f-dept" hint="Optional. Groups the SOP in the library.">
                <Select id="f-dept" value={form.department} onChange={(e) => set('department', e.target.value)}>
                  <option value="">Same as the role’s team</option>{departments.map((d) => <option key={d}>{d}</option>)}
                </Select>
              </Field>
              <Field label="Language" htmlFor="f-lang">
                <Select id="f-lang" value={form.language} onChange={(e) => set('language', e.target.value)}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</Select>
              </Field>
              <Field label="Time target" required htmlFor="f-min" error={err('f-min')} hint="A target never overrides safety or guest privacy.">
                <div className="relative">
                  <Input id="f-min" type="number" inputMode="numeric" min={1} max={240} value={form.minutes} onChange={(e) => set('minutes', e.target.value)} className="pr-12 tabular" invalid={!!err('f-min')} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">min</span>
                </div>
              </Field>
              <Field label="Search tags" htmlFor="f-tags" error={err('f-tags')} hint={`Press Enter or comma to add. Up to ${MAX_TAGS}.`} className="md:col-span-2">
                <TagInput id="f-tags" value={form.tags} onChange={(t) => set('tags', t)} disabled={readOnly} />
              </Field>
            </div>
          </Card>

          {/* Steps */}
          <Card>
            <CardHeader title="Steps" description="Plain words: what to do, when to stop, what a good finish looks like. Guest-care detail is what the guest should hear or notice — staff see it in gold."
              actions={<span className={clsx('text-xs font-medium tabular', form.steps.length >= MAX_STEPS ? 'text-amber' : 'text-muted')}>{form.steps.length} / {MAX_STEPS}</span>} />
            <div className="space-y-3 p-3 sm:p-5">
              {generalLinks.length > 0 && (
                <div className="rounded-cell border border-amber/30 bg-amber/[0.06] p-3.5">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><MessageSquareQuote size={15} className="text-amber" /> Requests this revision should address</div>
                  <ul className="space-y-2">{generalLinks.map((f) => f && (
                    <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                      <span className="min-w-0 flex-1 text-ink-2">“{f.text}” <span className="text-muted">— {byId(db.people, f.fromId)?.name}, {f.lane === 'manager_request' ? 'manager request' : f.lane}</span></span>
                      {!readOnly && <Button size="xs" variant="ghost" icon={CheckCircle2} onClick={() => { useRevisionLinks.getState().unlink(draftId!, f.id); toast.success('Marked as addressed') }}>Addressed</Button>}
                    </li>
                  ))}</ul>
                </div>
              )}
              <ol className="space-y-3">
                {form.steps.map((s, i) => (
                  <StepCard key={s.id} i={i} s={s} total={form.steps.length} readOnly={readOnly} error={err(`step-${i}-instruction`)} noteError={!!err(`step-${i}-notes`)}
                    onChange={(p) => setStep(i, p)} onMove={(d) => moveStep(i, d)} onDuplicate={() => addStep(i + 1, s)} onDelete={() => removeStep(i)} />
                ))}
              </ol>
              {!readOnly && (
                <button id="add-step" type="button" onClick={() => addStep()} disabled={form.steps.length >= MAX_STEPS}
                  className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong px-4 py-3 text-sm font-semibold text-forest-700 transition hover:border-forest-600/60 hover:bg-forest-50/50 disabled:cursor-not-allowed disabled:opacity-50">
                  <Plus size={16} /> {form.steps.length >= MAX_STEPS ? `Maximum of ${MAX_STEPS} steps reached` : 'Add a step'}
                </button>
              )}
            </div>
          </Card>
        </fieldset>

        <aside className="hidden xl:block" aria-label="Live preview">
          <div className="sticky top-20">
            <div className="mb-3 flex items-baseline justify-between"><h2 className="text-sm font-semibold text-ink">Live preview</h2><span className="text-xs text-muted">as staff see it</span></div>
            {preview}
          </div>
        </aside>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-14px_rgb(16_32_24/0.18)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SaveState readOnly={readOnly} status={draft?.status} dirty={dirty} saved={!!draft} updatedAt={draft?.updatedAt} />
          {readOnly ? (
            <div className="ml-auto flex gap-2">
              {draft?.status === 'in_review' || draft?.status === 'rejected' ? <Button variant="primary" icon={GitPullRequestArrow} onClick={() => nav(`/author/reviews/${draft.id}`)}>Open review</Button>
                : <Button variant="primary" onClick={() => draft && cmd.revise(draft.sopId)}>Start revision</Button>}
            </div>
          ) : (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {dirty && draft && <Button variant="ghost" size="sm" onClick={discard} className="max-sm:hidden">Discard changes</Button>}
              <Button icon={Save} onClick={onSave} title="Save draft (Ctrl+S)">Save draft</Button>
              <Button variant="primary" icon={Send} onClick={askReview}>{draft?.status === 'changes_requested' ? 'Resubmit for review' : 'Send for review'}</Button>
            </div>
          )}
        </div>
      </div>

      <Drawer open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview" description="Exactly what staff will see on their phone" width="md">{preview}</Drawer>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} size="md"
        title={`Send ${form.code.trim().toUpperCase() || 'this SOP'} for review?`}
        description="Reviewers approve exactly this version. It is locked for editing while it is in review."
        footer={<><Button onClick={() => setReviewOpen(false)}>Keep editing</Button><Button variant="primary" icon={Send} onClick={submit}>{draft?.status === 'changes_requested' ? 'Resubmit for review' : 'Send for review'}</Button></>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={steps.length} label={steps.length === 1 ? 'step' : 'steps'} />
          <Metric value={checks} label={checks === 1 ? 'independent check' : 'independent checks'} />
          <Metric value={photos} label={photos === 1 ? 'photo step' : 'photo steps'} />
          <Metric value={form.minutes} label="min target" />
        </div>
        <ul className="mt-4 space-y-2.5 text-sm text-ink-2">
          <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> Releases as <b className="text-ink">v{proposal.label}</b> — {!current ? 'the first version of this SOP' : proposal.structural ? 'a structural change' : 'a wording change'}.</li>
          <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-info" /> Needs {APPROVALS_REQUIRED} independent approvals. Your own approval never counts.</li>
          <li className="flex gap-2"><Lock size={16} className="mt-0.5 shrink-0 text-muted" /> {current ? `Staff keep following v${current.version} until a reviewer-approved release.` : 'Staff can’t see it until it is released.'}</li>
          {brandHits.length > 0 && <li className="flex gap-2 rounded-cell bg-amber/[0.08] px-2.5 py-2 text-ink"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" /> Step {brandHits.join(', ')} still mention{brandHits.length === 1 ? 's' : ''} “{brand}” — the source document was written for {imported?.sourceProperty}.</li>}
          {form.steps.some((s) => !s.guestCare.trim()) && <li className="flex gap-2"><Info size={16} className="mt-0.5 shrink-0 text-muted" /> {form.steps.filter((s) => !s.guestCare.trim()).length} step{form.steps.filter((s) => !s.guestCare.trim()).length === 1 ? ' has' : 's have'} no guest-care detail — that’s fine if nothing guest-facing happens there.</li>}
        </ul>
      </Modal>
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function ReadOnlyBanner({ v, current, onRevise }: { v: SopVersion; current?: SopVersion; onRevise: () => void }) {
  const nav = useNavigate()
  const people = useDB((s) => s.people)
  const reject = v.status === 'rejected' ? [...v.reviews].reverse().find((r) => r.decision === 'reject') : undefined
  const msg = v.status === 'in_review' ? { t: `v${v.version} is in review — editing is locked`, b: 'Reviewers approve exactly what you sent. If they request changes, it comes back here for you to edit.', a: <Button size="sm" icon={GitPullRequestArrow} onClick={() => nav(`/author/reviews/${v.id}`)}>Open review</Button> }
    : v.status === 'published' ? { t: `v${v.version} is the published version`, b: 'Staff follow it today. To change it, start a revision — they keep this version until the revision is released.', a: <Button size="sm" variant="primary" onClick={onRevise}>Start revision</Button> }
      : v.status === 'superseded' ? { t: `v${v.version} has been superseded${current ? ` by v${current.version}` : ''}`, b: 'Kept for the record. Rooms that started on it finished on it.', a: <Button size="sm" variant="primary" onClick={onRevise}>Start revision from current</Button> }
        : { t: `v${v.version} was rejected`, b: reject ? `“${reject.comment}” — ${byId(people, reject.reviewerId)?.name}` : 'Start a revision to rework it.', a: <Button size="sm" variant="primary" onClick={onRevise}>Start a new revision</Button> }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line-strong bg-surface-2 px-4 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink-2"><Lock size={15} /></span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-ink">{msg.t}</div><div className="text-sm text-ink-2">{msg.b}</div></div>
      {msg.a}
    </div>
  )
}

function SaveState({ readOnly, status, dirty, saved, updatedAt }: { readOnly: boolean; status?: string; dirty: boolean; saved: boolean; updatedAt?: string }) {
  const [dot, text] = readOnly ? ['bg-muted', `Read only · ${status?.replace('_', ' ')}`]
    : dirty ? ['bg-amber', saved ? 'Unsaved changes' : 'Not saved yet'] : saved && updatedAt ? ['bg-ok', savedAgo(updatedAt)] : ['bg-line-strong', 'Not saved yet']
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2" role="status" aria-live="polite">
      {readOnly ? <Lock size={14} className="text-muted" /> : <span className={clsx('h-2 w-2 rounded-full', dot)} aria-hidden />}
      {text}
      {!readOnly && <span className="hidden text-xs text-muted lg:inline">· <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">S</kbd> to save</span>}
    </span>
  )
}

const Metric = ({ value, label }: { value: ReactNode; label: string }) => (
  <div className="rounded-cell border border-line bg-surface-2 px-3 py-2.5"><div className="text-xl font-semibold tabular text-ink">{value}</div><div className="text-xs text-muted">{label}</div></div>
)

function ImportSummary({ r, steps, canUndo, onUndo, onReplace, saved }: { r: Imported; steps: StepForm[]; canUndo: boolean; onUndo: () => void; onReplace: () => void; saved: boolean }) {
  const roles = useDB((s) => s.jobRoles)
  const found: [boolean, string, ReactNode][] = [
    [r.found.title, 'Title', r.title],
    [r.found.code, 'Code', r.codeKept ? <>{r.codeKept} <span className="text-muted">(kept — document says {r.code})</span></> : r.code],
    [r.found.role, 'Who it is for', r.jobRoleId ? roles.find((x) => x.id === r.jobRoleId)?.name : 'Not recognised — choose below'],
    [r.found.timeTarget, 'Time target', `${r.timeTargetMin} min`],
    [r.found.department, 'Department', r.department ?? 'Not found'],
    [!!(r.effectiveDate || r.revision), 'Source revision', [r.revision && `Rev ${r.revision}`, r.effectiveDate && `effective ${r.effectiveDate}`].filter(Boolean).join(' · ') || 'Not found'],
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cell bg-danger/10 text-danger"><FileText size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink" title={r.source}>{r.source}</div>
          <div className="text-xs text-muted">{r.pages} page{r.pages === 1 ? '' : 's'}{r.sourceSection ? ` · steps from “${r.sourceSection}”${r.sourcePage ? ` (page ${r.sourcePage})` : ''}` : ''}</div>
        </div>
        <div className="flex gap-1.5">
          {canUndo && <Button size="sm" variant="ghost" icon={Undo2} onClick={onUndo}>Undo import</Button>}
          <Button size="sm" icon={RefreshCw} onClick={onReplace}>Replace file</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric value={steps.length} label="steps" />
        <Metric value={steps.filter((s) => s.requireCheck).length} label="independent checks" />
        <Metric value={steps.filter((s) => s.allowPhoto).length} label="photo steps" />
        <Metric value={r.scriptsFound} label="guest scripts found" />
      </div>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {found.map(([ok, k, v]) => (
          <li key={k} className="flex min-w-0 items-start gap-2 text-sm">
            {ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" aria-label="Found" /> : <CircleDashed size={15} className="mt-0.5 shrink-0 text-amber" aria-label="Not found" />}
            <span className="min-w-0"><span className="text-muted">{k}: </span><span className="text-ink">{v}</span></span>
          </li>
        ))}
      </ul>
      {r.purpose && (
        <figure className="rounded-cell border-l-[3px] border-gold-500 bg-gold-50/60 px-3 py-2">
          <figcaption className="text-2xs font-semibold uppercase tracking-wider text-gold-700">Purpose, from the document</figcaption>
          <blockquote className="mt-1 text-sm text-ink-2">{r.purpose}</blockquote>
        </figure>
      )}
      {r.warnings.map((w) => <p key={w} className="flex items-start gap-2 rounded-cell bg-amber/[0.08] px-3 py-2 text-sm text-ink"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber" /> {w}</p>)}
      <p className="flex items-start gap-2 text-xs text-muted"><Info size={14} className="mt-px shrink-0" />
        {saved ? 'Saved as a draft. Staff can’t see it until two reviewers approve and it is released.' : 'Nothing is saved until you save the draft. The importer is a starting point — check every step below.'}</p>
    </div>
  )
}

function TagInput({ id, value, onChange, disabled }: { id: string; value: string[]; onChange: (t: string[]) => void; disabled?: boolean }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const add = (raw: string) => {
    const t = raw.split(/[\s,]+/).map((x) => x.replace(/^#/, '').toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean)
    if (t.length) onChange([...new Set([...value, ...t])].slice(0, MAX_TAGS))
    setText('')
  }
  return (
    <div onClick={() => ref.current?.focus()} className={clsx('input flex min-h-[38px] cursor-text flex-wrap items-center gap-1.5 py-1.5 focus-within:border-forest-600 focus-within:shadow-ring', disabled && 'bg-surface-2')}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-pill bg-forest-50 py-0.5 pl-2 pr-1 text-xs font-medium text-forest-800 ring-1 ring-inset ring-forest-700/15">
          #{t}{!disabled && <button type="button" aria-label={`Remove tag ${t}`} onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== t)) }} className="rounded-full p-0.5 hover:bg-forest-100"><X size={11} /></button>}
        </span>
      ))}
      <input ref={ref} id={id} value={text} disabled={disabled} onChange={(e) => (/[\s,]$/.test(e.target.value) ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)) }}
        onBlur={() => text && add(text)} placeholder={value.length ? '' : 'roomcare, trolley, safety'} className="min-w-[8rem] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/80" />
    </div>
  )
}

function IconPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); window.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label} icon: ${ICON_LABEL[value] ?? value}. Change icon`} title="Change icon" onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-cell border border-line-strong bg-surface text-ink-2 transition hover:border-forest-600 hover:text-forest-700"><StepIcon name={value} size={16} /></button>
      {open && (
        <div role="listbox" aria-label="Step icons" className="absolute left-0 top-full z-30 mt-1.5 grid w-[248px] grid-cols-6 gap-1 rounded-card border border-line bg-surface p-2 shadow-pop">
          {Object.keys(STEP_ICONS).map((k) => (
            <button key={k} type="button" role="option" aria-selected={k === value} aria-label={ICON_LABEL[k] ?? k} title={ICON_LABEL[k] ?? k} onClick={() => { onChange(k); setOpen(false) }}
              className={clsx('grid aspect-square place-items-center rounded-md transition', k === value ? 'bg-forest-900 text-white' : 'text-ink-2 hover:bg-forest-50 hover:text-forest-800')}><StepIcon name={k} size={17} /></button>
          ))}
        </div>
      )}
    </div>
  )
}

function StepCard({ i, s, total, readOnly, error, noteError, onChange, onMove, onDuplicate, onDelete }: {
  i: number; s: StepForm; total: number; readOnly: boolean; error?: string; noteError?: boolean
  onChange: (p: Partial<StepForm>) => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void
}) {
  const n = i + 1
  return (
    <li id={`step-${i}`} className={clsx('rounded-card border bg-surface', error || noteError ? 'border-danger/40' : 'border-line')}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest-900 text-xs font-semibold tabular text-white" aria-label={`Step ${n}`}>{n}</span>
        {readOnly ? <span className="grid h-8 w-8 place-items-center text-ink-2"><StepIcon name={s.icon} /></span> : <IconPicker value={s.icon} onChange={(icon) => onChange({ icon })} label={`Step ${n}`} />}
        <span className="hidden min-w-0 sm:block"><StepFlags s={s} size="xs" /></span>
        {!readOnly && (
          <div className="ml-auto flex items-center">
            <IconButton icon={ArrowUp} size="sm" label={`Move step ${n} up`} disabled={i === 0} onClick={() => onMove(-1)} />
            <IconButton icon={ArrowDown} size="sm" label={`Move step ${n} down`} disabled={i === total - 1} onClick={() => onMove(1)} />
            <IconButton icon={CopyPlus} size="sm" label={`Duplicate step ${n}`} disabled={total >= MAX_STEPS} onClick={onDuplicate} />
            <IconButton icon={Trash2} size="sm" label={`Delete step ${n}`} disabled={total === 1} onClick={onDelete} className="hover:!text-danger" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        {s.notes.map((note, k) => (
          <div key={k} id={k === 0 ? `step-${i}-notes` : undefined} tabIndex={-1} className={clsx('flex flex-wrap items-start gap-2 rounded-cell border p-3 text-sm', noteError ? 'border-danger/40 bg-danger/[0.04]' : 'border-amber/30 bg-amber/[0.07]')}>
            <MessageSquareQuote size={15} className="mt-0.5 shrink-0 text-amber" />
            <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-ink">Feedback to apply</div><div className="text-ink-2">“{note}”</div></div>
            {!readOnly && <Button size="xs" icon={CheckCircle2} onClick={() => onChange({ notes: s.notes.filter((_, j) => j !== k) })}>Mark applied</Button>}
          </div>
        ))}
        <Field label="Instruction" required htmlFor={`step-${i}-instruction`} error={error}>
          <Textarea id={`step-${i}-instruction`} rows={2} maxLength={400} value={s.instruction} invalid={!!error} onChange={(e) => onChange({ instruction: e.target.value })}
            placeholder="What should the employee do? e.g. Knock twice, announce housekeeping and wait ten seconds." />
        </Field>
        <Field label={<>Guest-care detail <span className="font-normal text-muted">· optional</span></>} htmlFor={`step-${i}-care`}>
          <Textarea id={`step-${i}-care`} rows={2} maxLength={400} value={s.guestCare} onChange={(e) => onChange({ guestCare: e.target.value })} placeholder="e.g. If a guest answers, offer a later time — never enter an occupied room." />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-cell border border-line px-3 py-2.5"><Switch checked={s.requireCheck} disabled={readOnly} ariaLabel={`Step ${n}: independent check`} onChange={(v) => onChange({ requireCheck: v })} label="Independent check" description="Someone else verifies this before the task closes." /></div>
          <div className="rounded-cell border border-line px-3 py-2.5"><Switch checked={s.allowPhoto} disabled={readOnly} ariaLabel={`Step ${n}: allow photo`} onChange={(v) => onChange({ allowPhoto: v })} label="Allow photo" description="Staff can attach a photo as evidence." /></div>
        </div>
      </div>
    </li>
  )
}

