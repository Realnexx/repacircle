import { Link, Outlet, useLocation } from 'react-router-dom'
import { Brand } from '@/components/layout/navigation'
import { ThemeToggle } from '@/components/layout/menus'
import { usePageTitle } from '@/hooks/use-page-title'
import { authPages } from '../router/definitions'
export function AuthLayout() {
  const location = useLocation()
  usePageTitle(authPages.find((p) => p.path === location.pathname)?.title ?? 'Account')
  return (
    <div className="app auth-shell">
      <header>
        <Brand />
        <ThemeToggle />
      </header>
      <main id="main-content">
        <div className="auth-card">
          <Outlet />
        </div>
        <Link className="back-link" to="/">
          ← Back to RepaCircle
        </Link>
      </main>
    </div>
  )
}
