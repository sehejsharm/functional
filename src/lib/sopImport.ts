// Turns an uploaded SOP document (PDF or plain text) into a draft the author can review: title, code,
// time target, job role, department and a phone-sized checklist of steps. Nothing is saved until the author saves it.
import type { JobRole, SopStep } from './types'

export interface TextLine { text: string; size: number; page: number }

export interface ImportedSop {
  title: string; code: string; timeTargetMin: number; jobRoleId: string | null; tags: string[]
  steps: SopStep[]; source: string; warnings: string[]
  /** Everything below is best-effort detail for the import summary. */
  department?: string
  /** Revision label printed on the document ("1.0"). */
  revision?: string
  effectiveDate?: string
  /** The heading the steps were taken from ("Quick reference — bell desk") and its page. */
  sourceSection?: string
  sourcePage?: number
  /** Hotel named in the document's running header, when it is not this property. */
  sourceProperty?: string
  purpose?: string
  pages: number
  /** How many steps got a guest-facing script from the detailed sections of the document. */
  scriptsFound: number
  /** Which fields were found in the document (true) or defaulted (false). */
  found: { title: boolean; code: boolean; timeTarget: boolean; role: boolean; department: boolean; steps: boolean }
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

export const textToLines = (text: string): TextLine[] => {
  // Plain text has no font sizes: treat markdown-style "# Heading" lines as headings.
  return text.split(/\r?\n/).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map((t) => (/^#{1,3}\s/.test(t) ? { text: t.replace(/^#+\s*/, ''), size: 14, page: 1 } : { text: t.replace(/^[-*•]\s+(?=\d)/, ''), size: 10, page: 1 }))
}

const ITEM = /^(\d{1,2})[.)]?\s+(\S.*)$/

/** Step icon from the step's lead word first ("Tag — …"), then from the whole line. Order matters. */
const ICONS: [RegExp, string][] = [
  [/\b(knock|door|enter|porch|vehicle|move|arriv\w*)\b/i, 'door'],
  [/\b(greet\w*|welcome|announce|signal|bell)\b/i, 'bell'],
  [/\b(fragile|valuables?|jewell?ery|passport)\b/i, 'case'],
  [/\b(screen\w*|security|scanner|safe|lock\w*|chemicals?)\b/i, 'shield'],
  [/\b(log|record|tag\w*|reconcile|close|sign|post|note|folio|sheet)\b/i, 'clipboard'],
  [/\b(deliver\w*|trolley|cart|restock|load)\b/i, 'cart'],
  [/\b(luggage|bags?|suitcases?|place|rack|stage)\b/i, 'luggage'],
  [/\b(bed|linen|pillows?|mattress)\b/i, 'bed'],
  [/\b(bath\w*|shower|toilet|washroom)\b/i, 'bath'],
  [/\b(clean\w*|spray|polish|mop|wipe|dust)\b/i, 'spray'],
  [/\b(food|minibar|tray|beverage|breakfast)\b/i, 'food'],
  [/\b(spill|hazard|alert|emergency|fire)\b/i, 'alert'],
  [/\b(night|turndown|evening)\b/i, 'moon'],
  [/\b(check|inspect|look|confirm|count|walk)\b/i, 'eye'],
]
const iconFor = (head: string, text: string) => ICONS.find(([re]) => re.test(head))?.[1] ?? ICONS.find(([re]) => re.test(text))?.[1] ?? 'check'

const STOP = new Set(['with', 'from', 'that', 'this', 'then', 'they', 'their', 'there', 'when', 'what', 'into', 'your', 'have', 'each', 'every', 'never', 'only',
  'once', 'than', 'were', 'will', 'would', 'which', 'while', 'before', 'after', 'about', 'guest', 'guests', 'room', 'piece', 'pieces', 'anything', 'back'])
const stem = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '').replace(/(ing|ed|es|s)$/, '')
const words = (s: string) => new Set(s.split(/\s+/).map(stem).filter((w) => w.length > 3 && !STOP.has(w)))

const DEPARTMENTS: [RegExp, string][] = [
  [/front\s*office|front desk|concierge|bell desk|reception/i, 'Front office'],
  [/housekeeping/i, 'Housekeeping'],
  [/public area/i, 'Public areas'],
  [/food\s*(and|&)\s*beverage|f\s*&\s*b|restaurant|banquet/i, 'Food & beverage'],
  [/engineering|maintenance/i, 'Engineering'],
  [/security|safety/i, 'Safety'],
]
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s,·(/-])([a-z])/g, (_, a, b) => a + b.toUpperCase())

