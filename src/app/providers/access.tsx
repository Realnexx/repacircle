import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useSession } from '@/modules/auth/session'
import { command } from '@/lib/api/client'
import { supabase } from '@/lib/supabase'
import type { WorkspaceRole } from '@/types/access'
const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  permissions: z.array(z.string()),
})
const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['owner', 'organizer', 'treasurer', 'member']),
  status: z.enum(['active', 'archived']),
  permissions: z.array(z.string()),
  groups: z.array(groupSchema),
})
export const accessSchema = z.object({
  account_status: z.enum(['active', 'suspended']),
  verified: z.boolean(),
  requires_mfa: z.boolean(),
  aal: z.string(),
  platform_permissions: z.array(z.string()),
  organizations: z.array(organizationSchema),
})
export type AuthorizedOrganization = z.infer<typeof organizationSchema>
type Access = {
  roles: WorkspaceRole[]
  organizationId: string | null
  organization: AuthorizedOrganization | null
  organizations: AuthorizedOrganization[]
  loading: boolean
  error: Error | null
  verified: boolean
  accountStatus: string
  requiresMfa: boolean
  aal: string
  can: (permission: string, groupId?: string) => boolean
  selectOrganization: (id: string) => void
}
const Context = createContext<Access>({
  roles: [],
  organizationId: null,
  organization: null,
  loading: false,
  error: null,
  organizations: [],
  verified: false,
  accountStatus: 'active',
  requiresMfa: false,
  aal: 'aal1',
  can: () => false,
  selectOrganization: () => {},
})
export function AccessProvider({ children }: { children: ReactNode }) {
  const { session, authVersion } = useSession()
  const [selected, setSelected] = useState<{ user: string; id: string } | null>(null)
  const query = useQuery({
    queryKey: ['access', session?.user.id, authVersion],
    enabled: Boolean(session && supabase),
    queryFn: async () => accessSchema.parse(await command<unknown>('get_access_context')),
    retry: 1,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })
  const context = query.data
  const organizations = context?.organizations ?? []
  let saved: string | null = null
  try {
    saved = localStorage.getItem(`repacircle-organization:${session?.user.id}`)
  } catch {
    /* Persistence is optional. */
  }
  const requested = selected?.user === session?.user.id ? selected?.id : saved
  const organization =
    organizations.find((o) => o.id === requested) ??
    organizations.find((o) => o.status === 'active') ??
    organizations[0] ??
    null
  const can = (permission: string, groupId?: string) => {
    if (!context?.verified || context.account_status !== 'active') return false
    if (permission === 'personal.read' || permission === 'profile.self') return true
    if (context.platform_permissions.includes(permission)) return true
    if (!organization || organization.status !== 'active') return false
    return groupId
      ? organization.groups.some((g) => g.id === groupId && g.permissions.includes(permission))
      : organization.permissions.includes(permission) ||
          organization.groups.some((g) => g.permissions.includes(permission))
  }
  const roles: WorkspaceRole[] = []
  if (can('personal.read')) roles.push('member')
  if (can('groups.manage')) roles.push('organizer')
  if (can('treasurer.workspace')) roles.push('treasurer')
  if (can('platform.accounts.manage')) roles.push('platform-admin')
  const selectOrganization = (id: string) => {
    if (!session || !organizations.some((o) => o.id === id)) return
    setSelected({ user: session.user.id, id })
    try {
      localStorage.setItem(`repacircle-organization:${session.user.id}`, id)
    } catch {
      /* Persistence is optional. */
    }
  }
  return (
    <Context.Provider
      value={{
        roles,
        organizationId: organization?.id ?? null,
        organization,
        organizations,
        loading: query.isLoading,
        error: query.error,
        verified: context?.verified ?? false,
        accountStatus: context?.account_status ?? 'active',
        requiresMfa: context?.requires_mfa ?? false,
        aal: context?.aal ?? 'aal1',
        can,
        selectOrganization,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export const useAccess = () => useContext(Context)
