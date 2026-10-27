import { describe, it, expect } from 'vitest'
import {
  scheduleDates,
  deadline,
  lateFee,
  obligationStatus,
  type Schedule,
  type LateFeeRule,
} from './engine'
import { configSchema, defaultConfig } from '@/modules/repa/config'
import { calculateFunding, schedulePreview } from '@/modules/repa/calculations'
const s: Schedule = {
  frequency: 'monthly',
  every_days: 3,
  start_date: '2028-01-31',
  cutoff_time: '23:30',
  timezone: 'Asia/Manila',
  grace_hours: 2,
}
const fee: LateFeeRule = {
  mode: 'percentage',
  fixed_minor: 0,
  rate_basis_points: 250,
  cap_minor: 2000,
  review_reference: 'legal-review-2026-001',
  reviewed_by: 'External reviewer',
  reviewed_on: '2026-01-01',
  disclosure: 'One fee, rounded up and capped, on principal unpaid at the end of the grace period.',
}
describe('contribution dates and exact deadlines', () => {
  it.each([
    ['daily', ['2028-01-31', '2028-02-01', '2028-02-02']],
    ['weekly', ['2028-01-31', '2028-02-07', '2028-02-14']],
    ['biweekly', ['2028-01-31', '2028-02-14', '2028-02-28']],
    ['custom', ['2028-01-31', '2028-02-03', '2028-02-06']],
    ['monthly', ['2028-01-31', '2028-02-29', '2028-03-31']],
  ])('%s has correct calendar dates', (frequency, expected) =>
    expect(scheduleDates({ ...s, frequency }, 3)).toEqual(expected),
  )
  it('keeps the month-end anchor in leap, nonleap and century years', () => {
    expect(scheduleDates({ ...s, start_date: '2027-01-31' }, 3)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ])
    expect(scheduleDates({ ...s, start_date: '2100-01-31' }, 2)[1]).toBe('2100-02-28')
    expect(scheduleDates({ ...s, start_date: '2000-01-31' }, 2)[1]).toBe('2000-02-29')
  })
  it('selects ISO weekdays including the anchor and Sunday', () =>
    expect(scheduleDates({ ...s, frequency: 'weekdays', weekdays: [1, 7] }, 4)).toEqual([
      '2028-01-31',
      '2028-02-06',
      '2028-02-07',
      '2028-02-13',
    ]))
  it('skips nonexistent selected monthly dates without clamping or duplicates', () =>
    expect(scheduleDates({ ...s, frequency: 'monthly_dates', monthly_dates: [30, 31] }, 5)).toEqual(
      ['2028-01-31', '2028-03-30', '2028-03-31', '2028-04-30', '2028-05-30'],
    ))
  it('uses one explicit date per round', () =>
    expect(
      scheduleDates(
        { ...s, frequency: 'custom_dates', custom_dates: ['2028-02-29', '2028-03-05'] },
        2,
      ),
    ).toEqual(['2028-02-29', '2028-03-05']))
  it.each([
    ['2028-02-30', '2028-03-05'],
    ['2028-03-05', '2028-03-05'],
    ['2028-03-05', '2028-02-29'],
    ['2028-01-01', '2028-03-05'],
  ])('rejects invalid custom dates %s, %s', (a, b) =>
    expect(() =>
      scheduleDates({ ...s, frequency: 'custom_dates', custom_dates: [a, b] }, 2),
    ).toThrow(),
  )
  it('rejects empty or duplicate weekday selections and incomplete explicit schedules', () => {
    expect(() => scheduleDates({ ...s, frequency: 'weekdays' }, 2)).toThrow()
    expect(() => scheduleDates({ ...s, frequency: 'weekdays', weekdays: [1, 1] }, 2)).toThrow()
    expect(() =>
      scheduleDates({ ...s, frequency: 'custom_dates', custom_dates: ['2028-02-29'] }, 2),
    ).toThrow()
  })
  it('stores Manila cutoff and grace instants across a local date boundary', () => {
    expect(deadline('2028-02-29', s)).toEqual({
      due_at: '2028-02-29T15:30:00.000Z',
      grace_ends_at: '2028-02-29T17:30:00.000Z',
    })
    expect(deadline('2028-02-29', { ...s, timezone: 'UTC' }).grace_ends_at).toBe(
      '2028-03-01T01:30:00.000Z',
    )
  })
  it('uses the same custom dates for schedule/funding review', () => {
    const c = defaultConfig('10000000-0000-4000-8000-000000000001')
    c.basic.name = 'Calendar group'
    c.basic.start_date = s.start_date
    c.schedule = { ...s, frequency: 'custom_dates', custom_dates: ['2028-02-29', '2028-03-05'] }
    c.contribution.amount_minor = 10000
    c.reward.unit_cost_minor = 20000
    c.membership.terms = 'All members accept the disclosed contribution schedule and terms.'
    expect(calculateFunding(c).valid).toBe(true)
    expect(schedulePreview(c).map((r) => r.date)).toEqual(['2028-02-29', '2028-03-05'])
    c.contribution.late_policy = 'fee'
    c.contribution.late_fee_rule = fee
    expect(configSchema.safeParse(c).success).toBe(true)
    c.contribution.late_fee_rule = { ...fee, review_reference: '' }
    expect(configSchema.safeParse(c).success).toBe(false)
  })
})
describe('fees and obligation status', () => {
  it('calculates fixed and percentage fees with exact caps and upward cent rounding', () => {
    expect(lateFee(100000n, fee)).toBe(2000n)
    expect(lateFee(101n, { ...fee, rate_basis_points: 100 })).toBe(2n)
    expect(lateFee(100000n, { ...fee, mode: 'fixed', fixed_minor: 5000 })).toBe(2000n)
    expect(lateFee(0n, fee)).toBe(0n)
    expect(lateFee(100n, { ...fee, mode: 'none' })).toBe(0n)
  })
  const o = {
    remaining_minor: 100000n,
    verified_minor: 0n,
    due_at: '2028-02-29T15:30:00Z',
    grace_ends_at: '2028-02-29T17:30:00Z',
    timezone: 'Asia/Manila',
  }
  it('uses the local due day to distinguish upcoming and unpaid', () => {
    expect(obligationStatus(o, new Date('2028-02-28T15:59:59Z'))).toBe('upcoming')
    expect(obligationStatus(o, new Date('2028-02-28T16:00:00Z'))).toBe('unpaid')
  })
  it('allows partial contributions through grace and makes remaining debt overdue afterward', () => {
    expect(
      obligationStatus(
        { ...o, verified_minor: 40000n, remaining_minor: 60000n },
        new Date(o.grace_ends_at),
      ),
    ).toBe('partially_paid')
    expect(
      obligationStatus(
        { ...o, verified_minor: 40000n, remaining_minor: 60000n },
        new Date('2028-02-29T17:30:01Z'),
      ),
    ).toBe('overdue')
  })
  it('keeps paid, waived and cancelled statuses independent of a payment attempt', () => {
    expect(
      obligationStatus(
        { ...o, remaining_minor: 0n, verified_minor: 100000n },
        new Date('2030-01-01'),
      ),
    ).toBe('paid')
    expect(obligationStatus({ ...o, terminal: 'waived' })).toBe('waived')
    expect(obligationStatus({ ...o, terminal: 'cancelled' })).toBe('cancelled')
  })
})
