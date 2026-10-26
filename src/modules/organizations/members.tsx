import { useId, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAccess } from '@/app/providers/access'
import { useSession } from '@/modules/auth/session'
import { command } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { DataTable, StatusBadge } from '@/components/data-display/components'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { directory, type DirectoryMember } from './service'
import { InvitationManager } from './invitations'
import { GroupAccessManager } from './scopes'
export function OrganizationMembers({ target }: { target: string }) {
  const roleTitleId = useId()
  const access = useAccess()
  const { session } = useSession()
  const cache = useQueryClient()
  const [editing, setEditing] = useState<DirectoryMember | null>(null)
  const [role, setRole] = useState('member')
  const [action, setAction] = useState<{
    member: DirectoryMember
    kind: 'transfer' | 'remove'
  } | null>(null)
  const query = useQuery({
    queryKey: ['directory', target],
    queryFn: () => directory(target),
    enabled: Boolean(session),
  })
  const allowed = access.can('organization.staff.manage')
  const mutation = useMutation({
    mutationFn: (args: { name: string; values: Record<string, unknown> }) =>
      command(args.name, { target, ...args.values }),
    onSuccess: async () => {
      setEditing(null)
      setAction(null)
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['directory', target] }),
        cache.invalidateQueries({ queryKey: ['group-assignments', target] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      toast.success('Membership updated.')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <>
      <section className="panel component-spacing">
        <div className="section-heading">
          <h2>Organization members</h2>
          <StatusBadge>{allowed ? 'Owner controls' : 'Directory'}</StatusBadge>
        </div>
        {query.isPending ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            caption="Authorized organization directory"
            rows={query.data}
            rowKey={(row) => row.user_id}
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (row) => row.full_name || 'Name not set',
                sortValue: (row) => row.full_name,
              },
              { key: 'email', header: 'Email', render: (row) => row.email ?? 'Private' },
              {
                key: 'role',
                header: 'Role',
                render: (row) => <StatusBadge>{row.role}</StatusBadge>,
              },
              ...(allowed
                ? [
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (row: DirectoryMember) =>
                        row.role === 'owner' || row.user_id === session?.user.id ? (
                          <span className="small muted">Owner / your account</span>
                        ) : (
                          <div className="actions">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditing(row)
                                setRole(row.role)
                              }}
                            >
                              Change role
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!row.mfa_enrolled}
                              onClick={() => setAction({ member: row, kind: 'transfer' })}
                            >
                              Transfer ownership
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setAction({ member: row, kind: 'remove' })}
                            >
                              Remove
                            </Button>
                          </div>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </section>
      {allowed && (
        <>
          <InvitationManager target={target} />
          <GroupAccessManager target={target} members={query.data ?? []} />
        </>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)} busy={mutation.isPending} labelledBy={roleTitleId}>
          <h2 id={roleTitleId}>Change staff role</h2>
          <p>
            {editing.full_name || editing.email}. Privileged staff must enroll MFA before promotion.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate({
                name: 'set_organization_member_role',
                values: { member_user: editing.user_id, new_role: role },
              })
            }}
          >
            <label htmlFor={`${roleTitleId}-select`}>Role</label>
            <select
              id={`${roleTitleId}-select`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="member">Member</option>
              <option value="treasurer" disabled={!editing.mfa_enrolled}>
                Treasurer
              </option>
              <option value="organizer" disabled={!editing.mfa_enrolled}>
                Organizer
              </option>
            </select>
            <div className="actions">
              <Button
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                Save role
              </Button>
            </div>
          </form>
        </Modal>
      )}
      <ConfirmDialog
        open={Boolean(action)}
        title={
          action?.kind === 'transfer' ? 'Transfer organization ownership?' : 'Remove this member?'
        }
        description={
          action?.kind === 'transfer'
            ? 'This member becomes the owner and you become an organizer. You will lose owner-only staff controls.'
            : 'This removes organization access and group assignments. Unresolved obligations may block removal.'
        }
        busy={mutation.isPending}
        onCancel={() => setAction(null)}
        onConfirm={() =>
          action &&
          mutation.mutate({
            name:
              action.kind === 'transfer'
                ? 'transfer_organization_ownership'
                : 'remove_organization_member',
            values:
              action.kind === 'transfer'
                ? { new_owner: action.member.user_id }
                : { member_user: action.member.user_id },
          })
        }
      />
    </>
  )
}
