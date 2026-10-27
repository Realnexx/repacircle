import { command } from '@/lib/api/client'
import type { GroupConfig } from '@/modules/repa/config'
import type { ObligationStatus } from './engine'
export type ContributionGroup = {
  id: string
  name: string
  status: string
  currency: string
  timezone: string
  can_collect: boolean
}
export type Obligation = {
  id: string
  group_id: string
  member_id: string
  member_name: string
  member_status: string
  member_slot: number
  round: number
  rules_version_id: string
  currency: string
  timezone: string
  principal_due_minor: number
  principal_verified_minor: number
  principal_remaining_minor: number
  fee_minor: number
  fee_waived_minor: number
  fee_verified_minor: number
  fee_remaining_minor: number
  due_minor: number
  verified_minor: number
  remaining_minor: number
  original_due_at: string
  due_at: string
  local_due_date: string
  grace_ends_at: string
  grace_hours: number
  partial_payments: boolean
  late_policy: string
  status: ObligationStatus
}
export type Round = {
  round_number: number
  status: string
  expected_minor: number
  verified_minor: number
  outstanding_minor: number
  funding_gap_minor?: number
  collection_ready: boolean
  can_progress: boolean
  grace_ends_at: string
}
export type ContributionWorkspace = {
  group: ContributionGroup & { rules_version_id: string }
  configuration: GroupConfig
  can_collect: boolean
  can_record: boolean
  can_adjust: boolean
  obligations: Obligation[]
  total: number
  summary: {
    due_minor: number
    verified_minor: number
    remaining_minor: number
    overdue: number
    paid: number
    obligations: number
  }
  rounds: Round[]
  reminders: { id: string; kind: string; deadline_at: string; obligation_id: string }[]
  engine: { current_round: number; cycle_ready: boolean; last_checked_at: string } | null
  last_job_runs: { job_kind: string; completed_at: string }[]
}
export type ObligationDetail = {
  obligation: Obligation
  payments: {
    id: string
    principal_minor: number
    fee_minor: number
    payment_method: string
    external_reference: string
    evidence_note: string
    verified_at: string
    verified_by: string
  }[]
  adjustments: {
    id: string
    kind: string
    amount_minor: number
    extended_due_at: string | null
    reason: string
    created_at: string
    created_by: string | null
  }[]
  status_history: {
    id: number
    previous_status: string | null
    new_status: string
    detected_at: string
  }[]
}
export const contributionGroups = (org: string) =>
  command<ContributionGroup[]>('list_contribution_groups', { target_organization: org })
export const contributionWorkspace = (
  id: string,
  status: string,
  page: number,
  from: string,
  to: string,
) =>
  command<ContributionWorkspace>('get_contribution_workspace', {
    target: id,
    filter_status: status === 'all' ? null : status,
    page_number: page,
    page_size: 25,
    from_date: from || null,
    to_date: to || null,
  })
export const contributionDetail = (id: string) =>
  command<ObligationDetail>('get_contribution_obligation', { target: id })
export const recordReceipt = (
  id: string,
  amount: number,
  method: string,
  reference: string,
  evidence: string,
  request: string,
) =>
  command<string>('record_verified_contribution', {
    target: id,
    amount_minor: amount,
    payment_method: method,
    external_reference: reference,
    evidence_note: evidence,
    request_id: request,
  })
export const adjustObligation = (
  id: string,
  kind: string,
  amount: number,
  extension: string | null,
  reason: string,
  request: string,
) =>
  command<string>('adjust_contribution_obligation', {
    target: id,
    adjustment_kind: kind,
    amount_minor: amount,
    extended_due_at: extension,
    reason,
    request_id: request,
  })
export const refreshDeadlines = (id: string) =>
  command<number>('refresh_contribution_deadlines', { target: id })
export const dismissReminder = (id: string) =>
  command('dismiss_contribution_reminder', { target: id })
