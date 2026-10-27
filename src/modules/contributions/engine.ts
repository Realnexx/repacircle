export const obligationStatuses = [
  'upcoming',
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'waived',
  'cancelled',
] as const
export type ObligationStatus = (typeof obligationStatuses)[number]
export type Schedule = {
  frequency: string
  every_days: number
  start_date: string
  cutoff_time: string
  timezone: 'Asia/Manila' | 'UTC'
  grace_hours: number
  weekdays?: number[]
  monthly_dates?: number[]
  custom_dates?: string[]
}
export type LateFeeRule = {
  mode: 'none' | 'fixed' | 'percentage'
  fixed_minor: number
  rate_basis_points: number
  cap_minor: number
  review_reference: string
  reviewed_by: string
  reviewed_on: string
  disclosure: string
}
export function scheduleDates(s: Schedule, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new Error('Choose 1 to 1,000 rounds.')
  const anchor = new Date(s.start_date + 'T00:00:00Z')
  if (
    !Number.isFinite(anchor.getTime()) ||
    anchor.getUTCFullYear() < 1 ||
    anchor.toISOString().slice(0, 10) !== s.start_date
  )
    throw new Error('Enter a valid schedule start date.')
  const iso = (d: Date) => {
    const v = d.toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
      throw new Error('Schedule exceeds the supported calendar range.')
    return v
  }
  if (s.frequency === 'custom_dates') {
    const dates = s.custom_dates ?? []
    if (
      dates.length !== count ||
      dates.some(
        (d, i) =>
          d < s.start_date ||
          (i > 0 && d <= dates[i - 1]) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
          !Number.isFinite(Date.parse(d)) ||
          iso(new Date(d)) !== d,
      )
    )
      throw new Error(
        'Enter one unique, ascending custom date per round, on or after the start date.',
      )
    return dates
  }
  if (['weekdays', 'monthly_dates'].includes(s.frequency)) {
    const choices = s.frequency === 'weekdays' ? s.weekdays : s.monthly_dates
    if (
      !choices?.length ||
      new Set(choices).size !== choices.length ||
      choices.some(
        (n) => !Number.isInteger(n) || n < 1 || n > (s.frequency === 'weekdays' ? 7 : 31),
      )
    )
      throw new Error('Choose unique weekdays or monthly dates.')
    const dates: string[] = []
    for (let i = 0; i < count * 62 + 366 && dates.length < count; i++) {
      const d = new Date(anchor.getTime() + i * 86400000)
      if (choices.includes(s.frequency === 'weekdays' ? d.getUTCDay() || 7 : d.getUTCDate()))
        dates.push(iso(d))
    }
    if (dates.length !== count) throw new Error('Schedule exceeds the supported calendar range.')
    return dates
  }
  if (!['daily', 'weekly', 'biweekly', 'monthly', 'custom'].includes(s.frequency))
    throw new Error('Unsupported schedule frequency.')
  return Array.from({ length: count }, (_, i) => {
    if (s.frequency === 'monthly') {
      const d = new Date(anchor)
      d.setUTCDate(1)
      d.setUTCMonth(anchor.getUTCMonth() + i)
      const last = new Date(d)
      last.setUTCMonth(d.getUTCMonth() + 1)
      last.setUTCDate(0)
      d.setUTCDate(Math.min(anchor.getUTCDate(), last.getUTCDate()))
      return iso(d)
    }
    const days = (
      { daily: 1, weekly: 7, biweekly: 14, custom: s.every_days } as Record<string, number>
    )[s.frequency]
    if (!Number.isInteger(days) || days < 1 || days > 365)
      throw new Error('Invalid schedule interval.')
    return iso(new Date(anchor.getTime() + i * days * 86400000))
  })
}
export function deadline(date: string, s: Schedule) {
  const due = new Date(`${date}T${s.cutoff_time}:00${s.timezone === 'UTC' ? 'Z' : '+08:00'}`)
  return {
    due_at: due.toISOString(),
    grace_ends_at: new Date(due.getTime() + s.grace_hours * 3600000).toISOString(),
  }
}
export function lateFee(base: bigint, rule: LateFeeRule) {
  if (base <= 0n || rule.mode === 'none') return 0n
  const fee =
    rule.mode === 'fixed'
      ? BigInt(rule.fixed_minor)
      : (base * BigInt(rule.rate_basis_points) + 9999n) / 10000n
  return fee > BigInt(rule.cap_minor) ? BigInt(rule.cap_minor) : fee
}
export function obligationStatus(
  v: {
    remaining_minor: bigint
    verified_minor: bigint
    due_at: string
    grace_ends_at: string
    timezone: string
    terminal?: 'waived' | 'cancelled' | null
  },
  asOf = new Date(),
): ObligationStatus {
  if (v.terminal) return v.terminal
  if (v.remaining_minor === 0n) return 'paid'
  if (asOf > new Date(v.grace_ends_at)) return 'overdue'
  if (v.verified_minor > 0n) return 'partially_paid'
  const offset = v.timezone === 'UTC' ? 0 : 8 * 3600000
  const localDay = (d: Date) => new Date(d.getTime() + offset).toISOString().slice(0, 10)
  return localDay(asOf) < localDay(new Date(v.due_at)) ? 'upcoming' : 'unpaid'
}
export const weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]
export function scheduleDescription(s: Schedule) {
  return s.frequency === 'weekdays'
    ? `Every ${s.weekdays?.map((d) => weekdayNames[d - 1]).join(', ') || 'selected weekday'}`
    : s.frequency === 'monthly_dates'
      ? `Monthly on ${s.monthly_dates?.join(', ') || 'selected dates'} (invalid dates are skipped)`
      : s.frequency === 'custom_dates'
        ? `${s.custom_dates?.length ?? 0} custom dates`
        : s.frequency === 'custom'
          ? `Every ${s.every_days} days`
          : s.frequency === 'biweekly'
            ? 'Every two weeks'
            : s.frequency
}
export function feeDescription(rule?: LateFeeRule) {
  return !rule || rule.mode === 'none'
    ? 'No reviewed automatic late fee.'
    : `${rule.mode === 'fixed' ? `${(rule.fixed_minor / 100).toFixed(2)} fixed fee` : `${rule.rate_basis_points / 100}% of unpaid principal at grace expiry, rounded up to the next minor unit`}; maximum ${(rule.cap_minor / 100).toFixed(2)}. One assessment per obligation. ${rule.disclosure} Legal review: ${rule.reviewed_by}, ${rule.reviewed_on}, reference ${rule.review_reference}.`
}
