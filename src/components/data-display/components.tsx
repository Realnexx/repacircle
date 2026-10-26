import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '../ui/button'
import { EmptyState } from '../feedback/states'
export type Status = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
export function StatusBadge({
  children,
  status = 'neutral',
}: {
  children: ReactNode
  status?: Status
}) {
  return <span className={`status-badge status-${status}`}>{children}</span>
}
export function StatCard({
  label,
  value,
  description,
  icon,
}: {
  label: string
  value: string
  description?: string
  icon?: ReactNode
}) {
  return (
    <article className="stat-card">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <strong className="stat-value">{value}</strong>
      {description && <p>{description}</p>}
    </article>
  )
}
export type Column<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
}
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyDescription = 'Records will appear here when available.',
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption: string
  emptyDescription?: string
}) {
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null)
  const selected = columns.find((column) => column.key === sort?.key)
  const sorted =
    sort && selected?.sortValue
      ? [...rows].sort((a, b) => {
          const av = selected.sortValue!(a)
          const bv = selected.sortValue!(b)
          return (av < bv ? -1 : av > bv ? 1 : 0) * sort.direction
        })
      : rows
  if (!rows.length) return <EmptyState title="No records yet" description={emptyDescription} />
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                scope="col"
                key={column.key}
                aria-sort={
                  sort?.key === column.key
                    ? sort.direction === 1
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                {column.sortValue ? (
                  <button
                    className="sort-button"
                    onClick={() =>
                      setSort({
                        key: column.key,
                        direction: sort?.key === column.key && sort.direction === 1 ? -1 : 1,
                      })
                    }
                  >
                    {column.header}
                    {sort?.key === column.key &&
                      (sort.direction === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  return (
    <nav className="pagination" aria-label="Pagination">
      <span aria-live="polite">
        Page {page} of {pages} · {total} records
      </span>
      <div className="actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </Button>
      </div>
    </nav>
  )
}
