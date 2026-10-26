import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { command, requireClient } from '@/lib/api/client'
import { PageHeader } from '@/components/layout/page'
import { DataTable, StatCard, StatusBadge } from '@/components/data-display/components'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { SearchInput } from '@/components/forms/controls'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useSession } from '@/modules/auth/session'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Building2, Mail, ShieldCheck, Users } from 'lucide-react'
import { WorkspaceShortcuts } from '@/components/layout/workspace-shortcuts'
type Account = {
  id: string
  email: string
  full_name: string
  account_status: string
  created_at: string
}
export function PlatformAccounts() {
  const { session } = useSession()
  const cache = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Account | null>(null)
  const query = useQuery({
    queryKey: ['platform-accounts'],
    queryFn: () => command<Account[]>('platform_accounts'),
  })
  const mutation = useMutation({
    mutationFn: () =>
      command('set_account_status', {
        account_id: selected!.id,
        new_status: selected!.account_status === 'active' ? 'suspended' : 'active',
      }),
    onSuccess: async () => {
      setSelected(null)
      await cache.invalidateQueries({ queryKey: ['platform-accounts'] })
      toast.success('Account status updated.')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <>
      <PageHeader
        title="Users"
        description="Platform account access. Viewing this directory is audited."
      />
      <section className="panel">
        <SearchInput value={search} onChange={setSearch} label="Search accounts" />
        {query.isPending ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} />
        ) : (
          <DataTable
            caption="Platform accounts (up to 500 recent accounts)"
            rows={query.data.filter((a) =>
              `${a.full_name} ${a.email}`.toLowerCase().includes(search.toLowerCase()),
            )}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Name', render: (row) => row.full_name || 'Name not set' },
              { key: 'email', header: 'Email', render: (row) => row.email },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (
                  <StatusBadge status={row.account_status === 'active' ? 'success' : 'danger'}>
                    {row.account_status}
                  </StatusBadge>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={row.id === session?.user.id}
                    onClick={() => setSelected(row)}
                  >
                    {row.account_status === 'active' ? 'Suspend' : 'Activate'}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </section>
      <ConfirmDialog
        open={Boolean(selected)}
        title="Change account access?"
        description="Suspended accounts cannot access tenant records or perform protected operations. Existing Auth tokens remain subject to these database status checks."
        busy={mutation.isPending}
        onCancel={() => setSelected(null)}
        onConfirm={() => mutation.mutate()}
      />
    </>
  )
}
export function PlatformAnalytics() {
  const query = useQuery({
    queryKey: ['platform-analytics'],
    queryFn: () =>
      command<{ organizations: number; accounts: number; pending_invitations: number }>(
        'platform_analytics',
      ),
  })
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Audited platform analytics. Counts are read from the database."
      />
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : (
        <div className="dashboard-overview">
          <div className="dashboard-overview-main">
            <section className="panel dashboard-welcome">
              <div>
                <StatusBadge>Platform overview</StatusBadge>
                <h2>A clear view of every community.</h2>
                <p>
                  Keep organizations connected and account access in order, from one shared
                  overview.
                </p>
                <Link className="button" to="/platform-admin/organizations">
                  Review organizations <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="dashboard-symbol" aria-hidden="true">
                <ShieldCheck size={44} />
              </div>
            </section>
            <div className="stat-grid">
              <StatCard
                label="Active organizations"
                value={String(query.data.organizations)}
                icon={<Building2 size={18} />}
              />
              <StatCard
                label="Accounts"
                value={String(query.data.accounts)}
                icon={<Users size={18} />}
              />
              <StatCard
                label="Pending invitations"
                value={String(query.data.pending_invitations)}
                icon={<Mail size={18} />}
              />
            </div>
          </div>
          <WorkspaceShortcuts platform />
        </div>
      )}
    </>
  )
}
export function PlatformOrganizations() {
  const query = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: () =>
      command<{ id: string; name: string; status: string; created_at: string }[]>(
        'platform_organizations',
      ),
  })
  return (
    <>
      <PageHeader title="Organizations" description="Audited platform organization directory." />
      <section className="panel">
        {query.isPending ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} />
        ) : (
          <DataTable
            caption="Platform organizations (up to 500 recent organizations)"
            rows={query.data}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Name', render: (row) => row.name },
              { key: 'status', header: 'Status', render: (row) => row.status },
              {
                key: 'created',
                header: 'Created',
                render: (row) => new Date(row.created_at).toLocaleString(),
              },
            ]}
          />
        )}
      </section>
    </>
  )
}
export function PlatformSettings() {
  const cache = useQueryClient()
  const [email, setEmail] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await requireClient()
        .from('platform_settings')
        .select('support_email')
        .single()
      if (error) throw error
      return data as { support_email: string }
    },
  })
  const mutation = useMutation({
    mutationFn: () =>
      command('update_platform_settings', { support_email: email ?? query.data?.support_email }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['platform-settings'] })
      toast.success('Platform settings saved.')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <>
      <PageHeader title="Settings" description="Server-authorized platform preferences." />
      <section className="panel">
        {query.isPending ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
          >
            <label>
              Support email
              <input
                type="email"
                required
                maxLength={254}
                value={email ?? query.data.support_email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <Button type="submit" disabled={mutation.isPending}>
              Save settings
            </Button>
          </form>
        )}
      </section>
    </>
  )
}
