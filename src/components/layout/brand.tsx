import { Link } from 'react-router-dom'

export function BrandEmblem({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-emblem ${className}`} aria-hidden="true">
      <img src="/brand/community-peso-emblem.png" alt="" width={1254} height={1254} />
    </span>
  )
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="RepaCircle home">
      <BrandEmblem />
      <span>
        RepaCircle<span className="brand-dot">.</span>
      </span>
    </Link>
  )
}
