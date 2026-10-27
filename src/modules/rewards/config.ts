import { z } from 'zod'
import { fieldSchema, validateDynamic, type FieldDefinition } from '@/modules/repa/config'
export const rewardKinds = [
  'cash',
  'physical_product',
  'digital_product',
  'service',
  'mixed',
  'custom',
] as const
export type RewardKind = (typeof rewardKinds)[number]
export const kindLabel = (kind: string) =>
  kind.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const money = z.number().int().min(0).max(1_000_000_000)
export const attributeSchema = z
  .object({ definition: fieldSchema, applies_to: z.array(z.enum(rewardKinds)).min(1).max(6) })
  .strict()
export type RewardAttribute = z.infer<typeof attributeSchema>
export const rewardInputSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    kind: z.enum(rewardKinds),
    category_id: z.string().uuid().nullable(),
    description: z.string().trim().max(4000),
    brand: z.string().trim().max(120),
    model: z.string().trim().max(120),
    sku: z.string().trim().max(100),
    currency: z.enum(['PHP', 'USD', 'EUR']),
    estimated_unit_minor: money,
    actual_unit_minor: money.nullable(),
    quantity: z.number().int().min(1).max(1000),
    supplier: z.string().trim().max(250),
    warranty: z.string().trim().max(2000),
    delivery_method: z.string().trim().max(1000),
    cash_transfer_method: z.string().trim().max(200),
    shipping_fee_minor: money,
    expenses: z
      .array(z.object({ label: z.string().trim().min(1).max(150), amount_minor: money }).strict())
      .max(20),
    attributes: z.array(attributeSchema).max(30),
    values: z.record(z.string(), z.unknown()),
    images: z
      .array(
        z
          .object({
            path: z
              .string()
              .regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/),
            alt: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(10),
    components: z
      .array(
        z
          .object({ version_id: z.string().uuid(), quantity: z.number().int().min(1).max(100) })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    const keys = new Set<string>()
    for (const attr of v.attributes) {
      if (new Set(attr.applies_to).size !== attr.applies_to.length)
        ctx.addIssue({
          code: 'custom',
          path: ['attributes'],
          message: 'Attribute reward types must be unique.',
        })
      for (const f of [attr.definition, ...(attr.definition.children ?? [])]) {
        if (keys.has(f.key) || f.category !== 'reward')
          ctx.addIssue({
            code: 'custom',
            path: ['attributes'],
            message: 'Use unique reward attribute keys.',
          })
        keys.add(f.key)
      }
      if (
        attr.definition.condition &&
        !v.attributes.some(
          (a) => a.definition.key === attr.definition.condition!.key && !a.definition.condition,
        )
      )
        ctx.addIssue({
          code: 'custom',
          path: ['attributes'],
          message: 'Conditions require an unconditional peer attribute.',
        })
    }
    if (new Set(v.components.map((c) => c.version_id)).size !== v.components.length)
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Add a component once and adjust its quantity.',
      })
    if (v.kind !== 'mixed' && v.components.length)
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Only mixed rewards can have components.',
      })
    if (v.kind === 'mixed' && (v.estimated_unit_minor !== 0 || v.actual_unit_minor !== null))
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Mixed prices are derived from component versions.',
      })
  })
