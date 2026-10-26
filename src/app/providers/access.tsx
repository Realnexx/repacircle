import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/modules/auth/session'
import { supabase } from '@/lib/supabase'
import type { AccessState, WorkspaceRole } from '@/types/access'
const Context = createContext<
  AccessState & {
    loading: boolean
    error: Error | null
    organizations: { id: string; name: string }[]
    selectOrganization: (id: string) => void
  }
>({
  roles: [],
  organizationId: null,
  loading: false,
  error: null,
  organizations: [],
  selectOrganization: () => {},
})
export function AccessProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const [selected, setSelected] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['access', session?.user.id],
    enabled: Boolean(session && supabase),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('organization_members')
        .select('organization_id,role,organizations(id,name)')
        .eq('user_id', session!.user.id)
      if (error) throw error
      return data as unknown as {
        organization_id: string
        role: string
        organizations: { id: string; name: string } | null
      }[]
    },
  })
  const memberships = query.data ?? []
  const organizationId = memberships.some((m) => m.organization_id === selected)
    ? selected
    : (memberships[0]?.organization_id ?? null)
  const current = memberships.find((m) => m.organization_id === organizationId)
  const roles: WorkspaceRole[] = current
    ? [
        'member',
        ...(current.role === 'owner' ? ['organizer' as const] : []),
        ...(current.role === 'treasurer' ? ['treasurer' as const] : []),
      ]
    : []
  // Platform administrator authority will require a server-managed grant in Phase 2.
  return (
    <Context.Provider
      value={{
        roles,
        organizationId,
        loading: query.isFetching,
        error: query.error,
        organizations: memberships.flatMap((m) => (m.organizations ? [m.organizations] : [])),
        selectOrganization: setSelected,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export const useAccess = () => useContext(Context)
