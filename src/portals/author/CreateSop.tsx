import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Eye, FileUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { SopSteps } from '@/components/SopSteps'
import { Button, Drawer, PageHeader, STEP_ICONS, ShiftEventInterstitial, StepIcon, Tabs } from '@/components/ui'
import { byId, proposeVersion, useDB } from '@/lib/db'
import { parseSop, readPdfLines, textToLines, type ImportedSop } from '@/lib/sopImport'
import type { SopVersion } from '@/lib/types'
import { usePersona } from '@/shell/PortalShell'

export const MAX_STEPS = 30
const MAX_TAGS = 20
const parseTags = (s: string) => s.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean)

const schema = z.object({
  title: z.string().trim().min(3, 'Give the SOP a title'),
  code: z.string().trim().regex(/^[A-Z]{2,5}(-[A-Z0-9]+)+$/, 'Use a short code like HK-102'),
  jobRoleId: z.string().min(1),
  language: z.string().min(1),
  timeTargetMin: z.coerce.number().int().min(1, 'At least 1 minute').max(240),
  tags: z.string().refine((s) => parseTags(s).length <= MAX_TAGS, `Up to ${MAX_TAGS} tags`),
  steps: z.array(z.object({
    id: z.string(), icon: z.string(), instruction: z.string().trim().min(1, 'Say what the employee should do'),
    guestCare: z.string(), requireCheck: z.boolean(), allowPhoto: z.boolean(),
  })).min(1).max(MAX_STEPS),
})
type Form = z.infer<typeof schema>

const toForm = (v: SopVersion): Form => ({ ...v, tags: v.tags.map((t) => `#${t}`).join(' ') })

