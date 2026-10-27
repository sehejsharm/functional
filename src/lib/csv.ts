export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  // Cells that start with a formula character are prefixed so spreadsheets show them as text, not run them.
  const esc = (v: unknown) => { let s = v == null ? '' : String(v); if (typeof v !== 'number' && !/^-?\d+(\.\d+)?$/.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
