import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { command } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-display/components'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { useSession } from '@/modules/auth/session'
import { listGroupScopes, listGroupAssignments, type DirectoryMember } from './service'
export function GroupAccessManager({
  target,
  members,
}: {
  target: string
  members: DirectoryMember[]
}) {
  const cache = useQueryClient()
  const { session } = useSession()
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [user, setUser] = useState('')
  const [role, setRole] = useState('member')
  const scopes = useQuery({
    queryKey: ['group-scopes', target],
    queryFn: () => listGroupScopes(target),
  })
  const assignments = useQuery({
    queryKey: ['group-assignments', target],
    queryFn: () => listGroupAssignments(target),
  })
  const mutation = useMutation({
    mutationFn: (action: { name: string; args: Record<string, unknown> }) =>
      command(action.name, { target, ...action.args }),
    onSuccess: async () => {
      setName('')
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['group-scopes', target] }),
        cache.invalidateQueries({ queryKey: ['group-assignments', target] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      toast.success('Group access updated.')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <section className="panel component-spacing">
      <h2>Group-scoped access</h2>
      <p>
        These are authorization scopes, not active REPA groups. Group configuration comes later.
        Treasurer access is granted only to explicitly assigned scopes.
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate({ name: 'create_group_scope', args: { scope_name: name } })
        }}
      >
        <label>
          New scope name
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={mutation.isPending}>
          Create access scope
        </Button>
      </form>
      {scopes.isPending || assignments.isPending ? (
        <LoadingSkeleton />
      ) : scopes.isError || assignments.isError ? (
        <ErrorState message={scopes.error?.message ?? assignments.error!.message} />
      ) : (
        <>
          <form
            className="inline-form component-spacing"
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate({
                name: 'assign_group_role',
                args: { scope_id: scope, member_user: user, assigned_role: role },
              })
            }}
          >
            <label>
              Group scope
              <select
                aria-label="Group scope"
                required
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="">Choose a scope</option>
                {scopes.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select
                aria-label="Role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value)
                  setUser('')
                }}
              >
                <option value="member">Member</option>
                <option value="treasurer">Treasurer</option>
              </select>
            </label>
            <label>
              Member
              <select
                aria-label="Member"
                required
                value={user}
                onChange={(e) => setUser(e.target.value)}
              >
                <option value="">Choose a member</option>
                {members
                  .filter(
                    (m) =>
                      m.user_id !== session?.user.id &&
                      (role !== 'treasurer' || m.role === 'treasurer'),
                  )
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email || m.user_id}
                    </option>
                  ))}
              </select>
            </label>
            <Button type="submit" disabled={mutation.isPending}>
              Assign group role
            </Button>
          </form>
          <div className="component-spacing">
            <DataTable
              caption="Group-specific permissions"
              rows={assignments.data}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: 'scope',
                  header: 'Scope',
                  render: (row) =>
                    scopes.data.find((s) => s.id === row.group_id)?.name ?? row.group_id,
                },
                {
                  key: 'member',
                  header: 'Member',
                  render: (row) =>
                    members.find((m) => m.user_id === row.user_id)?.full_name || row.user_id,
                },
                { key: 'role', header: 'Role', render: (row) => row.role },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (row) => (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          name: 'remove_group_role',
                          args: { scope_id: row.group_id, member_user: row.user_id },
                        })
                      }
                    >
                      Remove assignment
                    </Button>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}
    </section>
  )
}
