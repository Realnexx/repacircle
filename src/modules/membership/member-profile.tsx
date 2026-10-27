import { useId, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-display/components'
import { LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { command } from '@/lib/api/client'
import { parseCentavos } from '@/lib/utils/currency'
import { moneyText } from '@/modules/repa/service'
import {
  getMemberProfile,
  changeStatus,
  type Member,
  type MemberProfile,
  type MembershipEvent,
} from './service'

export function ActivityHistory({ events }: { events: MembershipEvent[] }) {
  return (
    <section className="panel component-spacing">
      <h2>Membership activity history</h2>
      <p>
        Permanent events show who changed membership, agreement acceptance and recorded financial
        history. The latest 100 group events are shown; a member profile retains that member’s full
        history.
      </p>
      {!events.length && <p>No membership events yet.</p>}
      {events.map((e) => (
        <details className="membership-history" key={e.id}>
          <summary>
            {e.event_type.replaceAll('.', ' · ').replaceAll('_', ' ')} ·{' '}
            {new Date(e.created_at).toLocaleString()}
          </summary>
          <p>{e.reason}</p>
          <p>Actor: {e.actor_id}</p>
          <pre className="repa-value">{JSON.stringify(e.details, null, 2)}</pre>
        </details>
      ))}
    </section>
  )
}
export function MemberProfileDrawer({
  memberId,
  currency,
  capabilities,
  onClose,
}: {
  memberId: string
  currency: string
  capabilities: string[]
  onClose: () => void
}) {
  const title = useId()
  const query = useQuery({
    queryKey: ['memberships', 'profile', memberId],
    queryFn: () => getMemberProfile(memberId),
  })
  return (
    <Modal className="membership-drawer" onClose={onClose} busy={false} labelledBy={title}>
      <h2 id={title}>Member profile</h2>
      <Button variant="ghost" onClick={onClose}>
        Close profile
      </Button>
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={query.error.message} />
      ) : (
        <ProfileContent data={query.data} currency={currency} capabilities={capabilities} />
      )}
    </Modal>
  )
}
function ProfileContent({
  data: d,
  currency,
  capabilities,
}: {
  data: MemberProfile
  currency: string
  capabilities: string[]
}) {
  const f = d.financial
  return (
    <div>
      <h3>{d.profile.full_name}</h3>
      <p>
        {d.member.status} · {d.member.slot ? `Slot ${d.member.slot}` : 'No reserved slot'}
      </p>
      <dl className="profile-details">
        <dt>Email</dt>
        <dd>{d.profile.email ?? 'Restricted'}</dd>
        <dt>Phone</dt>
        <dd>{d.profile.mobile_number ?? 'Restricted'}</dd>
        <dt>Location</dt>
        <dd>
          {[d.profile.city_name, d.profile.province_name, d.profile.region_name]
            .filter(Boolean)
            .join(', ')}
        </dd>
      </dl>
      {f && (
        <>
          <div className="membership-profile-grid component-spacing">
            <section className="membership-alert">
              <h3>Outstanding contributions</h3>
              <strong>{moneyText(f.outstanding_minor, currency)}</strong>
              <p>
                {moneyText(f.credited_minor, currency)} credited against{' '}
                {moneyText(f.due_minor, currency)} currently assigned obligations.
              </p>
            </section>
            <section className="membership-alert">
              <h3>Payout eligibility · round {f.round}</h3>
              <p>{f.eligible ? 'Contribution and membership checks met' : 'Not eligible'}</p>
              <p>
                {f.reward_received ? 'Cycle reward already received' : 'No cycle reward recorded'}
              </p>
              <ul>
                {f.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p>Eligibility does not select a recipient or authorize a payout.</p>
            </section>
          </div>
          <DataTable
            caption="Member obligation history"
            rows={d.obligations}
            rowKey={(r) => r.id}
            columns={[
              { key: 'round', header: 'Round', render: (r) => r.round_number },
              {
                key: 'deadline',
                header: 'Deadline',
                render: (r) => new Date(r.due_at).toLocaleString(),
              },
              {
                key: 'due',
                header: 'Original obligation',
                render: (r) => moneyText(r.due_minor, currency),
              },
              {
                key: 'credit',
                header: 'Verified credits',
                render: (r) => moneyText(r.credited_minor, currency),
              },
              {
                key: 'owner',
                header: 'Responsibility',
                render: (r) =>
                  r.current_member_id === d.member.id
                    ? 'Currently assigned'
                    : 'Transferred — history preserved',
              },
            ]}
          />
          <h3 className="component-spacing">Verified contribution and reward history</h3>
          <DataTable
            caption="Verified historical records"
            rows={d.financial_events}
            rowKey={(e) => e.id}
            columns={[
              { key: 'kind', header: 'Record', render: (e) => e.kind.replaceAll('_', ' ') },
              { key: 'round', header: 'Round', render: (e) => e.round_number },
              { key: 'value', header: 'Value', render: (e) => moneyText(e.amount_minor, currency) },
              { key: 'ref', header: 'External reference', render: (e) => e.external_reference },
            ]}
          />
          {(capabilities.includes('finance.record') || capabilities.includes('rewards.record')) && (
            <FinancialHistoryForm data={d} capabilities={capabilities} />
          )}
        </>
      )}
      <h3 className="component-spacing">Accepted agreements</h3>
      {d.agreements.length ? (
        d.agreements.map((a) => (
          <details key={a.id} className="membership-history">
            <summary>
              Rules {a.rules_version_id} · Slot {a.member_slot} ·{' '}
              {new Date(a.accepted_at).toLocaleString()}
            </summary>
            <p>
              Accepted by {a.accepted_by} · Policy {a.policy_id}
            </p>
            <pre className="repa-value">{JSON.stringify(a.snapshot, null, 2)}</pre>
          </details>
        ))
      ) : (
        <p>No complete group agreement recorded yet.</p>
      )}
      <ActivityHistory events={d.events} />
    </div>
  )
}
function FinancialHistoryForm({
  data,
  capabilities,
}: {
  data: MemberProfile
  capabilities: string[]
}) {
  const cache = useQueryClient()
  const [kind, setKind] = useState(
    capabilities.includes('finance.record') ? 'contribution_credit' : 'reward_received',
  )
  const [obligation, setObligation] = useState('')
  const [round, setRound] = useState(1)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [evidence, setEvidence] = useState('')
  const [verified, setVerified] = useState(false)
  const mutation = useMutation({
    mutationFn: async () => {
      const cents = parseCentavos(amount)
      if (cents === null || BigInt(cents) <= 0n || BigInt(cents) > 1_000_000_000_000_000n)
        throw new Error('Enter a valid positive amount.')
      return command('record_group_member_financial_event', {
        member_id: data.member.id,
        event_kind: kind,
        obligation_id: kind === 'contribution_credit' ? obligation : null,
        round_number: round,
        amount_minor: Number(cents),
        external_reference: reference,
        evidence_note: evidence,
      })
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['memberships'] })
      setReference('')
      setEvidence('')
      setAmount('')
      setVerified(false)
      toast.success('Verified history recorded permanently. No money was moved.')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <form
      className="membership-dialog-section"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <h3>Record verified history</h3>
      <p>
        This records an external payment or delivered reward you have verified. It does not collect
        or send money. Records are permanent; use a unique reference and evidence note.
      </p>
      <label>
        Record type
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {capabilities.includes('finance.record') && (
            <option value="contribution_credit">Verified contribution credit</option>
          )}
          {capabilities.includes('rewards.record') && (
            <option value="reward_received">Reward already delivered</option>
          )}
        </select>
      </label>
      {kind === 'contribution_credit' ? (
        <label>
          Obligation
          <select
            required
            value={obligation}
            onChange={(e) => {
              setObligation(e.target.value)
              setRound(data.obligations.find((o) => o.id === e.target.value)?.round_number ?? 1)
            }}
          >
            <option value="">Select an obligation</option>
            {data.obligations
              .filter(
                (o) => o.current_member_id === data.member.id && o.credited_minor < o.due_minor,
              )
              .map((o) => (
                <option key={o.id} value={o.id}>
                  Round {o.round_number}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <label>
          Reward round
          <input
            required
            type="number"
            min={1}
            max={1000}
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
          />
        </label>
      )}
      <label>
        Verified amount / reward value
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label>
        Unique external reference
        <input
          required
          minLength={3}
          maxLength={200}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <label>
        Verification evidence note
        <textarea
          required
          minLength={10}
          maxLength={2000}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        I verified the external record and understand this history is permanent.
      </label>
      <Button
        type="submit"
        className="component-spacing"
        disabled={!verified || mutation.isPending}
      >
        Record verified history
      </Button>
    </form>
  )
}
export function MemberStatusDialog({
  member,
  capabilities,
  activeGroup,
  onClose,
}: {
  member: Member
  capabilities: string[]
  activeGroup: boolean
  onClose: () => void
}) {
  const title = useId()
  const cache = useQueryClient()
  const [next, setNext] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const options: string[] = []
  if (capabilities.includes('members.suspend') && ['approved', 'active'].includes(member.status))
    options.push('suspended')
  if (capabilities.includes('members.review')) {
    if (member.status === 'suspended') options.push(activeGroup ? 'active' : 'approved')
    if (!['withdrawn', 'removed'].includes(member.status)) options.push('withdrawn', 'removed')
  }
  const mutation = useMutation({
    mutationFn: () => changeStatus(member, next, reason),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['memberships'] }),
        cache.invalidateQueries({ queryKey: ['repa'] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      onClose()
      toast.success('Membership status updated. Historical obligations and rewards are preserved.')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Modal labelledBy={title} onClose={onClose} busy={mutation.isPending}>
      <h2 id={title}>Change membership status</h2>
      <p>
        {member.name} · current status {member.status}
      </p>
      <p>
        Suspension blocks participation while preserving debts and reward history. Outstanding
        obligations block removal. Active cycle exits require controlled replacement.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          New membership status
          <select required value={next} onChange={(e) => setNext(e.target.value)}>
            <option value="">Select status</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Membership change reason
          <textarea
            required
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I understand this change does not cancel or erase financial obligations.
        </label>
        <div className="actions component-spacing">
          <Button type="submit" disabled={!next || !confirmed || mutation.isPending}>
            Confirm membership change
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
