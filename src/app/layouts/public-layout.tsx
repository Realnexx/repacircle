import { Outlet, Link, useLocation } from 'react-router-dom'
import { Brand } from '@/components/layout/navigation'
import { ThemeToggle } from '@/components/layout/menus'
import { PageContainer } from '@/components/layout/page'
import { usePageTitle } from '@/hooks/use-page-title'
import { publicPages } from '../router/definitions'
import { ChevronDown } from 'lucide-react'
import { PublicMobileMenu } from '@/components/layout/public-mobile-menu'
const sections = [
  ['#how-it-works', 'How it works'],
  ['#for-your-community', 'Your community'],
  ['#whats-included', 'What’s included'],
  ['#questions', 'FAQs'],
] as const
export function PublicLayout() {
  const location = useLocation()
  const landing = location.pathname === '/'
  usePageTitle(publicPages.find((p) => p.path === location.pathname)?.title ?? 'RepaCircle')
  return (
    <div className={`app public-app${landing ? ' public-app--landing' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="public-header">
        <Brand />
        {landing && (
          <nav className="landing-section-nav" aria-label="Page sections">
            {sections.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
        )}
        <nav aria-label="Public navigation">
          {landing && (
            <details
              className="landing-explore"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.currentTarget.open = false
                  event.currentTarget.querySelector('summary')?.focus()
                }
              }}
            >
              <summary>
                Explore <ChevronDown size={14} />
              </summary>
              <div>
                {sections.map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    onClick={(event) => {
                      const details = event.currentTarget.closest('details')
                      if (details) details.open = false
                    }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </details>
          )}
          <Link className="public-help-link" to="/help">
            Help
          </Link>
          <ThemeToggle />
          <Link to="/login">Sign in</Link>
          <Link to="/register" className="button">
            Get started
          </Link>
        </nav>
        <PublicMobileMenu sections={landing ? sections : []} />
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