export function parseSop(lines: TextLine[], roles: JobRole[], fileName = 'document', opts: { propertyName?: string } = {}): ImportedSop {
  const warnings: string[] = []
  const codeRe = /\b(SOP)\s*[/\-]\s*([A-Z]{1,4})\s*[/\-]\s*(\d{1,4})/i
  // Running headers/footers repeat on every page; drop them (but remember the header — it names the hotel).
  const norm = (t: string) => t.replace(/\d+\s*\/\s*\d+$/, '').trim()
  const seen = new Map<string, number>()
  lines.forEach((l) => seen.set(norm(l.text), (seen.get(norm(l.text)) ?? 0) + 1))
  const pages = new Set(lines.map((l) => l.page)).size
  const repeated = (l: TextLine) => pages >= 3 && (seen.get(norm(l.text)) ?? 0) >= 3
  const body = lines.filter((l) => !repeated(l))

  const header = lines.find((l) => repeated(l) && l.page > 1 && !/prepared by|page\s*\d/i.test(l.text))
  let sourceProperty: string | undefined
  if (header) {
    const name = header.text.replace(codeRe, '').replace(/·?\s*rev(ision)?\.?\s*[\d.]+/i, '').replace(/[·\s]+$/, '').trim()
    if (name.length > 3 && name.length < 60) sourceProperty = /[a-z]/.test(name) ? name : titleCase(name)
  }

  const sizes = body.map((l) => Math.round(l.size))
  const bodySize = [...new Set(sizes)].sort((a, b) => sizes.filter((s) => s === b).length - sizes.filter((s) => s === a).length)[0] ?? 10
  const isHeading = (l: TextLine) => Math.round(l.size) > bodySize + 0.5 || (l.text.split(' ').length <= 3 && !/[.,;:]$/.test(l.text) && !ITEM.test(l.text))

  // Numbered lists, each remembering the headings above it.
  type List = { headings: string[]; items: string[]; page: number }
  const lists: List[] = []
  const headings: string[] = []
  let cur: List | null = null
  for (const l of body) {
    const m = l.text.match(ITEM)
    const n = m ? Number(m[1]) : 0
    if (m && Math.round(l.size) <= bodySize + 0.5 && (n === 1 || (cur && n === cur.items.length + 1))) {
      if (n === 1) { cur = { headings: headings.slice(-3), items: [], page: l.page }; lists.push(cur) }
      cur!.items.push(m[2])
    } else if (isHeading(l)) {
      headings.push(l.text); cur = null
    } else if (cur && !/^[A-Z][A-Z\s·,]+$/.test(l.text)) {
      cur.items[cur.items.length - 1] += ` ${l.text}`
    } else cur = null
  }

  const want = (l: List, re: RegExp) => l.headings.some((h) => re.test(h))
  const QUICK = /quick reference|checklist|in order|step[- ]by[- ]step/i
  const quick = lists.filter((l) => l.items.length >= 3 && want(l, QUICK)).pop()
  let chosenList: List | undefined = quick
  let chosen: string[]
  if (quick) chosen = quick.items
  else {
    const stageLists = lists.filter((l) => want(l, /\b(stage|step|procedure|process)\b/i))
    chosen = stageLists.length ? stageLists.flatMap((l) => l.items) : ([...lists].sort((a, b) => b.items.length - a.items.length)[0]?.items ?? [])
    chosenList = stageLists[0] ?? [...lists].sort((a, b) => b.items.length - a.items.length)[0]
  }
  if (!chosen.length) warnings.push('No numbered steps were found. Add the steps by hand.')
  if (chosen.length > MAX_STEPS) { warnings.push(`The document has ${chosen.length} steps; the first ${MAX_STEPS} were kept.`); chosen = chosen.slice(0, MAX_STEPS) }
  const sourceHeading = chosenList ? [...chosenList.headings].reverse().find((h) => Math.round(body.find((b) => b.text === h)?.size ?? 0) > bodySize + 0.5) ?? chosenList.headings[chosenList.headings.length - 1] : undefined
  const sourceSection = sourceHeading?.replace(/^\d{1,2}\s+/, '')

  // The detailed sections usually carry the exact words to say to the guest; attach them to the matching quick step.
  const detail = lists.filter((l) => l !== chosenList).flatMap((l) => l.items)
  const quote = (s: string) => s.match(/[“"]([^”"]{8,160})[”"]/)?.[1]?.trim()
  let scriptsFound = 0

  const stamp = Date.now().toString(36)
  const steps: SopStep[] = chosen.map((raw, i) => {
    const text = raw.replace(/\s+/g, ' ').trim()
    const [head, ...rest] = text.split(/\s+[—–]\s+/)
    const instruction = rest.length ? `${head}: ${rest.join(' — ')}` : text
    let guestCare = ''
    if (quick && detail.length) {
      const mine = words(text), lead = stem(head.split(/\s+/)[0] ?? '')
      const scored = detail.map((d) => {
        const dw = words(d)
        let s = [...mine].filter((w) => dw.has(w)).length
        if (lead.length > 2 && stem(d.split(/\s+/)[0] ?? '') === lead) s += 2
        return { d, s }
      }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s)
      const said = scored.slice(0, 2).map((x) => quote(x.d)).find(Boolean)
      if (said) { guestCare = `Say: “${said}”`; scriptsFound++ }
    }
    return {
      id: `imp-${stamp}-${i}`,
      icon: iconFor(rest.length ? head : text.split(/\s+/).slice(0, 2).join(' '), text),
      instruction: instruction.slice(0, 400),
      guestCare,
      requireCheck: /\b(confirm|count|screen|log|verify|reconcile)\w*/i.test(text),
      allowPhoto: /\b(damage|condition|photo)\w*/i.test(text),
    }
  })

  const all = body.map((l) => l.text).join('\n')
  const titleLine = [...body].filter((l) => l.text.length > 3 && l.text.length < 90 && !/^[A-Z\s·,]+$/.test(l.text) && !ITEM.test(l.text)).sort((a, b) => b.size - a.size)[0]
  const title = titleLine?.text ?? fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')
  const codeMatch = all.match(codeRe) ?? all.match(/\b([A-Z]{2,5}(?:-[A-Z0-9]{1,8}){1,3})\b/)
  const code = codeMatch ? codeMatch.slice(1).filter(Boolean).join('-').toUpperCase()
    : title.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 3).map((w) => w[0]).join('').toUpperCase().padEnd(2, 'X') + '-01'
  const minutes = all.match(/within\s+(\d{1,3})\s*min/i)
  const timeTargetMin = Math.min(240, Math.max(1, minutes ? Number(minutes[1]) : 15))
  if (!minutes) warnings.push('No time target was found; 15 minutes was used.')

  // Job role: the role whose most distinctive word is mentioned most often (shared words don't tell roles apart).
  const lower = all.toLowerCase()
  const generic = new Set(['room', 'desk', 'area', 'public', 'colleague', 'guest', 'front', 'shift', 'bell', 'manager', 'supervisor', 'attendant'])
  const count = (w: string) => lower.split(w).length - 1
  const score = (r: JobRole) => {
    const ws = r.name.toLowerCase().split(/[\s/]+/).filter((w) => w.length > 3 && !generic.has(w))
    return { max: Math.max(0, ...ws.map(count)), sum: ws.reduce((s, w) => s + count(w), 0) }
  }
  const best = [...roles].map((r) => ({ r, ...score(r) })).sort((a, b) => b.max - a.max || b.sum - a.sum)[0]
  const jobRoleId = best && best.max > 0 ? best.r.id : null
  if (!jobRoleId) warnings.push('No job role was recognised; choose who this SOP is for.')

  // Department, revision and effective date usually sit in the document's front matter (first page).
  const front = body.filter((l) => l.page === 1).map((l) => l.text).join('\n')
  const department = DEPARTMENTS.find(([re]) => re.test(front))?.[1] ?? DEPARTMENTS.find(([re]) => re.test(all))?.[1]
  const revision = all.match(/\brev(?:ision)?\.?\s*(\d+(?:\.\d+)?)/i)?.[1]
  const effectiveDate = front.match(new RegExp(`\\b(\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4})\\b`, 'i'))?.[1]
  // The first full paragraph on page one (often set larger than the body) is usually the purpose statement.
  const para: string[] = []
  let paraSize = 0
  for (const l of body.filter((x) => x.page === 1)) {
    if (l === titleLine) continue
    const sz = Math.round(l.size)
    if (!para.length) {
      if (sz >= bodySize && l.text.length > 50 && /[a-z]/.test(l.text) && !ITEM.test(l.text)) { para.push(l.text); paraSize = sz }
    } else if (sz === paraSize && !ITEM.test(l.text) && para.join(' ').length < 400) para.push(l.text)
    else break
  }
  const purpose = para.join(' ').length > 60 ? para.join(' ').replace(/(\w)- (\w)/g, '$1-$2').slice(0, 400) : undefined

  if (sourceProperty && opts.propertyName) {
    const brand = sourceProperty.split(/[\s,·]+/)[0]
    if (brand && !opts.propertyName.toLowerCase().includes(brand.toLowerCase())) {
      const named = steps.map((s, i) => (`${s.instruction} ${s.guestCare}`.toLowerCase().includes(brand.toLowerCase()) ? i + 1 : 0)).filter(Boolean)
      warnings.push(`Written for ${sourceProperty}. Replace hotel-specific names before release${named.length ? ` — step ${named.join(', ')} mention${named.length === 1 ? 's' : ''} “${brand}”` : ''}.`)
    }
  }

  const tags = [...new Set(title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3))].slice(0, 5)
  return {
    title, code, timeTargetMin, jobRoleId, tags, steps, source: fileName, warnings,
    department, revision, effectiveDate, sourceSection, sourcePage: chosenList?.page, sourceProperty, purpose, pages, scriptsFound,
    found: { title: !!titleLine, code: !!codeMatch, timeTarget: !!minutes, role: !!jobRoleId, department: !!department, steps: steps.length > 0 },
  }
}
