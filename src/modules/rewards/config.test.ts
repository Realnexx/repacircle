import { describe, expect, it } from 'vitest'
import { defaultConfig } from '@/modules/repa/config'
import { calculateFunding, schedulePreview } from '@/modules/repa/calculations'
import {
  defaultReward,
  rewardInputSchema,
  publishErrors,
  rewardPricing,
  exactMoney,
  rewardKinds,
  type RewardInput,
  type DistributionLine,
} from './config'
import { planMatches, previewPlan, planAllocations, splitExact } from './pricing'
import type { CatalogItem } from './service'
const uuid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function reward(kind: RewardInput['kind'] = 'physical_product'): RewardInput {
  return {
    ...defaultReward(),
    name: 'Community reward',
    kind,
    category_id: uuid(1),
    estimated_unit_minor: 101,
    delivery_method: 'Verified fulfillment',
    cash_transfer_method: 'Verified transfer',
  }
}
function item(v = reward(), n = 2): CatalogItem {
  return {
    id: uuid(n + 100),
    name: v.name,
    kind: v.kind,
    category_id: v.category_id,
    category_name: 'Server-defined category',
    currency: v.currency,
    status: 'published',
    revision: 1,
    current_version_id: uuid(n),
    configuration: v,
    pricing: rewardPricing(v),
  }
}
function config() {
  const c = defaultConfig(uuid(1))
  c.basic.name = 'Test group'
  c.basic.start_date = '2030-01-01'
  c.schedule.start_date = '2030-01-01'
  c.membership.terms = 'All members accept the disclosed terms and schedules.'
  c.contribution.amount_minor = 100
  c.reward.unit_cost_minor = 100
  return c
}
describe('dynamic catalog and exact pricing', () => {
  for (const k of rewardKinds.filter((k) => k !== 'mixed'))
    it(`validates ${k} without frontend category assumptions`, () => {
      const r = reward(k)
      expect(rewardInputSchema.safeParse(r).success).toBe(true)
      expect(publishErrors(r)).toEqual([])
    })
  it('keeps estimates, actual costs, delivery and expenses exact', () => {
    const r = {
      ...reward(),
      estimated_unit_minor: 101,
      actual_unit_minor: 103,
      quantity: 3,
      shipping_fee_minor: 7,
      expenses: [{ label: 'Handling', amount_minor: 11 }],
    }
    expect(rewardPricing(r)).toMatchObject({
      estimated_minor: '321',
      actual_minor: '327',
      required_minor: '327',
      funding_difference_minor: '6',
      delivery_minor: '7',
      additional_minor: '11',
      physical_quantity: '3',
    })
    expect(exactMoney('-100001', 'PHP')).toBe('PHP -1,000.01')
  })
  it('aggregates mixed component fees and quantities without inventing actual prices', () => {
    const a = rewardPricing({ ...reward(), shipping_fee_minor: 7, quantity: 2 })
    const b = rewardPricing(reward('cash'))
    const r = {
      ...reward('mixed'),
      estimated_unit_minor: 0,
      actual_unit_minor: null,
      quantity: 3,
      components: [
        { version_id: uuid(2), quantity: 2 },
        { version_id: uuid(3), quantity: 1 },
      ],
      shipping_fee_minor: 5,
    }
    const p = rewardPricing(
      r,
      new Map([
        [uuid(2), a],
        [uuid(3), b],
      ]),
    )
    expect(p.required_minor).toBe('1562')
    expect(p.actual_minor).toBeNull()
    expect(p.delivery_minor).toBe('47')
    expect(p.physical_quantity).toBe('12')
    expect(p.unit_quantity).toBe('15')
    expect(rewardInputSchema.safeParse(r).success).toBe(true)
  })
  it('requires resolved published components and caps complete bundle cost', () => {
    expect(
      rewardPricing({ ...reward('mixed'), components: [{ version_id: uuid(2), quantity: 1 }] })
        .errors.length,
    ).toBe(1)
    expect(publishErrors({ ...reward('mixed'), components: [] })).toContain(
      'Mixed rewards require at least two different published components.',
    )
    expect(
      rewardPricing({
        ...reward(),
        estimated_unit_minor: 1e9,
        quantity: 1000,
        shipping_fee_minor: 1,
      }).errors.length,
    ).toBe(1)
  })
  it('protects financial names, unknown fields, integer prices and mixed derived costs', () => {
    expect(rewardInputSchema.safeParse({ ...reward(), estimated_unit_minor: 1.2 }).success).toBe(
      false,
    )
    expect(rewardInputSchema.safeParse({ ...reward(), organization_id: uuid(1) }).success).toBe(
      false,
    )
    expect(rewardInputSchema.safeParse(reward('mixed')).success).toBe(false)
    expect(
      rewardInputSchema.safeParse({
        ...reward(),
        attributes: [
          {
            definition: {
              key: 'amount_minor',
              label: 'Override',
              category: 'reward',
              type: 'number',
              required: false,
            },
            applies_to: ['cash'],
          },
        ],
      }).success,
    ).toBe(false)
  })
  it('validates conditional attributes only for applicable types', () => {
    const r = reward()
    r.attributes = [
      {
        definition: {
          key: 'custom_deliver',
          label: 'Delivery included',
          category: 'reward',
          type: 'checkbox',
          required: false,
        },
        applies_to: ['physical_product'],
      },
      {
        definition: {
          key: 'custom_address',
          label: 'Delivery address',
          category: 'reward',
          type: 'text',
          required: true,
          condition: { key: 'custom_deliver', equals: true },
        },
        applies_to: ['physical_product'],
      },
    ]
    expect(publishErrors(r)).toEqual([])
    r.values.custom_deliver = true
    expect(publishErrors(r).join(' ')).toContain('Delivery address')
    r.kind = 'cash'
    expect(publishErrors(r)).toEqual([])
  })
  it('cash cannot quietly change its payout amount or hide shipping fees', () => {
    expect(
      publishErrors({ ...reward('cash'), actual_unit_minor: 99, shipping_fee_minor: 1 }),
    ).toHaveLength(2)
  })
})
describe('group reward allocations and funding', () => {
  const line = (version_id = uuid(2)): DistributionLine => ({
    version_id,
    scope: 'each_payout',
    round_number: null,
    quantity: 1,
  })
  it('supports different and multiple rewards per round with exact schedule costs', () => {
    const c = config(),
      a = item(),
      b = item(reward('cash'), 3)
    const p = previewPlan(
      c,
      [
        { ...line(), scope: 'round', round_number: 1 },
        { ...line(uuid(3)), scope: 'round', round_number: 2, quantity: 2 },
      ],
      new Map([
        [uuid(2), a],
        [uuid(3), b],
      ]),
      'Round plan',
    )
    c.reward.plan_id = p.plan_id
    expect(p.required_minor).toBe('303')
    expect(p.product_quantity).toBe('1')
    expect(calculateFunding(c, p).valid).toBe(true)
    expect(schedulePreview(c, p).map((r) => r.projected_balance_minor)).toEqual([99, 97])
    expect(planAllocations(c, p).map((r) => r.slot)).toEqual([1, 2])
  })
  it('blocks missing rounds, duplicate lines, stale contexts and wrong currency', () => {
    const c = config(),
      i = item()
    const p = previewPlan(
      c,
      [{ ...line(), scope: 'round', round_number: 1 }],
      new Map([[uuid(2), i]]),
      'Missing',
    )
    expect(p.errors.join(' ')).toContain('Round 2')
    expect(
      previewPlan(c, [line(), line()], new Map([[uuid(2), i]]), 'Dup').errors.join(' '),
    ).toContain('duplicate')
    expect(
      previewPlan(
        c,
        [line()],
        new Map([[uuid(2), item({ ...reward(), currency: 'USD' })]]),
        'Wrong',
      ).errors.join(' '),
    ).toContain('currency')
    c.reward.plan_id = p.plan_id
    expect(planMatches(c, p)).toBe(true)
    c.distribution.rotation_order = [2, 1]
    expect(planMatches(c, p)).toBe(false)
    expect(calculateFunding(c, p).valid).toBe(false)
    expect(calculateFunding(c).valid).toBe(false)
  })
  it('blocks early liquidity shortfalls even when the cycle total balances', () => {
    const c = config(),
      i = item({ ...reward(), estimated_unit_minor: 300 })
    const p = previewPlan(
      c,
      [
        { ...line(), scope: 'round', round_number: 1 },
        { ...line(), scope: 'round', round_number: 2, quantity: 1 },
      ],
      new Map([[uuid(2), i]]),
      'Expensive first',
    )
    c.reward.plan_id = p.plan_id
    c.contribution.amount_minor = 150
    expect(calculateFunding(c, p).valid).toBe(true)
    c.contribution.policy = 'configurable'
    c.contribution.amount_minor = 100
    c.contribution.member_amounts = [
      { slot: 1, amount_minor: 100 },
      { slot: 2, amount_minor: 100 },
    ]
    const q = previewPlan(
      c,
      [
        { ...line(), scope: 'round', round_number: 1 },
        { ...line(uuid(3)), scope: 'round', round_number: 2 },
      ],
      new Map([
        [uuid(2), i],
        [uuid(3), item({ ...reward('cash'), estimated_unit_minor: 100 }, 3)],
      ]),
      'Early',
    )
    c.reward.plan_id = q.plan_id
    expect(calculateFunding(c, q)).toMatchObject({
      shortfall_minor: 0,
      liquidity_shortfall_minor: 100,
      valid: false,
    })
  })
  it('pooled weighted products remain whole bundles and cash rounds exactly', () => {
    const c = config()
    c.mechanism = 'pooled_savings'
    c.mechanism_options = { target_minor: 1, distribute_at_end: true }
    c.distribution.rule = 'fixed_share'
    c.distribution.fixed_shares = [
      { slot: 1, basis_points: 7500 },
      { slot: 2, basis_points: 2500 },
    ]
    const p = previewPlan(
      c,
      [line()],
      new Map([[uuid(2), item({ ...reward(), quantity: 2 })]]),
      'Pool',
    )
    const rows = planAllocations(c, p)
    expect(rows.map((r) => r.units)).toEqual(['4', '0'])
    expect(rows.map((r) => r.value_minor)).toEqual(['404', '0'])
    expect(p.errors.join(' ')).toContain('positive reward')
    expect(splitExact(101n, [1n, 1n])).toEqual(['51', '50'])
    expect(splitExact(999999999999999n, [7n, 2n, 1n]).reduce((s, v) => s + BigInt(v), 0n)).toBe(
      999999999999999n,
    )
  })
})
