import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/modules/auth/session'
import { environment } from '@/lib/validation/env'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { getMyProfile, isProfileComplete } from './service'

export function ProfileCompletionGuard({ children }: { children: ReactNode }) {
  const { session, loading, authVersion } = useSession()
  const { pathname } = useLocation()
  const protectedPath =
    /^\/(platform-admin|organizer|treasurer|member)(\/|$)/.test(pathname) ||
    [
      '/organizations',
      '/profile',
      '/invite',
      '/register',
      '/login',
      '/verify-email',
      '/profile/setup',
    ].includes(pathname)
  const check =
    environment.mode !== 'setup' && protectedPath && Boolean(session?.user.email_confirmed_at)
  const query = useQuery({
    queryKey: ['profile', session?.user.id, authVersion],
    enabled: check,
    queryFn: () => getMyProfile(session!.user.id),
  })
  if (protectedPath && loading) return <LoadingSkeleton label="Checking your account…" />
  if (pathname === '/profile/setup' && !session) return <Navigate to="/login" replace />
  if (pathname === '/profile/setup' && !session?.user.email_confirmed_at)
    return <Navigate to="/verify-email" replace />
  if (check) {
    if (query.isPending) return <LoadingSkeleton label="Checking your personal information…" />
    if (query.isError)
      return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
    if (query.data.account_status !== 'active')
      return <ErrorState message="This account is suspended. Contact the platform operator." />
    if (!isProfileComplete(query.data) && pathname !== '/profile/setup')
      return <Navigate to="/profile/setup" replace />
  }
  return <>{children}</>
}
