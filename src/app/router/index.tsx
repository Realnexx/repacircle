import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Navigate, useRoutes, type RouteObject } from 'react-router-dom'
import { workspaces, publicPages, authPages } from './definitions'
import { LoadingSkeleton } from '@/components/feedback/states'
import { ErrorBoundary } from '@/components/feedback/error-boundary'
import { PageHeader } from '@/components/layout/page'
const PublicLayout = lazy(() =>
  import('../layouts/public-layout').then((m) => ({ default: m.PublicLayout })),
)
const AuthLayout = lazy(() =>
  import('../layouts/auth-layout').then((m) => ({ default: m.AuthLayout })),
)
const layouts = {
  'platform-admin': lazy(() =>
    import('../layouts/workspace-layout').then((m) => ({ default: m.PlatformAdminLayout })),
  ),
  organizer: lazy(() =>
    import('../layouts/workspace-layout').then((m) => ({ default: m.OrganizerLayout })),
  ),
  treasurer: lazy(() =>
    import('../layouts/workspace-layout').then((m) => ({ default: m.TreasurerLayout })),
  ),
  member: lazy(() =>
    import('../layouts/workspace-layout').then((m) => ({ default: m.MemberLayout })),
  ),
}
const pages = {
  'platform-admin': lazy(() => import('@/modules/platform-admin/pages')),
  organizer: lazy(() => import('@/modules/organizer/pages')),
  treasurer: lazy(() => import('@/modules/treasurer/pages')),
  member: lazy(() => import('@/modules/member/pages')),
}
const Landing = lazy(() => import('@/modules/public/landing'))
const Legal = lazy(() => import('@/modules/public/legal'))
const Setup = lazy(() => import('@/components/layout/setup'))
const Auth = lazy(() => import('@/modules/auth/page'))
const DesignSystem = lazy(() => import('@/modules/public/design-system'))
const Organizations = lazy(() => import('@/modules/organizations/page'))
const OrganizerLayout = layouts.organizer
const publicElements: Record<string, ReactNode> = {
  '/': <Landing />,
  '/privacy': <Legal />,
  '/terms': <Legal />,
  '/help': (
    <>
      <PageHeader title="Help & setup" description="Connect your community workspace." />
      <Setup />
    </>
  ),
  '/design-system': <DesignSystem />,
}
const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      ...publicPages.map((page) => ({ path: page.path, element: publicElements[page.path] })),
      {
        path: '*',
        element: (
          <section className="panel">
            <h1>Page not found</h1>
            <p>This page does not exist.</p>
            <Link className="button" to="/">
              Return home
            </Link>
          </section>
        ),
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: authPages.map(({ path }) => ({
      path,
      element: <Auth key={path} />,
    })),
  },
  ...workspaces.map((workspace) => {
    const Layout = layouts[workspace.role]
    const Page = pages[workspace.role]
    return {
      path: `/${workspace.role}`,
      element: <Layout />,
      children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        ...workspace.pages.map((page) => ({
          path: page.slug,
          element: <Page role={workspace.role} {...page} />,
        })),
      ],
    }
  }),
  {
    element: <OrganizerLayout />,
    children: [
      {
        path: '/organizations',
        element: (
          <>
            <h1>Organizations</h1>
            <Organizations />
          </>
        ),
      },
    ],
  },
  { path: '/roadmap', element: <Navigate to="/help" replace /> },
]
export function AppRouter() {
  const element = useRoutes(routes)
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSkeleton label="Loading page…" />}>{element}</Suspense>
    </ErrorBoundary>
  )
}
