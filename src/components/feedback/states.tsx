import { CircleAlert, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../ui/button'
export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
}: {
  title?: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <Inbox size={30} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <section className="error-state" role="alert">
      <CircleAlert aria-hidden="true" />
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </section>
  )
}
export function LoadingSkeleton({
  label = 'Loading page…',
  rows = 3,
}: {
  label?: string
  rows?: number
}) {
  return (
    <div role="status" aria-label={label} className="skeleton-stack">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="loading-skeleton" key={i} />
      ))}
    </div>
  )
}
