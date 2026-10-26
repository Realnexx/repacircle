import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppHeader, AppSidebar, MobileNavigation } from '@/components/layout/navigation'
import { PageContainer } from '@/components/layout/page'
import { PermissionGuard } from '@/components/layout/permission-guard'
import { StatusBadge } from '@/components/data-display/components'
import { environment } from '@/lib/validation/env'
import { usePageTitle } from '@/hooks/use-page-title'
import type { WorkspaceRole } from '@/types/access'
import { workspaces } from '../router/definitions'
export function WorkspaceLayout({ role }: { role: WorkspaceRole }) {
  const [mobile, setMobile] = useState(false)
  const location = useLocation()
  const title =
    location.pathname === '/organizations'
      ? 'Organizations'
      : (workspaces
          .find((w) => w.role === role)
          ?.pages.find((p) => location.pathname.endsWith(`/${p.slug}`))?.title ?? 'Workspace')
  usePageTitle(title)
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppSidebar role={role} />
      <MobileNavigation role={role} open={mobile} onClose={() => setMobile(false)} />
      <div className="main-area">
        <AppHeader role={role} title={title} onOpenNavigation={() => setMobile(true)} />
        <main id="main-content" tabIndex={-1}>
          <PageContainer>
            {environment.mode === 'setup' && (
              <div className="preview-banner">
                <StatusBadge status="warning">Layout preview</StatusBadge>
                <span>
                  No live account or financial data. Connect Supabase to enable authenticated
                  access.
                </span>
              </div>
            )}
            <PermissionGuard role={location.pathname === '/organizations' ? undefined : role}>
              <Outlet />
            </PermissionGuard>
            <footer>
              <span>© {new Date().getFullYear()} RepaCircle</span>
              <span>Built for community. Designed for trust.</span>
            </footer>
          </PageContainer>
        </main>
      </div>
    </div>
  )
}
export function PlatformAdminLayout() {
  return <WorkspaceLayout role="platform-admin" />
}
export function OrganizerLayout() {
  return <WorkspaceLayout role="organizer" />
}
export function TreasurerLayout() {
  return <WorkspaceLayout role="treasurer" />
}
export function MemberLayout() {
  return <WorkspaceLayout role="member" />
}
