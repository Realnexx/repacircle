import { z } from 'zod'
import { command, requireClient } from '@/lib/api/client'
import type { GroupConfig } from '@/modules/repa/config'
export const memberStatuses = [
  'invited',
  'pending',
  'approved',
  'active',
  'suspended',
  'withdrawn',
  'removed',
] as const
export type MemberStatus = (typeof memberStatuses)[number]
export const staffCapabilities = [
  'members.read',
  'members.invite',
  'members.review',
  'members.suspend',
  'finance.read',
  'finance.record',
  'rewards.record',
] as const
export const capabilityLabels: Record<(typeof staffCapabilities)[number], string> = {
  'members.read': 'View members and profiles',
  'members.invite': 'Invite group members',
  'members.review': 'Approve and review membership',
  'members.suspend': 'Suspend participation',
  'finance.read': 'View member financial history',
  'finance.record': 'Record verified contribution history',
  'rewards.record': 'Record verified reward delivery',
}
export const agreementSections = {
  contribution: 'Contribution amount',
  schedule: 'Payment schedule',
  deadlines: 'Deadline rules',
  reward: 'Reward type',
  mechanism: 'Payout mechanism',
  selection: 'Recipient selection rules',
  late_policy: 'Late payment policies',
  refund_exit: 'Refund and exit policies',
  disputes: 'Dispute process',
  privacy: 'Privacy notice',
} as const
export const allAcknowledgements = () =>
  Object.fromEntries(Object.keys(agreementSections).map((k) => [k, true]))
export const policySchema = z.object({
  refund_exit_policy: z.string().trim().min(20).max(4000),
  dispute_process: z.string().trim().min(20).max(4000),
  privacy_notice: z.string().trim().min(20).max(4000),
})
export const invitationSchema = z.object({
  email: z.union([z.literal(''), z.email()]),
  max_uses: z.number().int().min(1).max(1000),
  expires_hours: z.number().int().min(1).max(168),
})
export type Policy = z.infer<typeof policySchema> & {
  id: string
  version_id: string
  published_at: string
}
export type FinancialSummary = {
  due_minor: number
  credited_minor: number
  outstanding_minor: number
  round: number
  eligible: boolean
  reasons: string[]
  reward_received: boolean
}
export type Member = {
  id: string
  user_id: string
  name: string
  status: MemberStatus
  slot: number | null
  revision: number
  accepted_rules_version: string | null
  accepted_at: string | null
  agreement_complete?: boolean
  financial: FinancialSummary | null
  reward_received: boolean
}
export type MembershipRequest = {
  id: string
  member_id: string
  name: string
  message: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  review_reason: string
  created_at: string
}
export type Invitation = {
  id: string
  email: string | null
  max_uses: number
  use_count: number
  expires_at: string
  revoked_at: string | null
}
export type CreatedInvitation = Invitation & { token: string }
export type Replacement = {
  id: string
  outgoing_member_id: string
  incoming_member_id: string
  outgoing_name: string
  incoming_name: string
  from_round: number
  member_slot: number
  reason: string
  status: 'pending' | 'completed' | 'cancelled'
  outgoing_accepted_at: string | null
  incoming_accepted_at: string | null
  rules_version_id: string
}
export type MembershipEvent = {
  id: number
  member_id: string | null
  event_type: string
  reason: string
  details: Record<string, unknown>
  created_at: string
  actor_id: string
}
export type Workspace = {
  group_id: string
  can_manage: boolean
  capabilities: string[]
  members: Member[]
  requests: MembershipRequest[]
  invitations: Invitation[]
  events: MembershipEvent[]
  replacements: Replacement[]
  staff: { user_id: string; permissions: string[] }[]
  policies: Policy | null
  reserved_members: number
  member_limit: number
}
export type Agreement = {
  id: string
  rules_version_id: string
  policy_id: string
  member_slot: number
  accepted_at: string
  accepted_by: string
  snapshot: unknown
}
export type AgreementBundle = {
  group: { id: string; name: string; status: string; organization_id: string }
  member: Member | null
  version_id: string
  version_number: number
  configuration: GroupConfig
  policies: Policy | null
  agreement: Agreement | null
  replacement: Replacement | null
}
export type Obligation = {
  id: string
  original_member_id: string
  current_member_id: string
  round_number: number
  due_minor: number
  credited_minor: number
  due_at: string
  grace_ends_at: string
}
export type FinancialEvent = {
  id: string
  kind: string
  round_number: number
  amount_minor: number
  external_reference: string
  evidence_note: string
  recorded_at: string
}
export type MemberProfile = {
  member: Member
  profile: {
    full_name: string
    email: string
    mobile_number: string
    city_name: string
    province_name: string
    region_name: string
  }
  financial: FinancialSummary | null
  obligations: Obligation[]
  financial_events: FinancialEvent[]
  agreements: Agreement[]
  events: MembershipEvent[]
}
export const getWorkspace = (id: string) =>
  command<Workspace>('get_group_membership_workspace', { target: id })
