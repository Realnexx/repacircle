import type { RenderField } from './schema-form'
const f = (
  key: string,
  label: string,
  type: RenderField['type'] = 'text',
  options?: string[],
  extra: Partial<RenderField> = {},
): RenderField => ({ key, label, type, options, required: true, ...extra })
const at = (key: string, val: unknown) => (c: Record<string, unknown>) =>
  key
    .split('.')
    .reduce<unknown>(
      (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
      c,
    ) === val
export const wizardSteps = [
  'Basic information',
  'REPA mechanism',
  'Rewards',
  'Contributions',
  'Payment methods',
  'Distribution rules',
  'Membership & agreements',
  'Review & activation',
]
export const stepFields: Record<number, RenderField[]> = {
  0: [
    f('basic.name', 'Group name', 'text', undefined, { min: 2, max: 100 }),
    f('basic.description', 'Description', 'textarea', undefined, { required: false, max: 2000 }),
    f('basic.image_path', 'Group image', 'image', undefined, { required: false }),
    f('basic.visibility', 'Visibility', 'select', ['organization', 'invite_only']),
    f('basic.currency', 'Currency', 'select', ['PHP', 'USD', 'EUR']),
    f('basic.start_date', 'Group start date', 'date'),
  ],
  1: [
    f('mechanism', 'REPA mechanism', 'radio', ['rotating', 'random_draw', 'pooled_savings']),
    f('mechanism_options.target_minor', 'Pooled savings target', 'currency', undefined, {
      when: at('mechanism', 'pooled_savings'),
    }),
  ],
  2: [
    f('reward.kind', 'Reward type', 'select', [
      'cash',
      'physical_product',
      'digital_product',
      'service',
      'mixed',
      'custom',
    ]),
    f('reward.title', 'Reward title'),
    f('reward.unit_cost_minor', 'Disclosed cost per unit / cash reward', 'currency'),
    f('reward.quantity', 'Units per recipient', 'number', undefined, { min: 1, max: 1000 }),
    f('reward.delivery_per_payout_minor', 'Delivery cost per recipient', 'currency'),
    f(
      'reward.details',
      'Reward description, fulfilment and mixed reward breakdown',
      'textarea',
      undefined,
      { required: false, max: 4000 },
    ),
  ],
  3: [
    f('contribution.amount_minor', 'Contribution per member per round / minimum', 'currency'),
    f('contribution.policy', 'Contribution policy', 'select', ['fixed', 'configurable']),
    f('contribution.member_count', 'Number of members', 'number', undefined, { min: 2, max: 1000 }),
    f('contribution.round_count', 'Number of rounds', 'number', undefined, { min: 1, max: 1000 }),
    f('contribution.member_amounts', 'Member contributions', 'repeating', undefined, {
      max: 1000,
      when: at('contribution.policy', 'configurable'),
      children: [
        f('slot', 'Member slot', 'number', undefined, { min: 1, max: 1000 }),
        f('amount_minor', 'Amount per round', 'currency'),
      ],
    }),
    f('schedule.frequency', 'Contribution frequency', 'select', [
      'daily',
      'weekly',
      'biweekly',
      'monthly',
      'custom',
      'weekdays',
      'monthly_dates',
      'custom_dates',
    ]),
    f('schedule.every_days', 'Days between contributions', 'number', undefined, {
      min: 1,
      max: 365,
      when: at('schedule.frequency', 'custom'),
    }),
    f('schedule.start_date', 'Contribution start date', 'date'),
    f('schedule.cutoff_time', 'Cutoff time', 'time'),
    f('schedule.timezone', 'Schedule timezone', 'select', ['Asia/Manila', 'UTC']),
    f('schedule.grace_hours', 'Grace period (hours)', 'number', undefined, { min: 0, max: 168 }),
    f('contribution.partial_payments', 'Allow partial payments', 'checkbox', undefined, {
      required: false,
    }),
    f('contribution.late_policy', 'Late payment policy', 'select', ['flag', 'reject', 'fee']),
    f('contribution.late_fee_minor', 'Disclosed late fee', 'currency', undefined, {
      when: at('contribution.late_policy', 'fee'),
    }),
  ],
  4: [
    f('payment.methods', 'Accepted payment methods', 'multi_select', [
      'cash',
      'gcash_manual',
      'maya_manual',
      'bank_transfer',
      'gateway',
      'custom',
    ]),
    f('payment.instructions', 'Manual payment instructions', 'textarea', undefined, {
      required: false,
      max: 4000,
    }),
    f('payment.custom_label', 'Organizer-defined option name', 'text', undefined, {
      required: false,
    }),
    f(
      'payment.gateway_provider',
      'Gateway provider (configuration only; activation unavailable in Phase 3)',
      'text',
      undefined,
      { required: false },
    ),
  ],
  5: [
    f('distribution.rule', 'Recipient / allocation rule', 'select', [
      'fixed_rotation',
      'secure_random',
      'contribution_based',
      'equal',
      'fixed_share',
    ]),
    f(
      'rotation_order_input',
      'Fixed rotation order (comma-separated member slots)',
      'text',
      undefined,
      {
        when: at('distribution.rule', 'fixed_rotation'),
        hint: 'Example: 1, 2, 3. Every configured member slot must appear exactly once.',
      },
    ),
    f('distribution.fixed_shares', 'Fixed shares', 'repeating', undefined, {
      max: 1000,
      when: at('distribution.rule', 'fixed_share'),
      children: [
        f('slot', 'Member slot', 'number', undefined, { min: 1, max: 1000 }),
        f('basis_points', 'Share in basis points (100 = 1%)', 'number', undefined, {
          min: 1,
          max: 10000,
        }),
      ],
    }),
    f('distribution.eligibility', 'Recipient eligibility', 'select', [
      'fully_paid',
      'minimum_percent',
    ]),
    f('distribution.minimum_percent', 'Minimum paid percentage', 'number', undefined, {
      min: 1,
      max: 100,
      when: at('distribution.eligibility', 'minimum_percent'),
    }),
    f('distribution.approval_count', 'Required payout approvers', 'number', undefined, {
      min: 1,
      max: 5,
      hint: 'Requires this many verified, MFA-enrolled owners or organizers with payout-management access.',
    }),
  ],
  6: [
    f('membership.limit', 'Member limit', 'number', undefined, { min: 2, max: 1000 }),
    f('membership.invitation_rule', 'Invitation rules', 'select', [
      'organizer_only',
      'members_can_request',
    ]),
    f('membership.approval_required', 'Require member approval', 'checkbox', undefined, {
      required: false,
    }),
    f('membership.terms', 'Group terms and obligations', 'textarea', undefined, {
      min: 20,
      max: 10000,
    }),
    f(
      'membership.consent_required',
      'Require each member to accept the exact rules version',
      'checkbox',
    ),
  ],
  7: [
    f('funding.disclosed_fees_minor', 'Disclosed fees for the full cycle', 'currency'),
    f('funding.opening_funding_minor', 'Declared opening funding / organizer subsidy', 'currency'),
    f('funding.funding_source', 'Source of declared opening funding', 'textarea', undefined, {
      required: false,
      max: 500,
    }),
    f(
      'funding.opening_funding_confirmed',
      'I confirm the declared opening funding is available',
      'checkbox',
      undefined,
      { required: false },
    ),
  ],
}
