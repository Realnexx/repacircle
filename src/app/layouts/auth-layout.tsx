import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, ShieldCheck, Users, Wallet } from 'lucide-react'
import { Brand, BrandEmblem } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/menus'
import { usePageTitle } from '@/hooks/use-page-title'
import { authPages } from '../router/definitions'
export function AuthLayout() {
  const location = useLocation()
  const setup = location.pathname === '/profile/setup'
  const showTabs = ['/login', '/register'].includes(location.pathname)
  usePageTitle(authPages.find((p) => p.path === location.pathname)?.title ?? 'Account')
  return (
    <div className={`app auth-shell${setup ? ' auth-shell--setup' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header>
        <Brand />
        <div className="auth-header-actions">
          <Link to="/help">Need a hand?</Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <aside className="auth-story" aria-label="About RepaCircle">
          <span className="eyebrow">
            <span className="green-dot" /> MADE FOR YOUR COMMUNITY
          </span>
          <h2>
            A little from each.
            <br />
            <span>More for everyone.</span>
          </h2>
          <p>Bring your people, your plans, and your savings journey into one connected circle.</p>
          <div className="auth-community-art" aria-hidden="true">
            <span className="community-ring community-ring--outer" />
            <span className="community-ring community-ring--inner" />
            <BrandEmblem className="auth-emblem" />
            <span className="community-art-label community-art-label--top">
              <Users size={17} /> A shared purpose
            </span>
            <span className="community-art-label community-art-label--bottom">
              <Wallet size={17} /> A brighter tomorrow <ArrowUpRight size={14} />
            </span>
            <span className="community-orbit-dot" />
          </div>
          <div className="auth-story-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Your circle. Your peace of mind.</strong>
              <small>A dedicated space to connect and organize.</small>
            </div>
          </div>
        </aside>
        <div className="auth-form-column">
          <div className="auth-card">
            {showTabs && (
              <nav className="auth-tabs" aria-label="Account access">
                <NavLink to="/login">Sign in</NavLink>
                <NavLink to="/register">Create account</NavLink>
              </nav>
            )}
            <Outlet />
          </div>
          <Link className="back-link" to="/">
            ← Back to RepaCircle
          </Link>
        </div>
      </main>
    </div>
  )
}
