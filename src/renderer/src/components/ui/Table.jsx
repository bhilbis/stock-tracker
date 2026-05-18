export function Table({ columns, rows, getRowKey, loading = false, emptyMessage = 'Belum ada data.' }) {
  return (
    <div className="relative overflow-x-auto rounded-ui border border-ui-border bg-ui-surface">
      {loading ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-ui border border-ui-border bg-ui-surface px-4 py-3 text-sm text-ui-muted shadow-ui">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-primary/25 border-t-brand-primary" />
            Memuat data...
          </div>
        </div>
      ) : null}
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-ui-bg text-ui-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="border-b border-ui-border px-4 py-3 font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-ui-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => (
            <tr key={getRowKey ? getRowKey(row) : index} className="border-b border-ui-border transition-colors last:border-b-0 hover:bg-ui-bg/70">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-ui-text">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
