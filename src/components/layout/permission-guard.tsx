import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/modules/auth/session'
import { useAccess } from '@/app/providers/access'
import { environment } from '@/lib/validation/env'
import { hasWorkspaceAccess, type WorkspaceRole } from '@/types/access'
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
  if (role && !hasWorkspaceAccess(access.roles, role))
    return (
      <ErrorState
        title="Workspace access required"
        message="Your current organization does not grant this role. Choose an organization you belong to or contact its organizer."
      />
    )
  return <>{children}</>
}