export const getMemberProfile = (id: string) =>
  command<MemberProfile>('get_group_member_profile', { member_id: id })
export const getAgreement = (id: string, version?: string) =>
  command<AgreementBundle>('get_group_agreement', { target: id, rules_version: version ?? null })
export const publishPolicy = (id: string, version: string, values: z.infer<typeof policySchema>) =>
  command<string>('publish_group_agreement_policy', {
    target: id,
    version_id: version,
    ...policySchema.parse(values),
  })
export const inviteMember = (id: string, values: z.infer<typeof invitationSchema>) => {
  const v = invitationSchema.parse(values)
  return command<CreatedInvitation>('create_group_invitation', {
    target: id,
    invite_email: v.email || null,
    max_uses: v.email ? 1 : v.max_uses,
    expires_hours: v.expires_hours,
  })
}
export const revokeInvitation = (id: string) =>
  command('revoke_group_invitation', { invitation_id: id })
export const inspectInvitation = (id: string, token: string) =>
  command<{
    group_id: string
    group_name: string
    organization_name: string
    expires_at: string
    allows_organization_join: boolean
    already_requested: boolean
  }>('inspect_group_invitation', { invitation_id: id, invitation_token: token })
export const redeemInvitation = (id: string, token: string, message: string) =>
  command<string>('redeem_group_invitation', {
    invitation_id: id,
    invitation_token: token,
    message,
  })
export const requestMembership = (id: string, message: string) =>
  command<string>('request_group_membership', { target: id, message })
export const reviewRequest = (id: string, decision: string, reason: string) =>
  command('review_group_membership', { request_id: id, decision, reason })
export const changeStatus = (m: Member, status: string, reason: string) =>
  command('change_group_member_status', {
    member_id: m.id,
    expected_revision: m.revision,
    new_status: status,
    reason,
  })
export const acceptAgreement = (
  b: AgreementBundle,
  ack: Record<string, boolean>,
  values: Record<string, unknown>,
) =>
  command('accept_group_agreement', {
    target: b.group.id,
    rules_version: b.version_id,
    expected_policy: b.policies?.id,
    acknowledgements: ack,
    custom_values: values,
  })
export const setStaff = (id: string, user: string, permissions: string[], reason: string) =>
  command('set_group_staff_permissions', { target: id, staff_user: user, permissions, reason })
export const proposeReplacement = (
  outgoing: string,
  incoming: string,
  round: number,
  reason: string,
) =>
  command('propose_group_member_replacement', {
    outgoing_member: outgoing,
    incoming_member: incoming,
    from_round: round,
    reason,
  })
export const acceptReplacement = (id: string) =>
  command('accept_group_member_replacement', { replacement_id: id })
export const completeReplacement = (id: string) =>
  command('complete_group_member_replacement', { replacement_id: id })
export const cancelReplacement = (id: string, reason: string) =>
  command('cancel_group_member_replacement', { replacement_id: id, reason })
export async function sendInvitation(invite: CreatedInvitation) {
  const { error } = await requireClient().functions.invoke('send-group-invitation', {
    body: { invitation_id: invite.id, invitation_token: invite.token },
  })
  if (error)
    throw new Error(
      'Email delivery failed or is not configured. The invitation is still valid; copy the link or retry after one minute.',
    )
}
