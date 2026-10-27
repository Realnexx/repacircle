import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useSession } from '@/modules/auth/session'
import { directory } from '@/modules/organizations/service'
import { command } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { DataTable, StatusBadge } from '@/components/data-display/components'
import { LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import type { RepaBundle } from '@/modules/repa/service'
import { moneyText } from '@/modules/repa/service'
import { getWorkspace, memberStatuses, type Member, type Workspace } from './service'
import { GroupInvitations } from './invitations'
import { AgreementReview } from './agreement'
import { AgreementPolicyEditor, RequestsQueue, GroupStaff, Replacements } from './management'
import { MemberProfileDrawer, MemberStatusDialog, ActivityHistory } from './member-profile'
import './styles.css'
export default function MembershipPanel({ bundle }: { bundle: RepaBundle }) {
  const query = useQuery({
    queryKey: ['memberships', bundle.group.id],
    queryFn: () => getWorkspace(bundle.group.id),
  })
  if (query.isPending) return <LoadingSkeleton />
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
  return <MembershipContent bundle={bundle} workspace={query.data} />
}
function MembershipContent({
  bundle: b,
  workspace: w,
}: {
  bundle: RepaBundle
  workspace: Workspace
}) {
  const { session } = useSession()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [profile, setProfile] = useState('')
  const [change, setChange] = useState<Member | null>(null)
  const g = b.group
  const me = w.members.find((m) => m.user_id === session?.user.id)
  const cap = (s: string) => w.capabilities.includes(s)
  const rows = w.members.filter(
    (m) =>
      (status === 'all' || m.status === status) &&
      m.name.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <h2>Group members</h2>
          <StatusBadge status="info">
            {w.reserved_members} / {w.member_limit} reserved slots
          </StatusBadge>
        </div>
        <p>
          {w.reserved_members} of {w.member_limit} configured members. Approved, active and
          suspended memberships reserve a slot. Other members see their own private membership and
          financial information.
        </p>
        <div className="membership-filter">
          <label>
            Search group members
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            Membership status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {memberStatuses.map((s) => (
                <option value={s} key={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DataTable
          caption="REPA group members"
          rows={rows}
          rowKey={(m) => m.id}
          columns={[
            { key: 'name', header: 'Member', render: (m) => m.name },
            {
              key: 'status',
              header: 'Status',
              render: (m) => (
                <StatusBadge
                  status={
                    m.status === 'active'
                      ? 'success'
                      : m.status === 'suspended'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {m.status}
                </StatusBadge>
              ),
            },
            { key: 'slot', header: 'Slot', render: (m) => m.slot ?? 'Not reserved' },
            {
              key: 'agreement',
              header: 'Agreement',
              render: (m) =>
                m.agreement_complete === false ? (
                  'Full agreement required'
                ) : m.accepted_at ? (
                  <>
                    {new Date(m.accepted_at).toLocaleDateString()}
                    <br />
                    {m.accepted_rules_version === g.accepted_version_id
                      ? 'Accepted rules'
                      : m.accepted_rules_version === g.latest_version_id
                        ? 'Current candidate'
                        : 'Earlier version'}
                  </>
                ) : (
                  'Awaiting acceptance'
                ),
            },
            {
              key: 'eligibility',
              header: 'Payout eligibility',
              render: (m) =>
                m.financial
                  ? m.financial.eligible
                    ? 'Checks met'
                    : (m.financial.reasons[0] ?? 'Not eligible')
                  : 'Restricted',
            },
            {
              key: 'received',
              header: 'Cycle reward',
              render: (m) => (m.reward_received ? 'Received' : 'No reward recorded'),
            },
            {
              key: 'outstanding',
              header: 'Outstanding',
              render: (m) =>
                m.financial ? moneyText(m.financial.outstanding_minor, g.currency) : 'Restricted',
            },
            {
              key: 'actions',
              header: 'Actions',
              render: (m) => (
                <div className="membership-actions">
                  <Button variant="secondary" onClick={() => setProfile(m.id)}>
                    View member profile
                  </Button>
                  {(cap('members.review') || cap('members.suspend')) &&
                    !['removed', 'withdrawn'].includes(m.status) && (
                      <Button variant="ghost" onClick={() => setChange(m)}>
                        Change membership status
                      </Button>
                    )}
                </div>
              ),
            },
          ]}
        />
        {!me &&
          b.configuration.membership.invitation_rule === 'members_can_request' &&
          g.visibility === 'organization' &&
          ['enrollment_open', 'active'].includes(g.status) && (
            <Link className="button component-spacing" to={`/groups/join?group=${g.id}`}>
              Request membership
            </Link>
          )}
        {cap('members.review') && !g.accepted_version_id && (
          <DirectEnrollment groupId={g.id} organizationId={g.organization_id} workspace={w} />
        )}
        {cap('members.review') && (
          <Link
            className="landing-text-link component-spacing"
            to={`${w.can_manage ? '/organizer/groups' : '/treasurer/repa'}/${g.id}/requests`}
          >
            Open pending requests page →
          </Link>
        )}
      </section>
      <AgreementPolicyEditor groupId={g.id} version={g.latest_version_id} workspace={w} />
      {cap('members.invite') && <GroupInvitations groupId={g.id} invitations={w.invitations} />}
      {(cap('members.review') || w.requests.some((r) => r.member_id === me?.id)) && (
        <RequestsQueue workspace={w} />
      )}
      {me && ['approved', 'active', 'pending'].includes(me.status) && (
        <AgreementReview
          groupId={g.id}
          version={
            me.status === 'pending'
              ? (g.accepted_version_id ?? g.latest_version_id)
              : g.latest_version_id
          }
        />
      )}
      {g.accepted_version_id && <Replacements groupId={g.id} workspace={w} />}
      {w.can_manage && (
        <GroupStaff groupId={g.id} organizationId={g.organization_id} workspace={w} />
      )}
      <ActivityHistory events={w.events} />
      {profile && (
        <MemberProfileDrawer
          memberId={profile}
          currency={g.currency}
          capabilities={w.capabilities}
          onClose={() => setProfile('')}
        />
      )}
      {change && (
        <MemberStatusDialog
          member={change}
          capabilities={w.capabilities}
          activeGroup={Boolean(g.accepted_version_id)}
          onClose={() => setChange(null)}
        />
      )}
    </>
  )
}
function DirectEnrollment({
  groupId,
  organizationId,
  workspace: w,
}: {
  groupId: string
  organizationId: string
  workspace: Workspace
}) {
  const [user, setUser] = useState('')
  const cache = useQueryClient()
  const query = useQuery({
    queryKey: ['membership-directory', organizationId],
    queryFn: () => directory(organizationId),
  })
  const mutation = useMutation({
    mutationFn: (id: string) =>
      command('set_repa_member', { target: groupId, member_user: id, assigned: true }),
    onSuccess: async (_, id) => {
      setUser((current) => (current === id ? '' : current))
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['memberships'] }),
        cache.invalidateQueries({ queryKey: ['repa'] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      toast.success('Slot approved. The member must accept the full agreement.')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <form
      className="inline-form component-spacing"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(user)
      }}
    >
      <label>
        Organization member to enroll
        <select
          required
          disabled={mutation.isPending}
          value={user}
          onChange={(e) => setUser(e.target.value)}
        >
          <option value="">Select member</option>
          {query.data
            ?.filter((m) => !w.members.some((x) => x.user_id === m.user_id))
            .map((m) => (
              <option value={m.user_id} key={m.user_id}>
                {m.full_name || m.user_id}
              </option>
            ))}
        </select>
      </label>
      <Button type="submit" disabled={!user || mutation.isPending}>
        Assign member
      </Button>
      {query.isError && <p role="alert">{query.error.message}</p>}
    </form>
  )
}
