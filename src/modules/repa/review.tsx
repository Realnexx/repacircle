import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPlan } from '@/modules/rewards/service'
import type { PlanCosts } from '@/modules/rewards/config'
import { RewardPlanSummary } from '@/modules/rewards/components'
import { planMatches } from '@/modules/rewards/pricing'
import { feeDescription, scheduleDescription } from '@/modules/contributions/engine'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DataTable, Pagination, StatusBadge } from '@/components/data-display/components'
import { allocationPreview, calculateFunding, schedulePreview } from './calculations'
import { configSchema, type GroupConfig } from './config'
import {
  checkActivation,
  activateGroup,
  approveProposal,
  moneyText,
  type RepaBundle,
  type ActivationReport,
} from './service'
export function FundingReview({
  configuration: c,
  showSchedule = true,
  plan: suppliedPlan,
}: {
  configuration: GroupConfig
  showSchedule?: boolean
  plan?: PlanCosts
}) {
  const query = useQuery({
    queryKey: ['reward-plan', c.reward.plan_id],
    enabled: Boolean(c.reward.plan_id && !suppliedPlan),
    queryFn: () => getPlan(c.reward.plan_id!),
  })
  const plan = suppliedPlan ?? query.data
  const result = calculateFunding(c, plan)
  const valid =
    configSchema.safeParse(c).success &&
    (!c.reward.plan_id || Boolean(plan && planMatches(c, plan)))
  const [schedulePage, setSchedulePage] = useState(1)
  const page = Math.min(schedulePage, Math.max(1, Math.ceil(c.contribution.round_count / 24)))
  return (
    <>
      <section className="panel component-spacing">
        <div className="section-heading">
          <h2>Funding feasibility</h2>
          <StatusBadge status={result.valid ? 'success' : 'warning'}>
            {result.valid ? 'Funding assumptions balance' : 'Validation required'}
          </StatusBadge>
        </div>
        <p>
          Projection only. Late fees are excluded from expected collections. Reward fulfillment and
          payment execution are outside this phase.
        </p>
        <div className="repa-funding-grid">
          {[
            ['Expected collections', result.expected_collections_minor],
            ['Reward costs', result.reward_costs_minor],
            ['Delivery costs', result.delivery_costs_minor],
            ['Disclosed fees', result.disclosed_fees_minor],
            ['Available projected funding', result.available_funding_minor],
            ['Required funding / pooled target', result.required_funding_minor],
            ['Total shortfall', result.shortfall_minor],
            ['Scheduled liquidity shortfall', result.liquidity_shortfall_minor],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <small>{label}</small>
              <strong>{moneyText(Number(value), c.basic.currency)}</strong>
            </div>
          ))}
        </div>
        <p>
          {result.payouts} planned recipients / payouts · {result.product_quantity}{' '}
          {c.reward.plan_id ? 'physical product units' : 'reward units'}
        </p>
        {result.errors.length > 0 && (
          <ul className="repa-validation" role="alert">
            {result.errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel component-spacing">
        <h2>Reward, payment and payout summary</h2>
        <dl className="profile-details">
          <dt>Mechanism</dt>
          <dd>{c.mechanism.replaceAll('_', ' ')}</dd>
          <dt>Reward</dt>
          <dd>
            {c.reward.plan_id ? (
              `${c.reward.title} · Versioned catalog assignments, detailed below.`
            ) : (
              <>
                {c.reward.title} · {c.reward.kind} · {c.reward.quantity} units per recipient at{' '}
                {moneyText(c.reward.unit_cost_minor, c.basic.currency)} per unit
              </>
            )}
          </dd>
          <dt>Payment methods</dt>
          <dd>
            {c.payment.methods.map((m) => m.replaceAll('_', ' ')).join(', ') || 'Not configured'}
          </dd>
          <dt>Payment instructions</dt>
          <dd>{c.payment.instructions || 'None'}</dd>
          {c.payment.methods.includes('custom') && (
            <>
              <dt>Organizer payment option</dt>
              <dd>{c.payment.custom_label}</dd>
            </>
          )}
          <dt>Contributions</dt>
          <dd>
            {moneyText(c.contribution.amount_minor, c.basic.currency)} per member per round
            {c.contribution.policy === 'configurable'
              ? ' minimum; individual amounts below'
              : ' (fixed)'}
            {' · '}
            {c.contribution.member_count} members · {c.contribution.round_count} rounds
          </dd>
          <dt>Schedule</dt>
          <dd>
            Starts {c.schedule.start_date} · {scheduleDescription(c.schedule)}
            {' · '}cutoff {c.schedule.cutoff_time} ({c.schedule.timezone}) ·{' '}
            {c.schedule.grace_hours} hours grace
          </dd>
          <dt>Partial and late payments</dt>
          <dd>
            Partial payments {c.contribution.partial_payments ? 'allowed' : 'not allowed'} · Late
            policy: {c.contribution.late_policy}
            {c.contribution.late_policy === 'fee'
              ? ` · ${feeDescription(c.contribution.late_fee_rule)}`
              : ''}
          </dd>
          <dt>Recipient rule</dt>
          <dd>
            {c.distribution.rule.replaceAll('_', ' ')} ·{' '}
            {c.distribution.eligibility.replaceAll('_', ' ')} · {c.distribution.approval_count}{' '}
            approver(s)
            {c.distribution.eligibility === 'minimum_percent'
              ? ` · at least ${c.distribution.minimum_percent}% paid`
              : ''}
          </dd>
          {c.mechanism === 'rotating' && (
            <>
              <dt>Recipient slot order</dt>
              <dd>{c.distribution.rotation_order.join(' → ')}</dd>
            </>
          )}
          <dt>Membership</dt>
          <dd>
            Limit {c.membership.limit} · {c.membership.invitation_rule.replaceAll('_', ' ')} ·{' '}
            {c.membership.approval_required
              ? 'Organizer approval required'
              : 'No additional membership approval'}{' '}
            · Explicit version consent required
          </dd>
          <dt>Declared opening funding</dt>
          <dd>
            {moneyText(c.funding.opening_funding_minor, c.basic.currency)} ·{' '}
            {c.funding.funding_source || 'No external funding declared'}
          </dd>
          {c.mechanism === 'random_draw' && (
            <>
              <dt>Random selection policy</dt>
              <dd>
                Server cryptographic randomness, without replacement. Draw execution is outside
                Phase 3.
              </dd>
            </>
          )}
          <dt>Group terms</dt>
          <dd className="repa-terms">{c.membership.terms || 'Not provided'}</dd>
        </dl>
        {c.contribution.policy === 'configurable' && (
          <DataTable
            caption="Configured contributions per round"
            rows={c.contribution.member_amounts}
            rowKey={(r) => String(r.slot)}
            columns={[
              { key: 'slot', header: 'Member slot', render: (r) => r.slot },
              {
                key: 'amount',
                header: 'Contribution per round',
                render: (r) => moneyText(r.amount_minor, c.basic.currency),
              },
            ]}
          />
        )}
      </section>
      {c.reward.plan_id && query.isError && (
        <p role="alert">
          Reward plan unavailable.{' '}
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry reward plan
          </Button>
        </p>
      )}
      {c.reward.plan_id && plan && <RewardPlanSummary configuration={c} plan={plan} />}
      {valid && !c.reward.plan_id && c.mechanism === 'pooled_savings' && (
        <section className="panel component-spacing">
          <h2>Pooled allocation preview</h2>
          <p>
            Shares follow the saved member slots. Rounding uses largest remainders, with slot order
            breaking ties. No distribution is executed here.
          </p>
          <DataTable
            caption="Projected pooled allocation"
            rows={allocationPreview(c)}
            rowKey={(r) => String(r.slot)}
            columns={[
              { key: 'slot', header: 'Member slot', render: (r) => r.slot },
              {
                key: 'share',
                header: 'Allocation share',
                render: (r) => (r.basis_points / 100).toFixed(2) + '%',
              },
              { key: 'units', header: 'Reward units', render: (r) => r.reward_units },
              {
                key: 'value',
                header: 'Reward value / cost',
                render: (r) => moneyText(r.reward_value_minor, c.basic.currency),
              },
            ]}
          />
        </section>
      )}
      {showSchedule && (
        <section className="panel component-spacing">
          <h2>Schedule preview</h2>
          <p>
            Cutoff timezone: {c.schedule.timezone}. Grace period: {c.schedule.grace_hours} hours.
            {c.contribution.round_count} rounds. All rounds are available in the pages below.
          </p>
          {valid ? (
            <>
              <DataTable
                caption="Projected REPA schedule"
                rows={schedulePreview(c, plan).slice((page - 1) * 24, page * 24)}
                rowKey={(r) => String(r.round)}
                columns={[
                  { key: 'round', header: 'Round', render: (r) => r.round },
                  { key: 'date', header: 'Due date', render: (r) => r.date },
                  {
                    key: 'cutoff',
                    header: 'Cutoff / grace end',
                    render: (r) => (
                      <>
                        {new Date(r.cutoff_at).toLocaleString('en-PH', {
                          timeZone: c.schedule.timezone,
                        })}
                        <br />
                        {new Date(r.grace_ends_at).toLocaleString('en-PH', {
                          timeZone: c.schedule.timezone,
                        })}
                      </>
                    ),
                  },
                  { key: 'payouts', header: 'Payouts', render: (r) => r.payout_count },
                  {
                    key: 'balance',
                    header: 'Projected balance',
                    render: (r) => moneyText(r.projected_balance_minor, c.basic.currency),
                  },
                ]}
              />
              <Pagination
                page={page}
                pageSize={24}
                total={c.contribution.round_count}
                onPageChange={setSchedulePage}
              />
            </>
          ) : (
            <p>Complete the validated configuration to generate a schedule.</p>
          )}
        </section>
      )}
    </>
  )
}
export function ActivationPanel({
  bundle,
  dirty = false,
}: {
  bundle: RepaBundle
  dirty?: boolean
}) {
  const cache = useQueryClient()
  const [accepted, setAccepted] = useState(false)
  const [report, setReport] = useState<ActivationReport | null>(null)
  const [confirm, setConfirm] = useState(false)
  const g = bundle.group
  const future = Boolean(g.accepted_version_id)
  const version = bundle.versions.find((v) => v.id === g.latest_version_id)
  const mutation = useMutation({
    mutationFn: async (action: 'check' | 'activate') => {
      if (action === 'check') {
        const result = await checkActivation(g.id, g.latest_version_id)
        setReport(result)
        return
      }
      if (future) await approveProposal(g.id, g.latest_version_id)
      else await activateGroup(g.id, g.latest_version_id, accepted)
    },
    onSuccess: async (_, action) => {
      await cache.invalidateQueries({ queryKey: ['repa'] })
      if (action === 'activate') {
        setConfirm(false)
        toast.success(
          future
            ? 'Future proposal approved. Accepted obligations remain unchanged.'
            : 'REPA group activated with immutable accepted rules.',
        )
      }
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <section className="panel component-spacing">
      <h2>{future ? 'Future rules proposal approval' : 'Activation validation'}</h2>
      <p>
        {future
          ? 'An approved future proposal is recorded separately. It never replaces the accepted rules or rewrites existing obligations in Phase 3.'
          : 'Assign the configured members, obtain their acceptance of this exact version, and close enrollment before activation. Direct activation from draft is also allowed once all checks pass.'}
      </p>
      {dirty && <p className="error">Save your changes before validating the server snapshot.</p>}
      <p>
        Candidate version {version?.version_number} · {version?.approval_status} · Effective{' '}
        {version ? new Date(version.effective_date).toLocaleString() : ''}
      </p>
      <Button
        variant="secondary"
        disabled={dirty || mutation.isPending}
        onClick={() => mutation.mutate('check')}
      >
        Run server activation checks
      </Button>
      {report && (
        <div role="status" className="component-spacing">
          <p>
            {report.assigned_members} eligible members · {report.member_consents} consents ·{' '}
            {report.eligible_approvers} eligible approvers
          </p>
          {report.errors.length > 0 ? (
            <ul className="repa-validation">
              {report.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <p>All server checks passed for the saved version.</p>
          )}
        </div>
      )}
      <label className="checkbox-label component-spacing">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        I accept the financial assumptions, schedule, reward and group terms for this exact version.
      </label>
      {!confirm ? (
        <Button
          disabled={
            dirty ||
            !accepted ||
            !report?.valid ||
            version?.approval_status !== 'pending' ||
            mutation.isPending
          }
          onClick={() => setConfirm(true)}
        >
          {future ? 'Review future approval' : 'Review activation'}
        </Button>
      ) : (
        <div className="repa-confirm" role="alert">
          <h3>{future ? 'Approve future rules?' : 'Activate this REPA group?'}</h3>
          <p>
            Version {version?.version_number} will become immutable. Member consent and funding will
            be rechecked atomically on the server.
          </p>
          <div className="actions">
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate('activate')}>
              {mutation.isPending
                ? 'Validating…'
                : future
                  ? 'Confirm future approval'
                  : 'Confirm activation'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel confirmation
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
