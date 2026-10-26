// Version comparison for SOPs: which steps were added, removed, reworded, re-flagged or moved, plus a word-level
// diff for reworded text. Steps keep their id across revisions, so matching is by id.
import type { SopStep, SopVersion } from '@/lib/types'

export type StepChangeKind = 'added' | 'removed' | 'reworded' | 'flags' | 'moved' | 'same'

export interface StepDiff {
  kind: StepChangeKind
  /** The step as it is in the newer version (for removed steps: as it was). */
  step: SopStep
  prev?: SopStep
  /** 1-based position in the newer version (0 for removed). */
  n: number
  /** 1-based position in the older version (0 for added). */
  was: number
  changes: string[]
}

export function diffSteps(base: SopStep[], next: SopStep[]): StepDiff[] {
  const out: StepDiff[] = []
  next.forEach((s, i) => {
    const j = base.findIndex((b) => b.id === s.id)
    const prev = j >= 0 ? base[j] : undefined
    if (!prev) { out.push({ kind: 'added', step: s, n: i + 1, was: 0, changes: ['New step'] }); return }
    const changes: string[] = []
    const reworded = prev.instruction.trim() !== s.instruction.trim()
    const care = prev.guestCare.trim() !== s.guestCare.trim()
    if (reworded) changes.push('Instruction reworded')
    if (care) changes.push(prev.guestCare.trim() ? (s.guestCare.trim() ? 'Guest-care detail changed' : 'Guest-care detail removed') : 'Guest-care detail added')
    if (prev.requireCheck !== s.requireCheck) changes.push(s.requireCheck ? 'Independent check added' : 'Independent check removed')
    if (prev.allowPhoto !== s.allowPhoto) changes.push(s.allowPhoto ? 'Photo allowed' : 'Photo no longer allowed')
    if (prev.icon !== s.icon) changes.push('Icon changed')
    // A move only counts when the step's position changed relative to the steps both versions share.
    const sharedBefore = base.filter((b) => next.some((x) => x.id === b.id)).map((b) => b.id)
    const sharedAfter = next.filter((x) => base.some((b) => b.id === x.id)).map((x) => x.id)
    const moved = sharedBefore.indexOf(s.id) !== sharedAfter.indexOf(s.id)
    if (moved) changes.push(`Moved from step ${j + 1} to ${i + 1}`)
    const kind: StepChangeKind = reworded || care ? 'reworded' : changes.some((c) => /check|photo/i.test(c)) ? 'flags' : moved ? 'moved' : changes.length ? 'flags' : 'same'
    out.push({ kind, step: s, prev, n: i + 1, was: j + 1, changes })
  })
  // Removed steps are shown where they used to be.
  base.forEach((b, j) => {
    if (next.some((s) => s.id === b.id)) return
    const at = out.findIndex((d) => d.was > j + 1 || (d.kind === 'added' && d.n > j + 1))
    const row: StepDiff = { kind: 'removed', step: b, n: 0, was: j + 1, changes: ['Step removed'] }
    if (at < 0) out.push(row); else out.splice(at, 0, row)
  })
  return out
}

export interface DiffSummary { added: number; removed: number; reworded: number; flags: number; moved: number; same: number; total: number }
export function summarize(rows: StepDiff[]): DiffSummary {
  const c = { added: 0, removed: 0, reworded: 0, flags: 0, moved: 0, same: 0 }
  rows.forEach((r) => { c[r.kind]++ })
  return { ...c, total: rows.length - c.same }
}

export interface FieldChange { field: string; before: string; after: string }
export function diffFields(base: SopVersion | undefined, next: SopVersion, roleName: (id: string) => string): FieldChange[] {
  if (!base) return []
  const out: FieldChange[] = []
  const add = (field: string, a: string, b: string) => { if (a !== b) out.push({ field, before: a || '—', after: b || '—' }) }
  add('Title', base.title, next.title)
  add('Time target', `${base.timeTargetMin} min`, `${next.timeTargetMin} min`)
  add('Who it is for', roleName(base.jobRoleId), roleName(next.jobRoleId))
  add('Language', base.language, next.language)
  add('Tags', base.tags.map((t) => `#${t}`).join(' '), next.tags.map((t) => `#${t}`).join(' '))
  return out
}

export type WordPart = { text: string; kind: 'same' | 'add' | 'del' }
/** Word-level diff (LCS) for reworded instructions; whitespace is kept with the word before it. */
export function wordDiff(a: string, b: string): WordPart[] {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean)
  if (A.length * B.length > 40_000) return [{ text: a, kind: 'del' }, { text: ' ', kind: 'same' }, { text: b, kind: 'add' }]
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0))
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: WordPart[] = []
  const push = (text: string, kind: WordPart['kind']) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text; else out.push({ text, kind })
  }
  let i = 0, j = 0
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push(A[i], 'same'); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push(A[i], 'del'); i++ }
    else { push(B[j], 'add'); j++ }
  }
  while (i < A.length) push(A[i++], 'del')
  while (j < B.length) push(B[j++], 'add')
  return out
}
