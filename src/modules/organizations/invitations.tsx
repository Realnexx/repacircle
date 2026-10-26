import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DataTable, StatusBadge } from '@/components/data-display/components'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { command } from '@/lib/api/client'
import { useSession } from '@/modules/auth/session'
import { useAccess } from '@/app/providers/access'
import {
  getInvitationIntent,
  clearInvitationIntent,
  invitationLink,
} from '@/modules/auth/invitation-intent'
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  invitationStatus,
  sendInvitationEmail,
  type CreatedInvitation,
} from './service'
export function InvitationManager({ target }: { target: string }) {
  const cache = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [created, setCreated] = useState<CreatedInvitation | null>(null)
  const [sending, setSending] = useState(false)
  const query = useQuery({
    queryKey: ['invitations', target],
    queryFn: () => listInvitations(target),
  })
  const mutation = useMutation({
    mutationFn: () => createInvitation(target, email, role),
    onSuccess: async (invite) => {
      setCreated(invite)
      setEmail('')
      await cache.invalidateQueries({ queryKey: ['invitations', target] })
      toast.success('Secure invitation created. Send its email or copy the link.')
    },
    onError: (error) => toast.error(error.message),
  })
  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: async () => {
      setCreated(null)
      await cache.invalidateQueries({ queryKey: ['invitations', target] })
      toast.success('Invitation revoked.')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <section className="panel component-spacing">
      <h2>Staff invitations</h2>
      <p>
        Links expire after seven days and can only be accepted by the verified email address shown.
        Organizer and treasurer invitations require MFA on acceptance.
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Email address
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Invitation role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="treasurer">Treasurer</option>
            <option value="organizer">Organizer</option>
          </select>
        </label>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating…' : 'Create invitation'}
        </Button>
      </form>
      {created && (
        <div className="invitation-link component-spacing" role="status">
          <h3>Invitation for {created.email}</h3>
          <p>
            Copy this link now. The token is shown only here and is not stored in plaintext in the
            database.
          </p>
          <label>
            Secure invitation link
            <input readOnly value={invitationLink(created.id, created.token)} />
          </label>
          <div className="actions component-spacing">
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(invitationLink(created.id, created.token))
                  .then(() => toast.success('Invitation link copied.'))
                  .catch(() => toast.error('Select the invitation link and copy it manually.'))
              }
            >
              Copy link
            </Button>
            <Button
              disabled={sending}
              onClick={async () => {
                setSending(true)
                try {
                  await sendInvitationEmail(created)
                  toast.success('Invitation email accepted for delivery.')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Delivery failed.')
                } finally {
                  setSending(false)
                }
              }}
            >
              {sending ? 'Sending…' : 'Send email'}
            </Button>
            <Button variant="ghost" onClick={() => setCreated(null)}>
              Hide link
            </Button>
          </div>
        </div>
      )}
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <div className="component-spacing">
          <DataTable
            caption="Organization invitations"
            rows={query.data}
            rowKey={(row) => row.id}
            columns={[
              { key: 'email', header: 'Email', render: (row) => row.email },
              { key: 'role', header: 'Role', render: (row) => row.role },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge>{invitationStatus(row)}</StatusBadge>,
              },
              {
                key: 'expires',
                header: 'Expires',
                render: (row) => new Date(row.expires_at).toLocaleString(),
              },
              {
                key: 'action',
                header: 'Action',
                render: (row) =>
                  invitationStatus(row) === 'Pending' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(row.id)}
                    >
                      Revoke
                    </Button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}
    </section>
  )
}
type Preview = {
  organization_id: string
  organization_name: string
  role: string
  accepted: boolean
}
export default function AcceptInvitation() {
  const [intent, setIntent] = useState(getInvitationIntent)
  const [intentVersion, setIntentVersion] = useState(0)
  const { session, loading } = useSession()
  const access = useAccess()
  const cache = useQueryClient()
  const [accepted, setAccepted] = useState<string | null>(null)
  useEffect(() => {
    const changed = () => {
      setIntent(getInvitationIntent())
      setAccepted(null)
      setIntentVersion((v) => v + 1)
      cache.removeQueries({ queryKey: ['invitation-preview'] })
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [cache])
  const query = useQuery({
    queryKey: ['invitation-preview', intent?.id, session?.user.id, intentVersion],
    enabled: Boolean(intent && session?.user.email_confirmed_at),
    queryFn: () =>
      command<Preview>('inspect_organization_invitation', {
        invitation_id: intent!.id,
        invitation_token: intent!.token,
      }),
    retry: false,
  })
  const accept = useMutation({
    mutationFn: () =>
      command<string>('accept_organization_invitation', {
        invitation_id: intent!.id,
        invitation_token: intent!.token,
      }),
    onSuccess: async (id) => {
      clearInvitationIntent()
      setAccepted(id)
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['access'] }),
        cache.invalidateQueries({ queryKey: ['organizations'] }),
      ])
      cache.removeQueries({ queryKey: ['invitation-preview'] })
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <section className="panel invitation-page">
      <h1>Organization invitation</h1>
      {!intent ? (
        <p>This link is incomplete. Ask the organization owner for a new invitation.</p>
      ) : loading ? (
        <LoadingSkeleton />
      ) : !session ? (
        <>
          <p>
            Sign in or create an account using the invited email address. Your invitation is kept in
            this tab until accepted.
          </p>
          <div className="actions">
            <Link className="button" to="/login" state={{ from: '/invite' }}>
              Sign in to accept
            </Link>
            <Link className="button button-secondary" to="/register">
              Create an account
            </Link>
          </div>
        </>
      ) : !session.user.email_confirmed_at ? (
        <>
          <p>Verify your email before accepting an invitation.</p>
          <Link className="button" to="/verify-email">
            Verify email
          </Link>
        </>
      ) : accepted ? (
        <>
          <p role="status">Invitation accepted. Your membership is ready.</p>
          <Link
            className="button"
            to="/organizations"
            onClick={() => access.selectOrganization(accepted)}
          >
            Open organization
          </Link>
        </>
      ) : query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState title="Invitation unavailable" message={query.error.message} />
      ) : (
        <>
          <h2>{query.data.organization_name}</h2>
          <p>
            You have been invited as {query.data.role}. Signed in as {session.user.email}.
          </p>
          {query.data.role !== 'member' && access.aal !== 'aal2' ? (
            <Link className="button" to="/security">
              Verify MFA before accepting
            </Link>
          ) : (
            <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
              {accept.isPending
                ? 'Accepting…'
                : query.data.accepted
                  ? 'Open accepted invitation'
                  : 'Accept invitation'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
