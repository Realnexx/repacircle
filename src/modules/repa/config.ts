import { z } from 'zod'
import { scheduleDates } from '../contributions/engine.ts'
export const mechanisms = ['rotating', 'random_draw', 'pooled_savings'] as const
export const statuses = [
  'draft',
  'enrollment_open',
  'enrollment_closed',
  'active',
  'paused',
  'completed',
  'cancelled',
  'archived',
] as const
export type GroupStatus = (typeof statuses)[number]
export const transitions: Record<GroupStatus, readonly GroupStatus[]> = {
  draft: ['enrollment_open', 'active', 'cancelled'],
  enrollment_open: ['enrollment_closed', 'cancelled'],
  enrollment_closed: ['enrollment_open', 'active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
}
export const canTransition = (from: GroupStatus, to: GroupStatus) => transitions[from].includes(to)
const money = z.number().int().min(0).max(1_000_000_000)
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    'Enter a valid date.',
  )
const short = z.string().trim().max(200)
export const fieldTypes = [
  'text',
  'number',
  'currency',
  'date',
  'time',
  'select',
  'multi_select',
  'checkbox',
  'radio',
  'file',
  'image',
  'textarea',
  'repeating',
] as const
export type FieldType = (typeof fieldTypes)[number]
export type FieldDefinition = {
  key: string
  label: string
  type: FieldType
  required: boolean
  category: 'reward' | 'membership'
  min?: number
  max?: number
  options?: string[]
  condition?: { key: string; equals: string | boolean }
  children?: FieldDefinition[]
}
export const fieldSchema: z.ZodType<FieldDefinition> = z.lazy(() =>
  z
    .object({
      key: z
        .string()
        .regex(/^custom_[a-z][a-z0-9_]{0,39}$/, 'Custom keys must begin with custom_.'),
      label: z.string().trim().min(1).max(100),
      type: z.enum(fieldTypes),
      required: z.boolean(),
      category: z.enum(['reward', 'membership']),
      min: z.number().min(0).max(1e9).optional(),
      max: z.number().min(0).max(1e9).optional(),
      options: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
      condition: z
        .object({
          key: z.string().regex(/^custom_[a-z][a-z0-9_]{0,39}$/),
          equals: z.union([z.string(), z.boolean()]),
        })
        .strict()
        .optional(),
      children: z.array(fieldSchema).max(10).optional(),
    })
    .strict()
    .superRefine((f, ctx) => {
      if (f.min !== undefined && f.max !== undefined && f.min > f.max)
        ctx.addIssue({ code: 'custom', message: 'Minimum must not exceed maximum.' })
      if (
        ['select', 'multi_select', 'radio'].includes(f.type) &&
        (!f.options?.length || new Set(f.options).size !== f.options.length)
      )
        ctx.addIssue({ code: 'custom', message: 'Choose unique options for this field.' })
      if (
        f.type === 'repeating' &&
        (!f.children?.length || f.children.some((c) => c.type === 'repeating'))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Repeating groups require non-repeating child fields.',
        })
      if (f.type !== 'repeating' && f.children?.length)
        ctx.addIssue({ code: 'custom', message: 'Only repeating groups may have children.' })
    }),
)
const common = {
  basic: z
    .object({
      name: z.string().trim().max(100),
      description: z.string().trim().max(2000),
      image_path: z.string().max(200),
      organization_id: z.string().uuid(),
      visibility: z.enum(['organization', 'invite_only']),
      currency: z.enum(['PHP', 'USD', 'EUR']),
      start_date: date,
    })
    .strict(),
  reward: z
    .object({
      plan_id: z.string().uuid().optional(),
      kind: z.enum(['cash', 'physical_product', 'digital_product', 'service', 'mixed', 'custom']),
      title: short,
      unit_cost_minor: money,
      quantity: z.number().int().min(1).max(1000),
      delivery_per_payout_minor: money,
      details: z.string().max(4000),
      custom_values: z.record(z.string(), z.unknown()),
    })
    .strict(),
  contribution: z
    .object({
      amount_minor: money,
      policy: z.enum(['fixed', 'configurable']),
      member_count: z.number().int().min(2).max(1000),
      round_count: z.number().int().min(1).max(1000),
      member_amounts: z
        .array(z.object({ slot: z.number().int().min(1).max(1000), amount_minor: money }).strict())
        .max(1000),
      partial_payments: z.boolean(),
      late_policy: z.enum(['flag', 'reject', 'fee']),
      late_fee_minor: money,
      late_fee_rule: z
        .object({
          mode: z.enum(['none', 'fixed', 'percentage']),
          fixed_minor: money,
          rate_basis_points: z.number().int().min(0).max(10000),
          cap_minor: money,
          review_reference: z.string().trim().max(500),
          reviewed_by: z.string().trim().max(200),
          reviewed_on: z.string().max(10),
          disclosure: z.string().trim().max(4000),
        })
        .strict()
        .optional(),
    })
    .strict(),
  schedule: z
    .object({
      frequency: z.enum([
        'daily',
        'weekly',
        'biweekly',
        'monthly',
        'custom',
        'weekdays',
        'monthly_dates',
        'custom_dates',
      ]),
      weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
      monthly_dates: z.array(z.number().int().min(1).max(31)).max(31).optional(),
      custom_dates: z.array(date).max(1000).optional(),
      every_days: z.number().int().min(1).max(365),
      start_date: date,
      cutoff_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      timezone: z.enum(['Asia/Manila', 'UTC']),
      grace_hours: z.number().int().min(0).max(168),
    })
    .strict(),
  payment: z
    .object({
      methods: z
        .array(
          z.enum(['cash', 'gcash_manual', 'maya_manual', 'bank_transfer', 'gateway', 'custom']),
        )
        .max(6),
      instructions: z.string().max(4000),
      custom_label: short,
      gateway_provider: short,
    })
    .strict(),
  distribution: z
    .object({
      rule: z.enum([
        'fixed_rotation',
        'secure_random',
        'contribution_based',
        'equal',
        'fixed_share',
      ]),
      eligibility: z.enum(['fully_paid', 'minimum_percent']),
      minimum_percent: z.number().int().min(1).max(100),
      approval_count: z.number().int().min(1).max(5),
      rotation_order: z.array(z.number().int().min(1).max(1000)).max(1000),
      fixed_shares: z
        .array(
          z
            .object({
              slot: z.number().int().min(1).max(1000),
              basis_points: z.number().int().min(1).max(10000),
            })
            .strict(),
        )
        .max(1000),
    })
    .strict(),
  membership: z
    .object({
      limit: z.number().int().min(2).max(1000),
      invitation_rule: z.enum(['organizer_only', 'members_can_request']),
      approval_required: z.boolean(),
      terms: z.string().max(10000),
      consent_required: z.boolean(),
    })
    .strict(),
  funding: z
    .object({
      disclosed_fees_minor: money,
      opening_funding_minor: money,
      opening_funding_confirmed: z.boolean(),
      funding_source: z.string().max(500),
    })
    .strict(),
  fields: z.array(fieldSchema).max(30),
}
export const rotatingSchema = z
  .object({
    ...common,
    mechanism: z.literal('rotating'),
    mechanism_options: z.object({ cycle: z.literal('one_payout_per_member') }).strict(),
  })
  .strict()
