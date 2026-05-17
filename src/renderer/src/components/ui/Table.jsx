export function Table({ columns, rows, getRowKey }) {
  return (
    <div className="overflow-hidden rounded-ui border border-ui-border bg-ui-surface">
      <table className="w-full border-collapse text-left text-sm">
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
          {rows.map((row, index) => (
            <tr key={getRowKey ? getRowKey(row) : index} className="border-b border-ui-border last:border-b-0">
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
