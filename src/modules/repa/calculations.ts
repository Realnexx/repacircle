import { configSchema, type GroupConfig } from './config'
export type FundingResult = {
  expected_collections_minor: number
  reward_costs_minor: number
  delivery_costs_minor: number
  disclosed_fees_minor: number
  available_funding_minor: number
  required_funding_minor: number
  shortfall_minor: number
  liquidity_shortfall_minor: number
  payouts: number
  product_quantity: number
  errors: string[]
  valid: boolean
}
export function schedulePreview(c: GroupConfig) {
  const anchor = new Date(c.schedule.start_date + 'T00:00:00Z')
  const rows = []
  const perRound =
    c.contribution.policy === 'fixed'
      ? c.contribution.amount_minor * c.contribution.member_count
      : c.contribution.member_amounts.reduce((s, a) => s + a.amount_minor, 0)
  let balance = c.funding.opening_funding_minor - c.funding.disclosed_fees_minor
  const payout = c.reward.unit_cost_minor * c.reward.quantity + c.reward.delivery_per_payout_minor
  for (let i = 0; i < c.contribution.round_count; i++) {
    let due: Date
    if (c.schedule.frequency === 'monthly') {
      due = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + i, 1))
      const last = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate()
      due.setUTCDate(Math.min(anchor.getUTCDate(), last))
    } else {
      const days =
        { daily: 1, weekly: 7, biweekly: 14, custom: c.schedule.every_days }[
          c.schedule.frequency
        ] ?? 1
      due = new Date(anchor.getTime() + i * days * 86400000)
    }
    const date = due.toISOString().slice(0, 10)
    const cutoff = new Date(
      `${date}T${c.schedule.cutoff_time}:00${c.schedule.timezone === 'UTC' ? 'Z' : '+08:00'}`,
    )
    const payouts =
      c.mechanism === 'pooled_savings'
        ? i === c.contribution.round_count - 1
          ? c.contribution.member_count
          : 0
        : 1
    balance += perRound - payout * payouts
    rows.push({
      round: i + 1,
      date,
      cutoff_at: cutoff.toISOString(),
      grace_ends_at: new Date(cutoff.getTime() + c.schedule.grace_hours * 3600000).toISOString(),
      collections_minor: perRound,
      payout_count: payouts,
      projected_balance_minor: balance,
    })
  }
  return rows
}
export function calculateFunding(input: unknown): FundingResult {
  const parsed = configSchema.safeParse(input)
  const empty = {
    expected_collections_minor: 0,
    reward_costs_minor: 0,
    delivery_costs_minor: 0,
    disclosed_fees_minor: 0,
    available_funding_minor: 0,
    required_funding_minor: 0,
    shortfall_minor: 0,
    liquidity_shortfall_minor: 0,
    payouts: 0,
    product_quantity: 0,
  }
  if (!parsed.success)
    return {
      ...empty,
      valid: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }
  const c = parsed.data
  const schedule = schedulePreview(c)
  const payouts =
    c.mechanism === 'pooled_savings' ? c.contribution.member_count : c.contribution.round_count
  const expected = schedule.reduce((s, r) => s + r.collections_minor, 0)
  const rewards = c.reward.unit_cost_minor * c.reward.quantity * payouts
  const delivery = c.reward.delivery_per_payout_minor * payouts
  const fees = c.funding.disclosed_fees_minor
  const available = expected + c.funding.opening_funding_minor
  const target = c.mechanism === 'pooled_savings' ? c.mechanism_options.target_minor : 0
  const required = Math.max(rewards + delivery + fees, target)
  const shortfall = Math.max(0, required - available)
  const liquidity = Math.max(0, ...schedule.map((r) => -r.projected_balance_minor))
  const errors = []
  if (shortfall)
    errors.push(
      'Expected collections and declared opening funding do not cover the required funding.',
    )
  if (liquidity)
    errors.push('At least one round has an unfunded payout, even if the total cycle balances.')
  return {
    expected_collections_minor: expected,
    reward_costs_minor: rewards,
    delivery_costs_minor: delivery,
    disclosed_fees_minor: fees,
    available_funding_minor: available,
    required_funding_minor: required,
    shortfall_minor: shortfall,
    liquidity_shortfall_minor: liquidity,
    payouts,
    product_quantity: c.reward.quantity * payouts,
    valid: errors.length === 0,
    errors,
  }
}
export function changeDiff(
  previous: unknown,
  next: unknown,
  path = '',
): { path: string; previous: unknown; next: unknown }[] {
  if (JSON.stringify(previous) === JSON.stringify(next)) return []
  if (
    previous &&
    next &&
    typeof previous === 'object' &&
    typeof next === 'object' &&
    !Array.isArray(previous) &&
    !Array.isArray(next)
  )
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])].flatMap((k) =>
      changeDiff(
        (previous as Record<string, unknown>)[k],
        (next as Record<string, unknown>)[k],
        path ? path + '.' + k : k,
      ),
    )
  return [{ path, previous: previous ?? null, next: next ?? null }]
}
export function allocationPreview(c: GroupConfig) {
  if (c.mechanism !== 'pooled_savings') return []
  const n = c.contribution.member_count
  const weights = Array.from({ length: n }, (_, i) =>
    c.distribution.rule === 'fixed_share'
      ? (c.distribution.fixed_shares.find((s) => s.slot === i + 1)?.basis_points ?? 0)
      : c.distribution.rule === 'contribution_based' && c.contribution.policy === 'configurable'
        ? (c.contribution.member_amounts.find((a) => a.slot === i + 1)?.amount_minor ?? 0)
        : 1,
  )
  const total = weights.reduce((s, w) => s + BigInt(w), 0n)
  if (total === 0n) return []
  const split = (pool: number) => {
    const rows = weights.map((w, i) => {
      const product = BigInt(pool) * BigInt(w)
      return { slot: i + 1, value: Number(product / total), remainder: product % total }
    })
    let remaining = pool - rows.reduce((s, r) => s + r.value, 0)
    for (const r of [...rows].sort((a, b) =>
      a.remainder === b.remainder ? a.slot - b.slot : a.remainder > b.remainder ? -1 : 1,
    )) {
      if (remaining-- <= 0) break
      r.value++
    }
    return rows.map((r) => r.value)
  }
  const units = split(c.reward.quantity * n)
  const costs =
    c.reward.kind === 'cash'
      ? split(c.reward.unit_cost_minor * c.reward.quantity * n)
      : units.map((q) => q * c.reward.unit_cost_minor)
  const shares = split(10000)
  return weights.map((_, i) => ({
    slot: i + 1,
    basis_points: shares[i],
    reward_units: units[i],
    reward_value_minor: costs[i],
  }))
}