export const randomDrawSchema = z
  .object({
    ...common,
    mechanism: z.literal('random_draw'),
    mechanism_options: z
      .object({
        draw_policy: z.literal('without_replacement'),
        algorithm: z.literal('server_csprng'),
      })
      .strict(),
  })
  .strict()
export const pooledSchema = z
  .object({
    ...common,
    mechanism: z.literal('pooled_savings'),
    mechanism_options: z
      .object({ target_minor: money, distribute_at_end: z.literal(true) })
      .strict(),
  })
  .strict()
export const draftSchema = z.discriminatedUnion('mechanism', [
  rotatingSchema,
  randomDrawSchema,
  pooledSchema,
])
export type GroupConfig = z.infer<typeof draftSchema>
export const configSchema = draftSchema.superRefine((c, ctx) => {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: path.split('.'), message })
  try {
    scheduleDates(c.schedule, c.contribution.round_count)
  } catch (e) {
    issue('schedule.frequency', e instanceof Error ? e.message : 'Invalid schedule.')
  }
  const fee = c.contribution.late_fee_rule
  if (c.contribution.late_policy === 'fee' && fee && fee.mode !== 'none') {
    if (
      !fee.cap_minor ||
      (fee.mode === 'fixed' && !fee.fixed_minor) ||
      (fee.mode === 'percentage' && !fee.rate_basis_points) ||
      fee.review_reference.length < 3 ||
      fee.reviewed_by.length < 2 ||
      !date.safeParse(fee.reviewed_on).success ||
      fee.reviewed_on > new Date().toISOString().slice(0, 10) ||
      fee.disclosure.length < 20
    )
      issue(
        'contribution.late_fee_rule',
        'Disclose the fee and record its legal reviewer, review date, reference and positive cap before activation.',
      )
  }
  if (c.basic.name.length < 2) issue('basic.name', 'Enter a group name of at least two characters.')
  if (!c.reward.title) issue('reward.title', 'Describe the reward.')
  if (!c.reward.plan_id && !c.reward.unit_cost_minor)
    issue('reward.unit_cost_minor', 'A positive, disclosed reward cost is required.')
  if (!c.contribution.amount_minor)
    issue('contribution.amount_minor', 'A positive contribution is required.')
  if (c.schedule.start_date !== c.basic.start_date)
    issue('schedule.start_date', 'Contribution and group start dates must match.')
  if (c.membership.limit !== c.contribution.member_count)
    issue('membership.limit', 'Member limit must match the funding member count.')
  if (c.membership.terms.trim().length < 20)
    issue('membership.terms', 'Provide group terms (at least 20 characters).')
  if (!c.membership.consent_required)
    issue('membership.consent_required', 'Accepted rules require explicit member consent.')
  if (
    c.payment.methods.length === 0 ||
    new Set(c.payment.methods).size !== c.payment.methods.length
  )
    issue('payment.methods', 'Select unique payment methods.')
  if (c.payment.methods.includes('custom') && !c.payment.custom_label)
    issue('payment.custom_label', 'Name the organizer-defined payment option.')
  if (
    c.payment.methods.some((m) =>
      ['gcash_manual', 'maya_manual', 'bank_transfer', 'custom'].includes(m),
    ) &&
    !c.payment.instructions.trim()
  )
    issue('payment.instructions', 'Provide payment instructions.')
  if (c.payment.methods.includes('gateway'))
    issue(
      'payment.gateway_provider',
      'Integrated gateways cannot be activated until a provider integration is implemented. Use a manual method for Phase 3.',
    )
  if (c.contribution.late_policy === 'fee' && (!fee || fee.mode === 'none'))
    issue(
      'contribution.late_fee_minor',
      'Record legally reviewed, disclosed late fee terms. Late fees are excluded from expected funding.',
    )
  if (
    c.funding.opening_funding_minor > 0 &&
    (!c.funding.opening_funding_confirmed || !c.funding.funding_source.trim())
  )
    issue('funding.opening_funding_confirmed', 'Confirm the source of declared opening funding.')
  if (c.distribution.eligibility === 'minimum_percent' && !c.contribution.partial_payments)
    issue('distribution.eligibility', 'Minimum-percent eligibility requires partial payments.')
  const n = c.contribution.member_count
  if (
    c.contribution.policy === 'configurable' &&
    (c.contribution.member_amounts.length !== n ||
      new Set(c.contribution.member_amounts.map((a) => a.slot)).size !== n ||
      c.contribution.member_amounts.some(
        (a) => a.slot > n || a.amount_minor < c.contribution.amount_minor,
      ))
  )
    issue(
      'contribution.member_amounts',
      'Define every member slot once, at or above the minimum contribution.',
    )
  if (c.mechanism !== 'pooled_savings') {
    if (c.contribution.round_count !== n)
      issue(
        'contribution.round_count',
        'A complete rotating or random-draw cycle needs one round per member.',
      )
    if (c.distribution.rule !== (c.mechanism === 'rotating' ? 'fixed_rotation' : 'secure_random'))
      issue('distribution.rule', 'This distribution rule does not match the mechanism.')
  } else {
    if (!['equal', 'contribution_based', 'fixed_share'].includes(c.distribution.rule))
      issue('distribution.rule', 'Choose a pooled savings allocation rule.')
    if (c.mechanism_options.target_minor <= 0)
      issue('mechanism_options.target_minor', 'Set a positive pooled savings target.')
  }
  if (
    c.distribution.rule === 'fixed_rotation' &&
    (c.distribution.rotation_order.length !== n ||
      new Set(c.distribution.rotation_order).size !== n ||
      c.distribution.rotation_order.some((s) => s > n))
  )
    issue('distribution.rotation_order', 'Provide every member slot exactly once.')
  if (
    c.distribution.rule === 'fixed_share' &&
    (c.distribution.fixed_shares.length !== n ||
      new Set(c.distribution.fixed_shares.map((s) => s.slot)).size !== n ||
      c.distribution.fixed_shares.some((s) => s.slot > n) ||
      c.distribution.fixed_shares.reduce((s, a) => s + a.basis_points, 0) !== 10000)
  )
    issue(
      'distribution.fixed_shares',
      'Shares must cover every slot once and total 10,000 basis points (100%).',
    )
  const keys = new Set<string>()
  for (const f of c.fields) {
    for (const x of [f, ...(f.children ?? [])]) {
      if (keys.has(x.key)) issue('fields', 'Custom field keys must be unique.')
      keys.add(x.key)
    }
    if (
      f.condition &&
      !c.fields.some(
        (x) =>
          x.key === f.condition!.key &&
          x.category === f.category &&
          x.key !== f.key &&
          !x.condition,
      )
    )
      issue('fields', 'Conditions must reference an unconditional field in the same category.')
  }
  for (const error of validateDynamic(
    c.fields.filter((f) => f.category === 'reward'),
    c.reward.custom_values,
  ))
    issue('reward.custom_values', error)
})
export function validateDynamic(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  prefix = '',
): string[] {
  const errors: string[] = []
  for (const f of fields) {
    if (f.condition && values[f.condition.key] !== f.condition.equals) continue
    const v = values[f.key]
    const label = prefix + f.label
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    if (empty) {
      if (f.required) errors.push(`${label} is required.`)
      continue
    }
    if (f.type === 'checkbox') {
      if (typeof v !== 'boolean' || (f.required && !v)) errors.push(`${label} must be accepted.`)
    } else if (['number', 'currency'].includes(f.type)) {
      if (
        typeof v !== 'number' ||
        !Number.isFinite(v) ||
        (f.type === 'currency' && !Number.isInteger(v)) ||
        (f.min !== undefined && v < f.min) ||
        (f.max !== undefined && v > f.max)
      )
        errors.push(`${label} is outside its numeric limits.`)
    } else if (f.type === 'multi_select') {
      if (
        !Array.isArray(v) ||
        v.some((x) => typeof x !== 'string' || !f.options?.includes(x)) ||
        new Set(v).size !== v.length ||
        (f.min !== undefined && v.length < f.min) ||
        (f.max !== undefined && v.length > f.max)
      )
        errors.push(`${label} contains invalid selections.`)
    } else if (f.type === 'repeating') {
      if (!Array.isArray(v) || v.length > (f.max ?? 20) || v.length < (f.min ?? 0))
        errors.push(`${label} has an invalid row count.`)
      else
        for (const row of v) {
          if (!row || typeof row !== 'object' || Array.isArray(row))
            errors.push(`${label} has an invalid row.`)
          else
            errors.push(
              ...validateDynamic(f.children ?? [], row as Record<string, unknown>, label + ' / '),
            )
        }
    } else if (
      typeof v !== 'string' ||
      v.length > (f.max ?? 4000) ||
      (f.min !== undefined && v.length < f.min)
    )
      errors.push(`${label} is invalid.`)
    else if (['select', 'radio'].includes(f.type) && !f.options?.includes(v))
      errors.push(`${label} has an invalid choice.`)
    else if (f.type === 'date' && !date.safeParse(v).success)
      errors.push(`${label} needs a valid date.`)
    else if (f.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
      errors.push(`${label} needs a valid time.`)
    else if (
      ['file', 'image'].includes(f.type) &&
      !/^\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(pdf|txt|png|jpg|jpeg|webp)$/.test('/' + v)
    )
      errors.push(`${label} needs an uploaded file.`)
    else if (f.type === 'image' && !/\.(png|jpg|jpeg|webp)$/.test(v))
      errors.push(`${label} needs an uploaded image.`)
  }
  if (Object.keys(values).some((k) => !fields.some((f) => f.key === k)))
    errors.push('Unknown custom field values are not allowed.')
  return errors
}
export function defaultConfig(organizationId: string): GroupConfig {
  const start = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  return {
    mechanism: 'rotating',
    mechanism_options: { cycle: 'one_payout_per_member' },
    basic: {
      name: '',
      description: '',
      image_path: '',
      organization_id: organizationId,
      visibility: 'invite_only',
      currency: 'PHP',
      start_date: start,
    },
    reward: {
      kind: 'cash',
      title: 'Cash payout',
      unit_cost_minor: 0,
      quantity: 1,
      delivery_per_payout_minor: 0,
      details: '',
      custom_values: {},
    },
    contribution: {
      amount_minor: 0,
      policy: 'fixed',
      member_count: 2,
      round_count: 2,
      member_amounts: [],
      partial_payments: false,
      late_policy: 'flag',
      late_fee_minor: 0,
    },
    schedule: {
      frequency: 'monthly',
      every_days: 30,
      start_date: start,
      cutoff_time: '17:00',
      timezone: 'Asia/Manila',
      grace_hours: 0,
    },
    payment: { methods: ['cash'], instructions: '', custom_label: '', gateway_provider: '' },
    distribution: {
      rule: 'fixed_rotation',
      eligibility: 'fully_paid',
      minimum_percent: 100,
      approval_count: 1,
      rotation_order: [1, 2],
      fixed_shares: [],
    },
    membership: {
      limit: 2,
      invitation_rule: 'organizer_only',
      approval_required: true,
      terms: '',
      consent_required: true,
    },
    funding: {
      disclosed_fees_minor: 0,
      opening_funding_minor: 0,
      opening_funding_confirmed: false,
      funding_source: '',
    },
    fields: [],
  }
}
