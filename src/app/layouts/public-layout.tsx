import { Outlet, Link, useLocation } from 'react-router-dom'
import { Brand } from '@/components/layout/navigation'
import { ThemeToggle } from '@/components/layout/menus'
import { PageContainer } from '@/components/layout/page'
import { usePageTitle } from '@/hooks/use-page-title'
import { publicPages } from '../router/definitions'
export function PublicLayout() {
  const location = useLocation()
  usePageTitle(publicPages.find((p) => p.path === location.pathname)?.title ?? 'RepaCircle')
  return (
    <div className="app public-app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="public-header">
        <Brand />
        <nav aria-label="Public navigation">
          <Link to="/help">Help</Link>
          <ThemeToggle />
          <Link to="/login">Sign in</Link>
          <Link to="/register" className="button">
            Get started
          </Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <PageContainer>
          <Outlet />
          <footer>
            <span>© {new Date().getFullYear()} RepaCircle</span>
            <nav aria-label="Legal navigation">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/design-system">Design system</Link>
            </nav>
          </footer>
        </PageContainer>
      </main>
    </div>
  )
}
