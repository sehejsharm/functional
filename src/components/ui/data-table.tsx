import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { downloadCsv } from '@/lib/csv'
import { Button } from './core'
import { Checkbox, SearchBox } from './form'
import { EmptyState } from './layout'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Enables sorting on this column. */
  sort?: (row: T) => string | number | null | undefined
  /** Value for CSV export; falls back to `sort`. Omit both to leave the column out of the export. */
  csv?: (row: T) => string | number | null | undefined
  align?: 'left' | 'right' | 'center'
  width?: string
  className?: string
  /** Hide below the md breakpoint to keep phone layouts readable. */
  hideOnMobile?: boolean
}

export interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  /** Free-text search over whatever this returns for each row. */
  search?: (row: T) => string
  searchPlaceholder?: string
  /** Extra controls rendered left of the toolbar actions (filter selects, segmented controls). */
  filters?: ReactNode
  /** Controls rendered at the right of the toolbar. */
  actions?: ReactNode
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  pageSize?: number
  selectable?: boolean
  /** Rendered in the selection bar when rows are selected. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  empty?: ReactNode
  /** File name (without .csv) — shows an Export button. */
  exportName?: string
  dense?: boolean
  caption?: string
  /** Omit the outer card (when already inside one). */
  bare?: boolean
}

export function DataTable<T>({ rows, columns, rowKey, search, searchPlaceholder = 'Search', filters, actions, initialSort, pageSize = 10, selectable, bulkActions,
  onRowClick, rowClassName, empty, exportName, dense, caption, bare }: DataTableProps<T>) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = needle && search ? rows.filter((r) => search(r).toLowerCase().includes(needle)) : rows
    const col = sort && columns.find((c) => c.key === sort.key)
    if (col?.sort) {
      const f = col.sort
      out = [...out].sort((a, b) => {
        const x = f(a), y = f(b)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
        return sort!.dir === 'asc' ? c : -c
      })
    }
    return out
  }, [rows, q, search, sort, columns])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  useEffect(() => { if (page > pages - 1) setPage(0) }, [pages, page])
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize)
  const selected = filtered.filter((r) => sel.has(rowKey(r)))
  const allOnPage = visible.length > 0 && visible.every((r) => sel.has(rowKey(r)))
  const someOnPage = visible.some((r) => sel.has(rowKey(r)))
  const clear = () => setSel(new Set())

  const toggleSort = (c: Column<T>) => {
    if (!c.sort) return
    setSort((s) => (s?.key !== c.key ? { key: c.key, dir: 'asc' } : s.dir === 'asc' ? { key: c.key, dir: 'desc' } : undefined))
  }
  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv || c.sort)
    downloadCsv(`${exportName}.csv`, [cols.map((c) => (typeof c.header === 'string' ? c.header : c.key)), ...filtered.map((r) => cols.map((c) => (c.csv ?? c.sort)!(r) ?? ''))])
  }
  const pad = dense ? 'py-2' : 'py-3'
  const showToolbar = search || filters || actions || exportName

  const body = (
    <>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {search && <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0) }} placeholder={searchPlaceholder} className="w-full sm:w-64" />}
          {filters}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {actions}
            {exportName && <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv} disabled={!filtered.length}>Export</Button>}
          </div>
        </div>
      )}
      {selectable && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-forest-50 px-4 py-2 text-sm">
          <span className="font-semibold text-forest-800">{selected.length} selected</span>
          <button className="text-xs font-medium text-forest-700 hover:underline" onClick={clear}>Clear</button>
          <div className="ml-auto flex flex-wrap gap-2">{bulkActions?.(selected, clear)}</div>
        </div>
      )}
      <div className="scroll-shadow-x relative overflow-x-auto">
        <table className="w-full border-collapse">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-surface-2">
            <tr className="border-b border-line">
              {selectable && (
                <th className="w-10 px-4">
                  <Checkbox ariaLabel="Select all on this page" checked={allOnPage} indeterminate={!allOnPage && someOnPage}
                    onChange={() => setSel((s) => { const n = new Set(s); visible.forEach((r) => (allOnPage ? n.delete(rowKey(r)) : n.add(rowKey(r)))); return n })} />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th key={c.key} style={{ width: c.width }} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={clsx('th', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.hideOnMobile && 'max-md:hidden')}>
                    {c.sort ? (
                      <button type="button" onClick={() => toggleSort(c)} className={clsx('inline-flex items-center gap-1 uppercase hover:text-ink', active && 'text-ink')}>
                        {c.header}{active ? (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="opacity-40" />}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const k = rowKey(r), on = sel.has(k)
              return (
                <tr key={k} onClick={onRowClick ? () => onRowClick(r) : undefined} tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(r) } } : undefined}
                  className={clsx('border-b border-line last:border-0 transition-colors', on ? 'bg-forest-50/70' : 'hover:bg-surface-2', onRowClick && 'cursor-pointer', rowClassName?.(r))}>
                  {selectable && <td className={clsx('w-10 px-4', pad)} onClick={(e) => e.stopPropagation()}><Checkbox ariaLabel="Select row" checked={on} onChange={() => setSel((s) => { const n = new Set(s); on ? n.delete(k) : n.add(k); return n })} /></td>}
                  {columns.map((c) => (
                    <td key={c.key} className={clsx('px-4 align-middle text-sm text-ink', pad, c.align === 'right' && 'text-right tabular', c.align === 'center' && 'text-center', c.hideOnMobile && 'max-md:hidden', c.className)}>{c.cell(r)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {!visible.length && (q
          ? <EmptyState compact title="No matches" description={`Nothing matches “${q}”.`} action={<Button size="sm" variant="secondary" onClick={() => setQ('')}>Clear search</Button>} />
          : empty ?? <EmptyState compact title="Nothing here yet" />)}
      </div>
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
          <span className="tabular">{page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <button className="rounded-md p-1.5 hover:bg-ink/5 disabled:opacity-30" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            <span className="px-1 tabular">Page {page + 1} of {pages}</span>
            <button className="rounded-md p-1.5 hover:bg-ink/5 disabled:opacity-30" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </>
  )
  return bare ? <div>{body}</div> : <div className="card overflow-hidden">{body}</div>
}