export function CreateSop() {
  const { id } = useParams()
  const nav = useNavigate()
  const { person } = usePersona('author')
  const { jobRoles, sopVersions, property, saveDraft, newDraftFrom, submitForReview } = useDB()
  const existing = byId(sopVersions, id)
  const [draft, setDraft] = useState<SopVersion | null>(existing ?? null)
  const [preview, setPreview] = useState(false)
  const [previewState, setPreviewState] = useState<'normal' | 'gated' | 'urgent'>('normal')
  const [iconFor, setIconFor] = useState<number | null>(null)
  const base = byId(sopVersions, draft?.baseVersionId)

  const blank = (): Form => ({ title: '', code: '', jobRoleId: jobRoles[0]?.id ?? '', language: 'English', timeTargetMin: property.defaultTimeTargetMin, tags: '',
    steps: [{ id: `st-${Date.now()}`, icon: 'check', instruction: '', guestCare: '', requireCheck: false, allowPhoto: false }] })
  const { register, control, handleSubmit, watch, reset, formState: { errors, isDirty } } = useForm<Form>({
    resolver: zodResolver(schema), defaultValues: existing ? toForm(existing) : blank(),
  })
  // Re-load the form only when navigating between drafts (not on first mount, and not after our own save).
  const lastId = useRef(id)
  useEffect(() => {
    if (lastId.current === id) return
    const wasNew = !lastId.current
    lastId.current = id
    if (wasNew && id === draft?.id) return
    if (existing) { setDraft(existing); reset(toForm(existing)) } else if (!id) { setDraft(null); reset(blank()) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const { fields, append, remove, move, update } = useFieldArray({ control, name: 'steps' })
  const values = watch()
  const [imported, setImported] = useState<ImportedSop | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const onImport = async (file: File | undefined) => {
    if (!file) return
    setImporting(true); setImportError(null)
    try {
      const lines = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await readPdfLines(file) : textToLines(await file.text())
      const r = parseSop(lines, jobRoles, file.name)
      if (!r.steps.length) throw new Error(r.warnings[0] ?? 'No steps found in this document.')
      reset({ ...values, title: r.title, code: r.code, timeTargetMin: r.timeTargetMin, jobRoleId: r.jobRoleId ?? values.jobRoleId,
        tags: r.tags.map((t) => `#${t}`).join(' '), steps: r.steps }, { keepDefaultValues: true })
      setImported(r)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'This file could not be read.')
    } finally { setImporting(false) }
  }
  const readOnly = !!draft && draft.status !== 'draft' && draft.status !== 'changes_requested'

  const persist = (f: Form): SopVersion => {
    const d = draft ?? newDraftFrom(null, person!.id)
    const saved = saveDraft({ ...d, ...f, tags: parseTags(f.tags), status: d.status === 'changes_requested' ? 'changes_requested' : 'draft' })
    setDraft(saved); reset(f)
    if (!id) nav(`/author/edit/${saved.id}`, { replace: true })
    return saved
  }
  const onSave = handleSubmit(persist)
  const onSubmitReview = handleSubmit((f) => { const s = persist(f); if (submitForReview(s.id)) nav('/author/reviews') })
  const stage = !draft || draft.status === 'draft' || draft.status === 'changes_requested' ? 0 : draft.status === 'in_review' ? 1 : 2
  const proposed = draft ? proposeVersion({ ...draft, ...values, tags: [] } as SopVersion, base) : { label: '1.0', structural: true }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader eyebrow="Author" title={existing ? `${existing.code || 'Untitled'} · draft` : 'Create SOP'}
        right={<Button variant="light" onClick={() => setPreview(true)}><Eye size={16} /> Preview draft</Button>} />
      <ol className="flex items-center gap-2 text-sm" aria-label="Pipeline">
        {['Draft', 'Review', 'Release'].map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={clsx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold', i <= stage ? 'bg-gold-500 text-forest-950' : 'bg-white/10 text-sage-300')}>{i + 1}</span>
            <span className={i === stage ? 'font-semibold text-white' : 'text-sage-300'}>{s}</span>{i < 2 && <span className="mx-1 h-px w-8 bg-white/15" />}
          </li>
        ))}
        {draft && <li className="ml-auto text-xs text-sage-300">Releases as {proposed.label} · {base ? (proposed.structural ? 'structural change' : 'wording change') : 'first version'}</li>}
      </ol>

      <fieldset disabled={readOnly} className="space-y-6">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-white">Start from a document</h2>
              <p className="text-sm text-sage-300">Upload an SOP as a PDF or text file. It fills this form as a draft; nothing is saved or sent until you do.</p></div>
            <label className={clsx('inline-flex cursor-pointer items-center gap-2 rounded-pill bg-gold-500 px-4 py-2 text-sm font-semibold text-forest-950', (readOnly || importing) && 'pointer-events-none opacity-50')}>
              <FileUp size={16} /> {importing ? 'Reading…' : 'Upload SOP'}
              <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="sr-only" aria-label="Upload SOP document" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
          {importError && <p className="mt-3 text-sm text-danger">{importError}</p>}
          {imported && (
            <div className="mt-3 rounded-xl bg-forest-950/40 p-3 text-sm text-sage-200">
              Imported <b className="text-white">{imported.steps.length} steps</b> from {imported.source}
              {' '}· {imported.steps.filter((x) => x.requireCheck).length} marked for a recorded check. Check every step, then save the draft.
              {imported.warnings.map((w) => <div key={w} className="mt-1 text-amber">{w}</div>)}
            </div>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">SOP essentials</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="SOP title" error={errors.title?.message}><input className="input" placeholder="Prepare the trolley for a room reset" {...register('title')} /></F>
            <F label="SOP code" error={errors.code?.message}><input className="input uppercase" placeholder="HK-102" {...register('code', { setValueAs: (v: string) => v.toUpperCase() })} /></F>
            <F label="Who it is for"><select className="input" {...register('jobRoleId')}>{jobRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></F>
            <F label="Language"><select className="input" {...register('language')}>{['English', 'Sinhala', 'Tamil'].map((l) => <option key={l}>{l}</option>)}</select></F>
            <F label="Time target (minutes)" error={errors.timeTargetMin?.message}><input type="number" min={1} className="input" {...register('timeTargetMin')} /></F>
            <F label="Search tags" error={errors.tags?.message}>
              <input className="input" placeholder="#roomcare #trolley #safety" {...register('tags')} />
              <span className="mt-1.5 block text-xs text-sage-300">Up to 20 tags, separated by a space or comma. A time target must never override safety or guest privacy.</span>
            </F>
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-1 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">The work, step by step</h2><span className="text-sm text-sage-300">{fields.length}/{MAX_STEPS} steps</span></div>
          <p className="mb-5 text-sm text-sage-300">Use plain words. Say what to do, when to stop, and what a good finish looks like.</p>
          <ol className="space-y-4">
            <AnimatePresence initial={false}>
              {fields.map((f, i) => (
                <motion.li key={f.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-white/10 bg-forest-950/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-display text-xl font-bold text-gold-400">{i + 1}</span>
                      <button type="button" onClick={() => setIconFor(i)} className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2 py-1 text-xs text-sage-200 hover:border-gold-500">
                        <StepIcon name={values.steps?.[i]?.icon ?? 'check'} size={14} /> {values.steps?.[i]?.icon ? 'Change icon' : 'Add icon'}
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Up"><ArrowUp size={14} /> Up</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={i === fields.length - 1} onClick={() => move(i, i + 1)} aria-label="Down"><ArrowDown size={14} /> Down</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={fields.length === 1} onClick={() => remove(i)} aria-label="Remove"><Trash2 size={14} /> Remove</Button>
                    </div>
                  </div>
                  <F label="What should the employee do?" error={errors.steps?.[i]?.instruction?.message}><textarea rows={2} className="input" {...register(`steps.${i}.instruction`)} /></F>
                  <div className="mt-3"><F label="Guest-care detail (optional)"><textarea rows={2} className="input" {...register(`steps.${i}.guestCare`)} /></F></div>
                  <div className="mt-3 flex flex-wrap gap-5 text-sm text-sage-200">
                    <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[rgb(201,162,75)]" {...register(`steps.${i}.requireCheck`)} /> Require a recorded check for this step</label>
                    <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[rgb(201,162,75)]" {...register(`steps.${i}.allowPhoto`)} /> Allow an optional photo for this step</label>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          <Button type="button" variant="primary" className="mt-4" disabled={fields.length >= MAX_STEPS}
            onClick={() => append({ id: `st-${Date.now()}`, icon: 'check', instruction: '', guestCare: '', requireCheck: false, allowPhoto: false })}><Plus size={16} /> Add a step</Button>
        </section>
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-forest-950/95 backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-10">
          <span className="text-sm text-sage-300">{readOnly ? `In ${draft!.status.replace('_', ' ')} — read only` : isDirty || !draft ? 'Not saved yet' : `Saved · ${new Date(draft.updatedAt).toLocaleTimeString()}`}</span>
          {!readOnly && <div className="flex gap-2">
            <Button variant="ghost" onClick={onSubmitReview}>Send for review</Button>
            <Button variant="gold" onClick={onSave}>Save draft</Button>
          </div>}
        </div>
      </div>

      <Drawer open={iconFor !== null} onClose={() => setIconFor(null)} title="Choose an icon" side="bottom">
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {Object.keys(STEP_ICONS).map((k) => <button key={k} onClick={() => { update(iconFor!, { ...values.steps[iconFor!], icon: k }); setIconFor(null) }} className="grid aspect-square place-items-center rounded-xl border border-white/10 hover:border-gold-500" aria-label={k}><StepIcon name={k} size={20} /></button>)}
        </div>
      </Drawer>
      <Drawer open={preview} onClose={() => setPreview(false)} title="Preview · as an employee sees it">
        <Tabs value={previewState} onChange={setPreviewState} items={[{ id: 'normal', label: 'In progress' }, { id: 'gated', label: 'Do not enter yet' }, { id: 'urgent', label: 'Urgent ended' }]} />
        <div className="mt-4 space-y-3">
          <div className="card p-4"><div className="font-display text-4xl font-bold text-white">114</div><div className="text-sm text-sage-300">{values.title || 'Untitled SOP'} · {values.timeTargetMin} min</div></div>
          {previewState === 'gated' && <div className="rounded-card bg-amber/15 p-3 text-sm font-semibold text-amber">Do not enter yet · this room opens at its scheduled time</div>}
          <SopSteps steps={values.steps ?? []} version={draft?.version ?? '1.0'} interactive={previewState === 'normal'} done={[]} />
        </div>
        <ShiftEventInterstitial open={preview && previewState === 'urgent'} title="Priority changed" lead="This urgent request has ended. Nothing changed. Carry on with your work; your manager can see it ended."
          details={<><div className="font-display text-3xl font-bold">Room 114</div><div className="text-muted">Reason: It's been pending for too long</div></>} actionLabel="Carry on" onAction={() => setPreviewState('normal')}
          footer="No room in progress · Going now pauses nothing" />
      </Drawer>
    </div>
  )
}

const F = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <label className="block"><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-danger">{error}</span>}</label>
)
