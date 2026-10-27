import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '@/modules/auth/session'
import { PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { getRepaGroup } from '@/modules/repa/service'
import { getGroupJoinIntent, clearGroupJoinIntent } from './intent'
import { inspectInvitation, redeemInvitation, requestMembership } from './service'
import './styles.css'
export default function JoinGroup() {
  const { session } = useSession()
  const [intent] = useState(getGroupJoinIntent)
  const [params] = useSearchParams()
  const groupId = params.get('group')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()
  const cache = useQueryClient()
  const query = useQuery({
    queryKey: ['membership-join', intent?.id, groupId, session?.user.id],
    enabled: Boolean(session?.user.email_confirmed_at && (intent || groupId)),
    retry: false,
    queryFn: async () =>
      intent
        ? inspectInvitation(intent.id, intent.token)
        : getRepaGroup(groupId!).then((b) => ({
            group_id: b.group.id,
            group_name: b.group.name,
            organization_name: 'your organization',
            expires_at: null,
            allows_organization_join: false,
            already_requested: false,
          })),
  })
  const join = useMutation({
    mutationFn: async () => {
      if (intent) return redeemInvitation(intent.id, intent.token, message)
      await requestMembership(groupId!, message)
      return groupId!
    },
    onSuccess: async (id) => {
      clearGroupJoinIntent()
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['access'] }),
        cache.invalidateQueries({ queryKey: ['memberships'] }),
        cache.invalidateQueries({ queryKey: ['repa'] }),
      ])
      toast.success('Membership request recorded. Review the agreement once a slot is approved.')
      navigate(`/member/repa/${id}#members`, { replace: true })
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <>
      <PageHeader
        title="Join a REPA group"
        description="Secure enrollment with organizer approval and exact-version agreements."
      />
      {!session ? (
        <section className="panel">
          <p>Sign in with the invited email address to review your invitation.</p>
          <div className="actions">
            <Link
              className="button"
              to="/login"
              state={{ from: location.pathname + location.search }}
            >
              Sign in
            </Link>
            <Link className="button button-secondary" to="/register">
              Create account
            </Link>
          </div>
        </section>
      ) : !session.user.email_confirmed_at ? (
        <Link to="/verify-email">Verify your email before joining</Link>
      ) : !intent && !groupId ? (
        <ErrorState message="Open a valid invitation link or use Request membership from a group page." />
      ) : query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <>
          <ErrorState title="Invitation or group unavailable" message={query.error.message} />
          <Button
            variant="secondary"
            onClick={() => {
              clearGroupJoinIntent()
              navigate('/organizations', { replace: true })
            }}
          >
            Dismiss invitation
          </Button>
        </>
      ) : (
        query.data && (
          <section className="panel">
            <h2>{query.data.group_name}</h2>
            <p>{query.data.organization_name}</p>
            {query.data.expires_at && (
              <p>Invitation expires {new Date(query.data.expires_at).toLocaleString()}.</p>
            )}
            {query.data.allows_organization_join && (
              <p>
                Accepting this owner invitation also creates basic organization membership if
                needed. It does not grant staff permissions.
              </p>
            )}
            <p>
              A request does not guarantee a seat. Active groups admit replacements only through a
              controlled review. You must accept the full group agreement before contribution or
              reward access is enabled.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                join.mutate()
              }}
            >
              <label>
                Message to the organizer
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={join.isPending}>
                {join.isPending
                  ? 'Submitting…'
                  : query.data.already_requested
                    ? 'Open your membership'
                    : 'Request to join group'}
              </Button>
            </form>
          </section>
        )
      )}
    </>
  )
}
