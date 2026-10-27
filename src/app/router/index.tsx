import { ProfileCompletionGuard } from '@/modules/profiles/completion-guard'
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
const Profile = lazy(() => import('@/modules/profiles/page'))
const Security = lazy(() => import('@/modules/auth/security'))
const Verification = lazy(() => import('@/modules/auth/verification'))
const Callback = lazy(() => import('@/modules/auth/callback'))
const Invite = lazy(() => import('@/modules/organizations/invitations'))
const Unauthorized = lazy(() => import('@/modules/auth/unauthorized'))
const RepaEditor = lazy(() =>
  import('@/modules/repa/pages').then((m) => ({ default: m.RepaEditor })),
)
const RepaDetail = lazy(() => import('@/modules/repa/detail'))
const RewardEditor = lazy(() =>
  import('@/modules/rewards/pages').then((m) => ({ default: m.RewardEditor })),
)
const RewardDetail = lazy(() =>
  import('@/modules/rewards/pages').then((m) => ({ default: m.RewardDetail })),
)
const JoinGroup = lazy(() => import('@/modules/membership/join'))
const GroupAgreement = lazy(() => import('@/modules/membership/agreement'))
const MembershipRequests = lazy(() => import('@/modules/membership/management'))
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
      { path: '/invite', element: <Invite /> },
      { path: '/groups/join', element: <JoinGroup /> },
      { path: '/groups/:groupId/agreement', element: <GroupAgreement /> },
      { path: '/unauthorized', element: <Unauthorized /> },
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
    children: [
      { path: '/profile/setup', element: <Profile /> },
      ...authPages.map(({ path }) => ({
        path,
        element:
          path === '/verify-email' ? (
            <Verification />
          ) : path === '/auth/callback' ? (
            <Callback />
          ) : (
            <Auth key={path} />
          ),
      })),
    ],
  },
  ...workspaces.map((workspace) => {
    const Layout = layouts[workspace.role]
    const Page = pages[workspace.role]
    return {
      path: `/${workspace.role}`,
      element: <Layout />,
      children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        ...(workspace.role === 'organizer'
          ? [
              { path: 'groups/new', element: <RepaEditor /> },
              { path: 'rewards/new', element: <RewardEditor /> },
              { path: 'rewards/:rewardId/edit', element: <RewardEditor /> },
              { path: 'rewards/:rewardId', element: <RewardDetail /> },
              { path: 'groups/:groupId/edit', element: <RepaEditor /> },
              { path: 'groups/:groupId', element: <RepaDetail /> },
              { path: 'groups/:groupId/requests', element: <MembershipRequests /> },
            ]
          : workspace.role === 'member' || workspace.role === 'treasurer'
            ? [
                { path: 'repa/:groupId', element: <RepaDetail /> },
                { path: 'repa/:groupId/requests', element: <MembershipRequests /> },
              ]
            : []),
        ...workspace.pages.map((page) => ({
          path: page.slug,
          element:
            workspace.role === 'member' && page.slug === 'profile' ? (
              <Profile />
            ) : (
              <Page role={workspace.role} {...page} />
            ),
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
  {
    element: <OrganizerLayout />,
    children: [
      { path: '/profile', element: <Profile /> },
      { path: '/security', element: <Security /> },
    ],
  },
  { path: '/roadmap', element: <Navigate to="/help" replace /> },
]
export function AppRouter() {
  const element = useRoutes(routes)
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSkeleton label="Loading page…" />}>
        <ProfileCompletionGuard>{element}</ProfileCompletionGuard>
      </Suspense>
    </ErrorBoundary>
  )
}
