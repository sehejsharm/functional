// Turns an uploaded SOP document (PDF or plain text) into a draft the author can review: title, code,
// time target, job role and a phone-sized checklist of steps. Nothing is saved until the author saves it.
import type { JobRole, SopStep } from './types'

export interface TextLine { text: string; size: number; page: number }

export interface ImportedSop {
  title: string; code: string; timeTargetMin: number; jobRoleId: string | null; tags: string[]
  steps: SopStep[]; source: string; warnings: string[]
}

const MAX_STEPS = 30

/** Reads a PDF in the browser and rebuilds its visual lines (pdf.js gives positioned text runs). */
export async function readPdfLines(file: File): Promise<TextLine[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const lines: TextLine[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const rows = new Map<number, { x: number; s: string; size: number }[]>()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const y = Math.round(it.transform[5] / 2) * 2
      const row = rows.get(y) ?? []
      row.push({ x: it.transform[4], s: it.str, size: Math.abs(it.transform[3]) || it.height })
      rows.set(y, row)
    }
    ;[...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, row]) => {
      row.sort((a, b) => a.x - b.x)
      const text = row.map((r) => r.s).join(' ').replace(/\s+/g, ' ').trim()
      if (text) lines.push({ text, size: Math.max(...row.map((r) => r.size)), page: p })
    })
  }
  return lines
}

export const textToLines = (text: string): TextLine[] =>
  text.split(/\r?\n/).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).map((text) => ({ text, size: 10, page: 1 }))

const ITEM = /^(\d{1,2})[.)]?\s+(\S.*)$/
const ICONS: [RegExp, string][] = [
  [/\b(door|knock|enter|porch|vehicle)\b/i, 'door'], [/\b(bed|linen)\b/i, 'bed'], [/\b(bath|shower|toilet)\b/i, 'bath'],
  [/\b(screen|security|safe)\b/i, 'shield'], [/\b(log|record|tag|reconcile|close)\b/i, 'clipboard'], [/\b(trolley|cart|deliver|luggage|bag)\b/i, 'cart'],
  [/\b(greet|welcome|announce|bell)\b/i, 'bell'], [/\b(check|inspect|look|confirm|count)\b/i, 'eye'],
]

export function parseSop(lines: TextLine[], roles: JobRole[], fileName = 'document'): ImportedSop {
  const warnings: string[] = []
  // Running headers/footers repeat on every page; drop them.
  const seen = new Map<string, number>()
  lines.forEach((l) => { const k = l.text.replace(/\d+\s*\/\s*\d+$/, '').trim(); seen.set(k, (seen.get(k) ?? 0) + 1) })
  const pages = new Set(lines.map((l) => l.page)).size
  const body = lines.filter((l) => pages < 3 || (seen.get(l.text.replace(/\d+\s*\/\s*\d+$/, '').trim()) ?? 0) < 3)

  const sizes = body.map((l) => Math.round(l.size))
  const bodySize = [...new Set(sizes)].sort((a, b) => sizes.filter((s) => s === b).length - sizes.filter((s) => s === a).length)[0] ?? 10
  const isHeading = (l: TextLine) => Math.round(l.size) > bodySize + 0.5 || (l.text.split(' ').length <= 3 && !/[.,;:]$/.test(l.text) && !ITEM.test(l.text))

  // Numbered lists, each remembering the headings above it.
  type List = { headings: string[]; items: string[] }
  const lists: List[] = []
  let headings: string[] = []
  let cur: List | null = null
  for (const l of body) {
    const m = l.text.match(ITEM)
    const n = m ? Number(m[1]) : 0
    if (m && Math.round(l.size) <= bodySize + 0.5 && (n === 1 || (cur && n === cur.items.length + 1))) {
      if (n === 1) { cur = { headings: headings.slice(-3), items: [] }; lists.push(cur) }
      cur!.items.push(m[2])
    } else if (isHeading(l)) {
      headings.push(l.text); cur = null
    } else if (cur && !/^[A-Z][A-Z\s·,]+$/.test(l.text)) {
      cur.items[cur.items.length - 1] += ` ${l.text}`
    } else cur = null
  }

  const want = (l: List, re: RegExp) => l.headings.some((h) => re.test(h))
  let chosen = lists.filter((l) => l.items.length >= 3 && want(l, /quick reference|checklist|in order|step[- ]by[- ]step/i)).pop()?.items
  if (!chosen) {
    const stages = lists.filter((l) => want(l, /\b(stage|step|procedure|process)\b/i)).flatMap((l) => l.items)
    chosen = stages.length ? stages : [...lists].sort((a, b) => b.items.length - a.items.length)[0]?.items ?? []
  }
  if (!chosen.length) warnings.push('No numbered steps were found. Add the steps by hand.')
  if (chosen.length > MAX_STEPS) { warnings.push(`The document has ${chosen.length} steps; the first ${MAX_STEPS} were kept.`); chosen = chosen.slice(0, MAX_STEPS) }

  const steps: SopStep[] = chosen.map((raw, i) => {
    const text = raw.replace(/\s+/g, ' ').trim()
    const [head, ...rest] = text.split(/\s+[—–]\s+/)
    const instruction = rest.length ? `${head}: ${rest.join(' — ')}` : text
    return {
      id: `imp-${Date.now().toString(36)}-${i}`,
      icon: ICONS.find(([re]) => re.test(text))?.[1] ?? 'check',
      instruction: instruction.slice(0, 400),
      guestCare: '',
      requireCheck: /\b(confirm|count|screen|log|verify|reconcile)\w*/i.test(text),
      allowPhoto: /\b(damage|condition|photo)\w*/i.test(text),
    }
  })

  const all = body.map((l) => l.text).join('\n')
  const titleLine = [...body].filter((l) => l.text.length > 3 && l.text.length < 90 && !/^[A-Z\s·,]+$/.test(l.text)).sort((a, b) => b.size - a.size)[0]
  const title = titleLine?.text ?? fileName.replace(/\.[^.]+$/, '')
  const codeMatch = all.match(/\b(SOP)\s*[/\-]\s*([A-Z]{1,4})\s*[/\-]\s*(\d{1,4})/i) ?? all.match(/\b([A-Z]{2,5})-([A-Z0-9]{1,6})\b/)
  const code = codeMatch ? codeMatch.slice(1).filter(Boolean).join('-').toUpperCase()
    : title.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 3).map((w) => w[0]).join('').toUpperCase().padEnd(2, 'X') + '-01'
  const minutes = all.match(/within\s+(\d{1,3})\s*min/i)
  const timeTargetMin = Math.min(240, Math.max(1, minutes ? Number(minutes[1]) : 15))
  if (!minutes) warnings.push('No time target was found; 15 minutes was used.')

  const lower = all.toLowerCase()
  const generic = new Set(['room', 'desk', 'area', 'public', 'colleague', 'guest', 'front', 'shift', 'bell']); // shared words that don't tell roles apart
  const score = (r: JobRole) => r.name.toLowerCase().split(/[\s/]+/).filter((w) => w.length > 3 && !generic.has(w)).reduce((s, w) => s + lower.split(w).length - 1, 0)
  const best = [...roles].sort((a, b) => score(b) - score(a))[0]
  const jobRoleId = best && score(best) > 0 ? best.id : null

  const tags = [...new Set(title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3))].slice(0, 5)
  return { title, code, timeTargetMin, jobRoleId, tags, steps, source: fileName, warnings }
}