export type RewardInput = z.infer<typeof rewardInputSchema>
export function applicableAttributes(v: RewardInput): FieldDefinition[] {
  return v.attributes.filter((a) => a.applies_to.includes(v.kind)).map((a) => a.definition)
}
export function publishErrors(v: RewardInput): string[] {
  const errors: string[] = []
  if (!v.category_id) errors.push('Choose a category from the catalog.')
  if (v.kind === 'mixed' && v.components.length < 2)
    errors.push('Mixed rewards require at least two different published components.')
  if (v.kind !== 'mixed' && v.estimated_unit_minor <= 0)
    errors.push('Enter a positive estimated value or cash payout amount.')
  if (v.kind === 'cash') {
    if (!v.cash_transfer_method.trim()) errors.push('Describe the cash transfer method.')
    if (v.shipping_fee_minor)
      errors.push(
        'Cash rewards cannot have shipping fees; disclose transfer fees as additional expenses.',
      )
    if (v.actual_unit_minor !== null && v.actual_unit_minor !== v.estimated_unit_minor)
      errors.push('A cash reward’s declared amount must match its actual payout amount.')
  } else if (!v.delivery_method.trim())
    errors.push('Describe how this reward will be delivered or fulfilled.')
  const defs = applicableAttributes(v)
  if (Object.keys(v.values).some((k) => !v.attributes.some((a) => a.definition.key === k)))
    errors.push('Unknown custom field values are not allowed.')
  return [
    ...errors,
    ...validateDynamic(
      defs,
      Object.fromEntries(Object.entries(v.values).filter(([k]) => defs.some((f) => f.key === k))),
    ),
  ]
}
export function defaultReward(): RewardInput {
  return {
    name: 'Untitled reward',
    kind: 'physical_product',
    category_id: null,
    description: '',
    brand: '',
    model: '',
    sku: '',
    currency: 'PHP',
    estimated_unit_minor: 0,
    actual_unit_minor: null,
    quantity: 1,
    supplier: '',
    warranty: '',
    delivery_method: '',
    cash_transfer_method: '',
    shipping_fee_minor: 0,
    expenses: [],
    attributes: [],
    values: {},
    images: [],
    components: [],
  }
}
export type PriceSummary = {
  estimated_minor: string
  actual_minor: string | null
  delivery_minor: string
  additional_minor: string
  required_minor: string
  funding_difference_minor: string | null
  unit_quantity: string
  physical_quantity: string
  errors: string[]
}
export function rewardPricing(
  v: RewardInput,
  components: Map<string, PriceSummary> = new Map(),
): PriceSummary {
  let estimate = BigInt(v.estimated_unit_minor) * BigInt(v.quantity)
  let actual =
    v.actual_unit_minor === null ? null : BigInt(v.actual_unit_minor) * BigInt(v.quantity)
  let required = estimate >= (actual ?? 0n) ? estimate : actual!
  const errors: string[] = []
  let childDelivery = 0n,
    childExtra = 0n,
    units = BigInt(v.quantity),
    physical = v.kind === 'physical_product' ? units : 0n
  if (v.kind === 'mixed') {
    estimate = 0n
    actual = 0n
    required = 0n
    units = 0n
    physical = 0n
    for (const c of v.components) {
      const p = components.get(c.version_id)
      if (!p) {
        errors.push('Load each component’s published pricing.')
        actual = null
        continue
      }
      const qty = BigInt(c.quantity) * BigInt(v.quantity)
      estimate += BigInt(p.estimated_minor) * qty
      required += BigInt(p.required_minor) * qty
      childDelivery += BigInt(p.delivery_minor) * qty
      childExtra += BigInt(p.additional_minor) * qty
      units += BigInt(p.unit_quantity) * qty
      physical += BigInt(p.physical_quantity) * qty
      if (p.actual_minor === null) actual = null
      else if (actual !== null) actual += BigInt(p.actual_minor) * qty
    }
  }
  const delivery = BigInt(v.shipping_fee_minor),
    extra = v.expenses.reduce((s, e) => s + BigInt(e.amount_minor), 0n)
  estimate += delivery + extra
  required += delivery + extra
  if (actual !== null) actual += delivery + extra
  if (required > 1_000_000_000_000n)
    errors.push('One reward bundle must cost no more than 1,000,000,000,000 minor units.')
  return {
    estimated_minor: estimate.toString(),
    actual_minor: actual?.toString() ?? null,
    delivery_minor: (delivery + childDelivery).toString(),
    additional_minor: (extra + childExtra).toString(),
    required_minor: required.toString(),
    funding_difference_minor: actual === null ? null : (actual - estimate).toString(),
    unit_quantity: units.toString(),
    physical_quantity: physical.toString(),
    errors,
  }
}
export function exactMoney(value: string | number | bigint, currency = 'PHP') {
  const amount = BigInt(value),
    abs = amount < 0n ? -amount : amount
  return `${currency} ${amount < 0n ? '-' : ''}${(abs / 100n).toLocaleString('en-PH')}.${(abs % 100n).toString().padStart(2, '0')}`
}
export const distributionLineSchema = z
  .object({
    version_id: z.string().uuid(),
    scope: z.enum(['each_payout', 'round']),
    round_number: z.number().int().min(1).max(1000).nullable(),
    quantity: z.number().int().min(1).max(1000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.scope === 'each_payout' && v.round_number !== null) ||
      (v.scope === 'round' && v.round_number === null)
    )
      ctx.addIssue({ code: 'custom', message: 'Choose a round only for round-specific rewards.' })
  })
export type DistributionLine = z.infer<typeof distributionLineSchema>
export type PlanCosts = {
  plan_id: string
  name: string
  currency: string
  context: Record<string, unknown>
  estimated_minor: string
  actual_minor: string | null
  required_minor: string
  delivery_minor: string
  additional_minor: string
  product_quantity: string
  rounds: {
    round: number
    required_minor: string
    estimated_minor: string
    actual_minor: string | null
    quantity: string
    payout_count: number
  }[]
  errors: string[]
  lines: PlanLine[]
}
export type RewardComponent = {
  version_id: string
  item_id: string
  name: string
  kind: RewardKind
  quantity: number
  configuration: RewardInput
  pricing: PriceSummary
}
export type PlanLine = DistributionLine & {
  components?: RewardComponent[]
  name: string
  kind: RewardKind
  configuration: RewardInput
  pricing: PriceSummary
  item_id: string
}
