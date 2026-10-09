// CSV export helper for DataGridToolbar's download action. Kept in its own
// module (not data-grid.tsx) so the component file only exports components —
// see the react-refresh/only-export-components rule.

/**
 * Build + trigger a CSV download of the FULL dataset — pass every column's
 * header + every row's cells, including columns currently hidden in the UI.
 */
function downloadDataGridCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export { downloadDataGridCsv }
