import type { GroupConfig } from '@/modules/repa/config'
import { type PlanCosts, type PlanLine, type DistributionLine } from './config'
import type { CatalogItem } from './service'
export function rewardContext(c: GroupConfig) {
  return {
    mechanism: c.mechanism,
    currency: c.basic.currency,
    member_count: c.contribution.member_count,
    round_count: c.contribution.round_count,
    distribution: c.distribution.rule,
    rotation_order: c.distribution.rotation_order,
    weights:
      c.distribution.rule === 'fixed_share'
        ? c.distribution.fixed_shares
        : c.distribution.rule === 'contribution_based' && c.contribution.policy === 'configurable'
          ? c.contribution.member_amounts
          : [],
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
export const planMatches = (c: GroupConfig, p: PlanCosts) =>
  canonical(rewardContext(c)) === canonical(p.context) && p.plan_id === c.reward.plan_id
export function previewPlan(
  c: GroupConfig,
  lines: DistributionLine[],
  items: Map<string, CatalogItem>,
  name: string,
): PlanCosts {
  const errors: string[] = []
  const resolved: PlanLine[] = []
  let estimate = 0n,
    actual: bigint | null = 0n,
    required = 0n,
    delivery = 0n,
    additional = 0n,
    physical = 0n
  const seen = new Set<string>()
  for (const line of lines) {
    const item = items.get(line.version_id)
    if (!item || item.status !== 'published') {
      errors.push('Select a published reward for every assignment.')
      continue
    }
    if (item.currency !== c.basic.currency) errors.push('All rewards must use the group currency.')
    if (
      line.scope === 'round' &&
      (!line.round_number ||
        line.round_number > c.contribution.round_count ||
        (c.mechanism === 'pooled_savings' && line.round_number !== c.contribution.round_count))
    )
      errors.push('Choose an existing payout round; pooled rewards belong to the final round.')
    const key = `${line.version_id}:${line.scope}:${line.round_number}`
    if (seen.has(key)) errors.push('Combine duplicate assignment lines using quantity.')
    seen.add(key)
    resolved.push({
      ...line,
      item_id: item.id,
      name: item.name,
      kind: item.kind,
      configuration: item.configuration,
      pricing: item.pricing,
      components: item.components,
    })
  }
  const rounds = []
  for (let i = 1; i <= c.contribution.round_count; i++) {
    const payouts =
      c.mechanism === 'pooled_savings'
        ? i === c.contribution.round_count
          ? c.contribution.member_count
          : 0
        : 1
    let re = 0n,
      ra: bigint | null = 0n,
      rr = 0n,
      rq = 0n
    for (const line of resolved.filter(
      (l) => payouts > 0 && (l.scope === 'each_payout' || l.round_number === i),
    )) {
      const multiplier = BigInt(line.quantity) * BigInt(payouts),
        p = line.pricing
      re += BigInt(p.estimated_minor) * multiplier
      rr += BigInt(p.required_minor) * multiplier
      rq += BigInt(p.unit_quantity) * multiplier
      physical += BigInt(p.physical_quantity) * multiplier
      if (p.actual_minor === null) ra = null
      else if (ra !== null) ra += BigInt(p.actual_minor) * multiplier
      delivery += BigInt(p.delivery_minor) * multiplier
      additional += BigInt(p.additional_minor) * multiplier
    }
    if (payouts && rr === 0n) errors.push(`Round ${i} has no funded reward allocation.`)
    estimate += re
    required += rr
    if (ra === null) actual = null
    else if (actual !== null) actual += ra
    rounds.push({
      round: i,
      required_minor: rr.toString(),
      estimated_minor: re.toString(),
      actual_minor: ra?.toString() ?? null,
      quantity: rq.toString(),
      payout_count: payouts,
    })
  }
  if (required > 1_000_000_000_000_000n)
    errors.push('Total reward funding exceeds the exact supported plan limit.')
  const result: PlanCosts = {
    plan_id: '00000000-0000-4000-8000-000000000001',
    name,
    currency: c.basic.currency,
    context: rewardContext(c),
    estimated_minor: estimate.toString(),
    actual_minor: actual?.toString() ?? null,
    required_minor: required.toString(),
    delivery_minor: delivery.toString(),
    additional_minor: additional.toString(),
    product_quantity: physical.toString(),
    rounds,
    errors,
    lines: resolved,
  }
  if (
    c.mechanism === 'pooled_savings' &&
    planAllocations(c, result).some((r) => BigInt(r.value_minor) <= 0n)
  )
    errors.push(
      'Every pooled recipient must receive a positive reward allocation. Adjust quantities or shares.',
    )
  return result
}
export function splitExact(pool: bigint, weights: bigint[]) {
  const total = weights.reduce((s, v) => s + v, 0n)
  if (total <= 0n) return []
  const result = weights.map((w, i) => ({
    i,
    value: (pool * w) / total,
    remainder: (pool * w) % total,
  }))
  let left = pool - result.reduce((s, r) => s + r.value, 0n)
  for (const r of [...result].sort((a, b) =>
    a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1,
  )) {
    if (left-- <= 0n) break
    r.value++
  }
  return result.map((r) => r.value.toString())
}
export function planAllocations(c: GroupConfig, p: PlanCosts) {
  if (c.mechanism !== 'pooled_savings')
    return p.rounds.map((r) => ({
      round: r.round,
      slot: c.mechanism === 'rotating' ? c.distribution.rotation_order[r.round - 1] : null,
      value_minor: r.required_minor,
      units: r.quantity,
    }))
  const weights = Array.from({ length: c.contribution.member_count }, (_, i) =>
    BigInt(
      c.distribution.rule === 'fixed_share'
        ? (c.distribution.fixed_shares.find((s) => s.slot === i + 1)?.basis_points ?? 0)
        : c.distribution.rule === 'contribution_based' && c.contribution.policy === 'configurable'
          ? (c.contribution.member_amounts.find((s) => s.slot === i + 1)?.amount_minor ?? 0)
          : 1,
    ),
  )
  const money = weights.map(() => 0n),
    units = weights.map(() => 0n)
  for (const line of p.lines) {
    const bundles = BigInt(line.quantity) * BigInt(c.contribution.member_count)
    if (line.kind === 'cash') {
      const values = splitExact(BigInt(line.pricing.required_minor) * bundles, weights)
      values.forEach((v, i) => (money[i] += BigInt(v)))
    } else {
      const counts = splitExact(bundles, weights)
      counts.forEach((v, i) => {
        money[i] += BigInt(v) * BigInt(line.pricing.required_minor)
        units[i] += BigInt(v) * BigInt(line.pricing.unit_quantity)
      })
    }
  }
  return weights.map((_, i) => ({
    round: c.contribution.round_count,
    slot: i + 1,
    value_minor: money[i].toString(),
    units: units[i].toString(),
  }))
}
