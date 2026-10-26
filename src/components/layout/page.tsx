import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="page-container">{children}</div>
}
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </div>
  )
}
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
            {item.href ? (
              <Link to={item.href}>{item.label}</Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
