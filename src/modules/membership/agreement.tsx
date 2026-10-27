import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page'
import { LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { useSession } from '@/modules/auth/session'
import { FundingReview } from '@/modules/repa/review'
import { SchemaForm, setPath } from '@/modules/repa/schema-form'
import { validateDynamic } from '@/modules/repa/config'
import { moneyText } from '@/modules/repa/service'
import {
  agreementSections,
  allAcknowledgements,
  getAgreement,
  acceptAgreement,
  type AgreementBundle,
} from './service'
import './styles.css'

export function AgreementReview({ groupId, version }: { groupId: string; version?: string }) {
  const { session } = useSession()
  const query = useQuery({
    queryKey: ['memberships', 'agreement', groupId, version],
    enabled: Boolean(session),
    queryFn: () => getAgreement(groupId, version),
  })
  if (query.isPending) return <LoadingSkeleton />
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
  return (
    <AgreementForm
      key={`${query.data.version_id}:${query.data.policies?.id}:${query.data.member?.id}`}
      bundle={query.data}
    />
  )
}
function AgreementForm({ bundle: b }: { bundle: AgreementBundle }) {
  const cache = useQueryClient()
  const [ack, setAck] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<string[]>([])
  const mutation = useMutation({
    mutationFn: () => acceptAgreement(b, ack, values),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['memberships'] }),
        cache.invalidateQueries({ queryKey: ['repa'] }),
        cache.invalidateQueries({ queryKey: ['access'] }),
      ])
      toast.success('You accepted this exact rules version. Your agreement is preserved.')
    },
    onError: (e) => toast.error(e.message),
  })
  if (!b.member) return <p>Enrollment approval is required before agreement acceptance.</p>
  if (!b.policies)
    return (
      <section className="panel component-spacing">
        <h2>Agreement policies pending</h2>
        <p>
          The organizer must publish refund/exit, dispute and privacy policies for this exact
          version before anyone can accept it.
        </p>
      </section>
    )
  if (b.agreement)
    return (
      <section className="panel component-spacing" role="status">
        <h2>Your agreement — version {b.version_number}</h2>
        <p>
          Accepted {new Date(b.agreement.accepted_at).toLocaleString()}. Your acceptance is
          preserved for this version and member slot {b.agreement.member_slot}.
        </p>
      </section>
    )
  if (!['approved', 'active'].includes(b.member.status) && !b.replacement)
    return (
      <p>Your request must be approved and assigned a slot before you can accept the agreement.</p>
    )
  const c = b.configuration
  const custom = c.fields.filter((f) => f.category === 'membership')
  const slot = b.replacement?.member_slot ?? b.member.slot
  const contribution =
    c.contribution.policy === 'fixed'
      ? c.contribution.amount_minor
      : (c.contribution.member_amounts.find((a) => a.slot === slot)?.amount_minor ?? 0)
  const details: Record<keyof typeof agreementSections, string> = {
    contribution: `Member slot ${slot}: ${moneyText(contribution, c.basic.currency)} per round. ${c.contribution.round_count} rounds.`,
    schedule: `${scheduleDescription(c.schedule)}, starting ${c.schedule.start_date}. See every due date below.`,
    deadlines: `Cutoff ${c.schedule.cutoff_time} (${c.schedule.timezone}); ${c.schedule.grace_hours} hours grace.`,
    reward: c.reward.plan_id
      ? `${c.reward.title}. Immutable catalog assignments, costs and round allocations are shown in the reward plan below and recorded with this agreement.`
      : `${c.reward.title} — ${c.reward.kind.replaceAll('_', ' ')}. ${c.reward.quantity} units per recipient; disclosed unit value ${moneyText(c.reward.unit_cost_minor, c.basic.currency)}. ${c.reward.details}`,
    mechanism: c.mechanism.replaceAll('_', ' '),
    selection: `${c.distribution.rule.replaceAll('_', ' ')}. Eligibility: ${c.distribution.eligibility.replaceAll('_', ' ')}${c.distribution.eligibility === 'minimum_percent' ? ` (${c.distribution.minimum_percent}%)` : ''}. ${c.distribution.approval_count} payout approver(s).${c.mechanism === 'rotating' ? ` Slot order: ${c.distribution.rotation_order.join(' → ')}.` : ''}`,
    late_policy: `${c.contribution.late_policy.replaceAll('_', ' ')}${c.contribution.late_policy === 'fee' ? ` — ${feeDescription(c.contribution.late_fee_rule)}` : ''}. Partial payments ${c.contribution.partial_payments ? 'allowed' : 'not allowed'}.`,
    refund_exit: b.policies.refund_exit_policy,
    disputes: b.policies.dispute_process,
    privacy: b.policies.privacy_notice,
  }
  const all = Object.keys(agreementSections).every((k) => ack[k] === true)
  return (
    <section className="component-spacing">
      <h2>Your agreement — version {b.version_number}</h2>
      <p>
        Review the exact contribution, reward, selection and policy terms. Acceptance records your
        account, slot, version, policy snapshot and timestamp.
      </p>
      {b.replacement && (
        <div className="repa-lock-note">
          Replacement of slot {slot} from round {b.replacement.from_round}. Only the disclosed
          future obligations transfer; earlier payments and rewards remain in their original
          history. Future recipient eligibility moves with the slot to you. The transferred
          contribution total is{' '}
          {moneyText(
            contribution * (c.contribution.round_count - b.replacement.from_round + 1),
            c.basic.currency,
          )}
          . Reason: {b.replacement.reason}
        </div>
      )}
      <div className="membership-agreement-sections">
        {Object.entries(agreementSections).map(([key, label]) => (
          <section className="panel" key={key}>
            <h3>{label}</h3>
            <p className="repa-terms">{details[key as keyof typeof details]}</p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={ack[key] === true}
                onChange={(e) => setAck((old) => ({ ...old, [key]: e.target.checked }))}
              />
              I accept: {label.toLowerCase()}
            </label>
          </section>
        ))}
      </div>
      <FundingReview configuration={c} />
      <section className="panel component-spacing">
        <SchemaForm
          fields={custom}
          values={values}
          groupId={b.group.id}
          onChange={(path, value) => setValues((old) => setPath(old, path, value))}
        />
        <label className="checkbox-label component-spacing">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAck(e.target.checked ? allAcknowledgements() : {})}
          />
          I have reviewed and accept version {b.version_number}, including every section above and
          the group terms.
        </label>
        {errors.length > 0 && (
          <ul className="repa-validation" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <Button
          className="component-spacing"
          disabled={
            !all ||
            mutation.isPending ||
            ['suspended', 'withdrawn', 'removed'].includes(b.member.status)
          }
          onClick={() => {
            const problems = validateDynamic(custom, values)
            setErrors(problems)
            if (!problems.length) mutation.mutate()
          }}
        >
          {mutation.isPending ? 'Recording acceptance…' : 'Accept this rules version'}
        </Button>
      </section>
    </section>
  )
}
export default function GroupAgreementPage() {
  const { groupId } = useParams()
  const [params] = useSearchParams()
  const { session } = useSession()
  return (
    <>
      <PageHeader
        title="Group agreement"
        description="Review the full rules and policies before joining."
      />
      {!session ? (
        <Link className="button" to="/login" state={{ from: location.pathname + location.search }}>
          Sign in to review
        </Link>
      ) : !session.user.email_confirmed_at ? (
        <Link to="/verify-email">Verify your email first</Link>
      ) : (
        groupId && (
          <AgreementReview groupId={groupId} version={params.get('version') ?? undefined} />
        )
      )}
    </>
  )
}
import { feeDescription, scheduleDescription } from '@/modules/contributions/engine'
