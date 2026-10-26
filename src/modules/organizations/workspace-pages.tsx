import { useQuery } from '@tanstack/react-query'
import { useAccess } from '@/app/providers/access'
import { PageHeader } from '@/components/layout/page'
import { EmptyState, LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { DataTable } from '@/components/data-display/components'
import { OrganizationMembers } from './members'
import { OrganizationSettings } from './page'
import { listOrganizations, listGroupScopes } from './service'
export function OrganizationMembersPage() {
  const access = useAccess()
  return (
    <>
      <PageHeader
        title="Members"
        description="Authorized organization members and staff permissions."
      />
      {access.organizationId ? (
        <OrganizationMembers target={access.organizationId} />
      ) : (
        <EmptyState description="Choose an organization to view its directory." />
      )}
    </>
  )
}
export function OrganizationSettingsPage() {
  const access = useAccess()
  const query = useQuery({ queryKey: ['organizations'], queryFn: listOrganizations })
  const org = query.data?.find((o) => o.id === access.organizationId)
  return (
    <>
      <PageHeader title="Settings" description="Manage your organization details." />
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : org ? (
        <OrganizationSettings key={org.id} organization={org} />
      ) : (
        <EmptyState description="Choose an organization to manage." />
      )}
    </>
  )
}
export function OrganizationScopesPage() {
  const access = useAccess()
  const query = useQuery({
    queryKey: ['group-scopes', access.organizationId],
    enabled: Boolean(access.organizationId),
    queryFn: () => listGroupScopes(access.organizationId!),
  })
  return (
    <>
      <PageHeader
        title="Groups"
        description="Authorization scopes for your organization. Active REPA groups will be configured in a later phase."
      />
      <section className="panel">
        {query.isLoading ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} />
        ) : (
          <DataTable
            caption="Group authorization scopes"
            rows={query.data ?? []}
            rowKey={(row) => row.id}
            columns={[{ key: 'name', header: 'Scope name', render: (row) => row.name }]}
          />
        )}
      </section>
    </>
  )
}
export function AssignedScopesPage({ treasurer }: { treasurer: boolean }) {
  const access = useAccess()
  return (
    <>
      <PageHeader
        title={treasurer ? 'Assigned Groups' : 'My Groups'}
        description="Only groups assigned to your current organization membership are shown."
      />
      <section className="panel">
        <DataTable
          caption="Your authorized group scopes"
          rows={
            access.organization?.groups.filter((g) =>
              g.permissions.includes(treasurer ? 'groups.assigned.read' : 'groups.joined.read'),
            ) ?? []
          }
          rowKey={(row) => row.id}
          columns={[
            { key: 'name', header: 'Group scope', render: (row) => row.name },
            { key: 'role', header: 'Role', render: (row) => row.role },
          ]}
        />
      </section>
    </>
  )
}
