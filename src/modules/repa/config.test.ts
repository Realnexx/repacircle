import { defaultConfig, configSchema, canTransition, validateDynamic } from './config'
import { allocationPreview, calculateFunding, schedulePreview, changeDiff } from './calculations'
import { describe, expect, it } from 'vitest'
export function validConfig() {
  const c = defaultConfig('10000000-0000-4000-8000-000000000001')
  c.basic.name = 'Community circle'
  c.basic.start_date = '2030-01-31'
  c.schedule.start_date = '2030-01-31'
  c.contribution.amount_minor = 10000
  c.reward.unit_cost_minor = 20000
  c.membership.terms = 'Every member agrees to the disclosed rules and schedule.'
  return c
}
describe('REPA configuration and exact funding', () => {
  it('validates all three mechanism schemas and matching distribution rules', () => {
    const c = validConfig()
    expect(configSchema.safeParse(c).success).toBe(true)
    expect(
      configSchema.safeParse({
        ...c,
        mechanism: 'random_draw',
        mechanism_options: { draw_policy: 'without_replacement', algorithm: 'server_csprng' },
        distribution: { ...c.distribution, rule: 'secure_random' },
      }).success,
    ).toBe(true)
    expect(
      configSchema.safeParse({
        ...c,
        mechanism: 'pooled_savings',
        mechanism_options: { target_minor: 40000, distribute_at_end: true },
        distribution: { ...c.distribution, rule: 'equal' },
      }).success,
    ).toBe(true)
    expect(
      configSchema.safeParse({ ...c, distribution: { ...c.distribution, rule: 'secure_random' } })
        .success,
    ).toBe(false)
  })
  it('calculates collections, quantities, delivery, fees and shortfalls', () => {
    const c = validConfig()
    expect(calculateFunding(c)).toMatchObject({
      valid: true,
      expected_collections_minor: 40000,
      reward_costs_minor: 40000,
      payouts: 2,
      shortfall_minor: 0,
    })
    c.reward.delivery_per_payout_minor = 100
    c.funding.disclosed_fees_minor = 200
    expect(calculateFunding(c)).toMatchObject({
      valid: false,
      shortfall_minor: 400,
      delivery_costs_minor: 200,
    })
    c.funding.opening_funding_minor = 400
    c.funding.opening_funding_confirmed = true
    c.funding.funding_source = 'Disclosed organizer subsidy'
    expect(calculateFunding(c).valid).toBe(true)
  })
  it('blocks per-round liquidity gaps even with a positive final balance', () => {
    const c = validConfig()
    c.contribution.member_count = 3
    c.contribution.round_count = 3
    c.membership.limit = 3
    c.distribution.rotation_order = [1, 2, 3]
    c.contribution.policy = 'configurable'
    c.contribution.member_amounts = [
      { slot: 1, amount_minor: 10000 },
      { slot: 2, amount_minor: 10000 },
      { slot: 3, amount_minor: 10000 },
    ]
    c.reward.unit_cost_minor = 29000
    c.funding.disclosed_fees_minor = 2000
    expect(calculateFunding(c)).toMatchObject({
      shortfall_minor: 0,
      liquidity_shortfall_minor: 1000,
      valid: false,
    })
  })
  it('clamps monthly schedules without drifting and converts cutoff/grace to UTC', () => {
    const c = validConfig()
    c.contribution.round_count = 3
    c.schedule.grace_hours = 2
    expect(schedulePreview(c).map((r) => r.date)).toEqual([
      '2030-01-31',
      '2030-02-28',
      '2030-03-31',
    ])
    expect(schedulePreview(c)[0]).toMatchObject({
      cutoff_at: '2030-01-31T09:00:00.000Z',
      grace_ends_at: '2030-01-31T11:00:00.000Z',
    })
  })
  it('rejects protected custom keys and validates conditional and repeating values', () => {
    const c = validConfig()
    expect(
      configSchema.safeParse({
        ...c,
        fields: [
          {
            key: 'amount_minor',
            label: 'Override',
            type: 'number',
            required: false,
            category: 'reward',
          },
        ],
      }).success,
    ).toBe(false)
    const fields = [
      {
        key: 'custom_accept',
        label: 'Accept',
        type: 'checkbox' as const,
        required: true,
        category: 'membership' as const,
      },
      {
        key: 'custom_note',
        label: 'Note',
        type: 'text' as const,
        required: true,
        category: 'membership' as const,
        condition: { key: 'custom_accept', equals: true },
      },
    ]
    expect(validateDynamic(fields, { custom_accept: true })).toEqual(['Note is required.'])
    expect(validateDynamic(fields, { custom_accept: false })).toEqual(['Accept must be accepted.'])
  })
  it('requires complete configurable amounts and 100% fixed shares', () => {
    const c = validConfig()
    c.contribution.policy = 'configurable'
    expect(configSchema.safeParse(c).success).toBe(false)
    c.contribution.member_amounts = [
      { slot: 1, amount_minor: 10000 },
      { slot: 2, amount_minor: 11000 },
    ]
    expect(configSchema.safeParse(c).success).toBe(true)
  })
  it('blocks unavailable integrated gateways and missing source confirmation', () => {
    const c = validConfig()
    c.payment.methods = ['gateway']
    expect(configSchema.safeParse(c).success).toBe(false)
    c.payment.methods = ['cash']
    c.funding.opening_funding_minor = 1
    expect(configSchema.safeParse(c).success).toBe(false)
  })
  it('permits only defined state transitions and records old/new values', () => {
    expect(canTransition('draft', 'active')).toBe(true)
    expect(canTransition('archived', 'active')).toBe(false)
    expect(canTransition('active', 'draft')).toBe(false)
    expect(
      changeDiff({ contribution: { amount_minor: 100 } }, { contribution: { amount_minor: 200 } }),
    ).toEqual([{ path: 'contribution.amount_minor', previous: 100, next: 200 }])
  })
  it('preserves pooled cash totals across fixed shares and contribution weights', () => {
    const base = validConfig()
    const c = {
      ...base,
      mechanism: 'pooled_savings' as const,
      mechanism_options: { target_minor: 40000, distribute_at_end: true as const },
      distribution: {
        ...base.distribution,
        rule: 'fixed_share' as const,
        fixed_shares: [
          { slot: 1, basis_points: 3333 },
          { slot: 2, basis_points: 6667 },
        ],
      },
    }
    expect(allocationPreview(c).map((r) => r.reward_value_minor)).toEqual([13332, 26668])
    const weighted = {
      ...c,
      contribution: {
        ...c.contribution,
        policy: 'configurable' as const,
        member_amounts: [
          { slot: 1, amount_minor: 10000 },
          { slot: 2, amount_minor: 30000 },
        ],
      },
      distribution: { ...c.distribution, rule: 'contribution_based' as const },
    }
    expect(allocationPreview(weighted).map((r) => r.reward_value_minor)).toEqual([10000, 30000])
  })
  it('allocates indivisible products by largest remainder with stable slot ties', () => {
    const base = validConfig()
    const c = {
      ...base,
      mechanism: 'pooled_savings' as const,
      mechanism_options: { target_minor: 40000, distribute_at_end: true as const },
      reward: { ...base.reward, kind: 'physical_product' as const },
      distribution: {
        ...base.distribution,
        rule: 'fixed_share' as const,
        fixed_shares: [
          { slot: 1, basis_points: 2500 },
          { slot: 2, basis_points: 7500 },
        ],
      },
    }
    expect(allocationPreview(c).map((r) => r.reward_units)).toEqual([1, 1])
    expect(allocationPreview(c).reduce((sum, r) => sum + r.reward_value_minor, 0)).toBe(40000)
  })
  it('rejects documents as custom image values', () => {
    const fields = [
      {
        key: 'custom_photo',
        label: 'Photo',
        type: 'image' as const,
        required: true,
        category: 'membership' as const,
      },
    ]
    const prefix =
      '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001'
    expect(validateDynamic(fields, { custom_photo: prefix + '.pdf' })).toContain(
      'Photo needs an uploaded image.',
    )
    expect(validateDynamic(fields, { custom_photo: prefix + '.png' })).toEqual([])
  })
})
