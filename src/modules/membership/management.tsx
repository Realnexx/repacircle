import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { DataTable } from '@/components/data-display/components'
import { PageHeader } from '@/components/layout/page'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { directory, type DirectoryMember } from '@/modules/organizations/service'
import { useSession } from '@/modules/auth/session'
import {
  policySchema,
  publishPolicy,
  reviewRequest,
  getWorkspace,
  setStaff,
  staffCapabilities,
  capabilityLabels,
  proposeReplacement,
  acceptReplacement,
  completeReplacement,
  cancelReplacement,
  type Workspace,
  type MembershipRequest,
  type Replacement,
} from './service'

export function AgreementPolicyEditor({
  groupId,
  version,
  workspace,
}: {
  groupId: string
  version: string
  workspace: Workspace
}) {
  const cache = useQueryClient()
  const [refund, setRefund] = useState('')
  const [dispute, setDispute] = useState('')
  const [privacy, setPrivacy] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useMutation({
    mutationFn: () =>
      publishPolicy(
        groupId,
        version,
        policySchema.parse({
          refund_exit_policy: refund,
          dispute_process: dispute,
          privacy_notice: privacy,
        }),
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['memberships'] }),
    onError: (e) => toast.error(e.message),
  })
  if (workspace.policies)
    return (
      <section className="panel component-spacing">
        <h2>Published agreement policies</h2>
        <p>
          These policies are locked to the current rules version. New policies require a new rules
          version and fresh member consent.
        </p>
        <dl className="profile-details">
          <dt>Refund and exit</dt>
          <dd className="repa-terms">{workspace.policies.refund_exit_policy}</dd>
          <dt>Dispute process</dt>
          <dd className="repa-terms">{workspace.policies.dispute_process}</dd>
          <dt>Privacy notice</dt>
          <dd className="repa-terms">{workspace.policies.privacy_notice}</dd>
        </dl>
      </section>
    )
  if (!workspace.capabilities.includes('members.review')) return null
  return (
    <section className="panel component-spacing">
      <h2>Publish agreement policies</h2>
      <p>
        Publish specific refund/exit rules, the dispute process and privacy notice before collecting
        acceptance. Publishing is permanent for this rules version.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Refund and exit policy
          <textarea
            required
            minLength={20}
            maxLength={4000}
            value={refund}
            onChange={(e) => setRefund(e.target.value)}
          />
        </label>
        <label>
          Dispute process
          <textarea
            required
            minLength={20}
            maxLength={4000}
            value={dispute}
            onChange={(e) => setDispute(e.target.value)}
          />
        </label>
        <label>
          Privacy notice
          <textarea
            required
            minLength={20}
            maxLength={4000}
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm these policies are ready for member acceptance.
        </label>
        <Button
          type="submit"
          className="component-spacing"
          disabled={!confirmed || mutation.isPending}
        >
          Publish policies for this version
        </Button>
      </form>
    </section>
  )
}
export function RequestsQueue({ workspace: w }: { workspace: Workspace }) {
  const [selected, setSelected] = useState<MembershipRequest | null>(null)
  return (
    <section className="panel component-spacing">
      <h2>Pending membership requests</h2>
      <p>
        Approval reserves a slot. The member must then accept the exact agreement before
        participation. An active group requires controlled replacement.
      </p>
      <DataTable
        caption="Pending membership requests"
        rows={w.requests.filter((r) => r.status === 'pending')}
        rowKey={(r) => r.id}
        columns={[
          { key: 'member', header: 'Member', render: (r) => r.name },
          { key: 'message', header: 'Request message', render: (r) => r.message },
          {
            key: 'date',
            header: 'Requested',
            render: (r) => new Date(r.created_at).toLocaleString(),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) =>
              w.capabilities.includes('members.review') ? (
                <Button variant="secondary" onClick={() => setSelected(r)}>
                  Review request
                </Button>
              ) : (
                'Awaiting organizer review'
              ),
          },
        ]}
      />
      {selected && <ReviewRequestDialog request={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
function ReviewRequestDialog({
  request: r,
  onClose,
}: {
  request: MembershipRequest
  onClose: () => void
}) {
  const id = useId()
  const cache = useQueryClient()
  const [decision, setDecision] = useState('approved')
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => reviewRequest(r.id, decision, reason),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['memberships'] }),
        cache.invalidateQueries({ queryKey: ['repa'] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      onClose()
      toast.success('Membership request reviewed.')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Modal labelledBy={id} onClose={onClose} busy={mutation.isPending}>
      <h2 id={id}>Review membership request</h2>
      <p>
        {r.name}: {r.message}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Decision
          <select value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="approved">Approve and reserve a slot</option>
            <option value="rejected">Reject request</option>
          </select>
        </label>
        <label>
          Review reason
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="actions">
          <Button type="submit" disabled={mutation.isPending}>
            Confirm request decision
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
export function GroupStaff({
  groupId,
  organizationId,
  workspace: w,
}: {
  groupId: string
  organizationId: string
  workspace: Workspace
}) {
  const query = useQuery({
    queryKey: ['membership-directory', organizationId],
    queryFn: () => directory(organizationId),
  })
  const cache = useQueryClient()
  const [user, setUser] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => setStaff(groupId, user, permissions, reason),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['memberships'] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      setReason('')
      toast.success('Group staff permissions updated.')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <section className="panel component-spacing">
      <h2>Group-specific staff permissions</h2>
      <p>
        Grant only the capabilities needed for this group to existing organization staff. This does
        not promote organization roles. Staff must have verified accounts, completed profiles and
        MFA.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Organization staff account
          <select
            required
            value={user}
            onChange={(e) => {
              setUser(e.target.value)
              setPermissions(w.staff.find((s) => s.user_id === e.target.value)?.permissions ?? [])
            }}
          >
            <option value="">Select staff</option>
            {query.data
              ?.filter((s: DirectoryMember) => ['organizer', 'treasurer'].includes(s.role))
              .map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name} · {s.role}
                </option>
              ))}
          </select>
        </label>
        <fieldset>
          <legend>Permissions for this group</legend>
          {staffCapabilities.map((cap) => (
            <label key={cap} className="checkbox-label">
              <input
                type="checkbox"
                checked={permissions.includes(cap)}
                onChange={(e) =>
                  setPermissions((old) =>
                    e.target.checked ? [...old, cap] : old.filter((p) => p !== cap),
                  )
                }
              />
              {capabilityLabels[cap]}
            </label>
          ))}
        </fieldset>
        <label>
          Staff assignment reason
          <input
            required
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p>
          Saving an empty permission list revokes the explicit grant. Organization owners and
          organizers retain their organization permissions.
        </p>
        <Button type="submit" disabled={!user || mutation.isPending}>
          Save group staff permissions
        </Button>
      </form>
      {query.isError && <p role="alert">{query.error.message}</p>}
    </section>
  )
}
export function Replacements({ groupId, workspace: w }: { groupId: string; workspace: Workspace }) {
  const { session } = useSession()
  const cache = useQueryClient()
  const [outgoing, setOutgoing] = useState('')
  const [incoming, setIncoming] = useState('')
  const [round, setRound] = useState(2)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState<Replacement | null>(null)
  const proposal = useMutation({
    mutationFn: () => proposeReplacement(outgoing, incoming, round, reason),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['memberships'] })
      setReason('')
      toast.success('Replacement proposed. Both participants must accept.')
    },
    onError: (e) => toast.error(e.message),
  })
  const action = useMutation({
    mutationFn: async ({ r, kind }: { r: Replacement; kind: 'accept' | 'complete' | 'cancel' }) =>
      kind === 'accept'
        ? acceptReplacement(r.id)
        : kind === 'complete'
          ? completeReplacement(r.id)
          : cancelReplacement(r.id, reason),
    onSuccess: async () => {
      setConfirm(null)
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['memberships'] }),
        cache.invalidateQueries({ queryKey: ['repa'] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      toast.success('Replacement workflow updated. Historical records are preserved.')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <section className="panel component-spacing">
      <h2>Controlled member replacement</h2>
      <p>
        Both participants must consent. Only future, unpaid rounds can transfer. Earlier
        contributions stay with the original member. A person who already received the cycle reward
        cannot transfer their remaining obligations.
      </p>
      {w.can_manage && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            proposal.mutate()
          }}
        >
          <div className="membership-profile-grid">
            <label>
              Outgoing member
              <select required value={outgoing} onChange={(e) => setOutgoing(e.target.value)}>
                <option value="">Select member</option>
                {w.members
                  .filter((m) => ['active', 'suspended'].includes(m.status) && !m.reward_received)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · Slot {m.slot}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Incoming pending member
              <select required value={incoming} onChange={(e) => setIncoming(e.target.value)}>
                <option value="">Select pending member</option>
                {w.members
                  .filter((m) => m.status === 'pending')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Transfer from future round
              <input
                required
                type="number"
                min={1}
                max={1000}
                value={round}
                onChange={(e) => setRound(Number(e.target.value))}
              />
            </label>
            <label>
              Replacement reason
              <textarea
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <Button type="submit" disabled={proposal.isPending}>
            Propose replacement
          </Button>
        </form>
      )}
      {w.replacements.map((r) => {
        const me = w.members.find((m) => m.user_id === session?.user.id)
        const participant = me?.id === r.incoming_member_id || me?.id === r.outgoing_member_id
        const accepted =
          me?.id === r.incoming_member_id ? r.incoming_accepted_at : r.outgoing_accepted_at
        return (
          <article key={r.id} className="membership-history">
            <h3>
              {r.outgoing_name} → {r.incoming_name}
            </h3>
            <p>
              Slot {r.member_slot} · from round {r.from_round} · {r.status}
            </p>
            <p>{r.reason}</p>
            <p>
              Outgoing consent: {r.outgoing_accepted_at ? 'Accepted' : 'Pending'} · Incoming
              consent: {r.incoming_accepted_at ? 'Accepted' : 'Pending'}
            </p>
            {r.status === 'pending' && (
              <div className="membership-actions">
                {me?.id === r.incoming_member_id && (
                  <Link
                    className="button button-secondary"
                    to={`/groups/${groupId}/agreement?version=${r.rules_version_id}`}
                  >
                    Review replacement agreement
                  </Link>
                )}
                {participant && !accepted && (
                  <Button disabled={action.isPending} onClick={() => setConfirm(r)}>
                    Review transfer consent
                  </Button>
                )}
                {w.can_manage && (
                  <>
                    <Button
                      disabled={
                        !r.outgoing_accepted_at || !r.incoming_accepted_at || action.isPending
                      }
                      onClick={() => action.mutate({ r, kind: 'complete' })}
                    >
                      Complete accepted replacement
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={reason.trim().length < 10 || action.isPending}
                      onClick={() => action.mutate({ r, kind: 'cancel' })}
                    >
                      Cancel proposal with reason above
                    </Button>
                  </>
                )}
              </div>
            )}
          </article>
        )
      })}
      {confirm && (
        <Modal
          onClose={() => setConfirm(null)}
          busy={action.isPending}
          labelledBy="replacement-consent-title"
        >
          <h2 id="replacement-consent-title">Accept future obligation transfer?</h2>
          <p>
            Slot {confirm.member_slot} moves from {confirm.outgoing_name} to {confirm.incoming_name}
            , starting round {confirm.from_round}. Past obligations, contributions and previous
            reward records are preserved. Future recipient eligibility moves to the incoming member.
            Incoming members must first accept the full replacement agreement.
          </p>
          <p>{confirm.reason}</p>
          <div className="actions">
            <Button
              disabled={action.isPending}
              onClick={() => action.mutate({ r: confirm, kind: 'accept' })}
            >
              I accept this replacement transfer
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep reviewing
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}
export default function PendingRequestsPage() {
  const { groupId } = useParams()
  const query = useQuery({
    queryKey: ['memberships', groupId],
    queryFn: () => getWorkspace(groupId!),
  })
  return (
    <>
      <PageHeader title="Pending membership requests" />
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : (
        <RequestsQueue workspace={query.data} />
      )}
    </>
  )
}
