import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/modules/auth/session'
import { useAccess } from '@/app/providers/access'
import { environment } from '@/lib/validation/env'
import { routePermission, type WorkspaceRole } from '@/types/access'
import Unauthorized from '@/modules/auth/unauthorized'
import { ErrorState, LoadingSkeleton } from '../feedback/states'
export function PermissionGuard({ role, children }: { role?: WorkspaceRole; children: ReactNode }) {
  const { session, loading, error } = useSession()
  const access = useAccess()
  const location = useLocation()
  if (environment.error)
    return <ErrorState title="Configuration required" message={environment.error} />
  if (environment.mode === 'setup') return <>{children}</>
  if (loading || access.loading) return <LoadingSkeleton label="Checking workspace access…" />
  if (error || access.error) return <ErrorState message={error ?? access.error!.message} />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!session.user.email_confirmed_at || !access.verified)
    return <Navigate to="/verify-email" replace />
  if (access.accountStatus !== 'active')
    return <Unauthorized reason="This account is suspended. Contact the platform operator." />
  if (role && access.requiresMfa && access.aal !== 'aal2')
    return <Navigate to="/security" replace state={{ from: location.pathname }} />
  if (role && !access.can(routePermission(role, location.pathname))) return <Unauthorized />
  return <>{children}</>
}
