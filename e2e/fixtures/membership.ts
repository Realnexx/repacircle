import type { Page } from '@playwright/test'
import { accountId } from './supabase'
import type { RepaBundle } from '../../src/modules/repa/service'
import type {
  Agreement,
  Member,
  Policy,
  Workspace,
  Invitation,
  MembershipRequest,
  Replacement,
  MembershipEvent,
  MemberStatus,
  FinancialEvent,
} from '../../src/modules/membership/service'
const staffCapabilities = [
  'members.read',
  'members.invite',
  'members.review',
  'members.suspend',
  'finance.read',
  'finance.record',
  'rewards.record',
] as const
type Fixture = {
  state: { role: string; calls: { path: string; body: Record<string, unknown>; query: string }[] }
}
export async function mockMembership(
  page: Page,
  groups: Map<string, RepaBundle>,
  fixture: Fixture,
) {
  const policies = new Map<string, Policy>()
  const agreements = new Map<string, Agreement>()
  const statuses = new Map<string, MemberStatus>()
  const invitations = new Map<string, Invitation & { token: string; group_id: string }>()
  const requests: MembershipRequest[] = []
  const events: MembershipEvent[] = []
  const replacements: Replacement[] = []
  const financialEvents: (FinancialEvent & { member_id: string })[] = []
  let seq = 0
  const uuid = () => `80000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  const members = (b: RepaBundle): Member[] =>
    b.members.map((m) => ({
      id: m.user_id,
      user_id: m.user_id,
      name: m.name,
      status:
        statuses.get(b.group.id + ':' + m.user_id) ??
        (b.group.accepted_version_id ? 'active' : 'approved'),
      slot: m.slot,
      revision: 1,
      accepted_rules_version: m.consented ? b.group.latest_version_id : null,
      accepted_at: m.consented ? new Date().toISOString() : null,
      financial: {
        due_minor: b.group.accepted_version_id ? 20000 : 0,
        credited_minor: 0,
        outstanding_minor: b.group.accepted_version_id ? 20000 : 0,
        round: 1,
        eligible: false,
        reasons: ['The required contributions are not fully met.'],
        reward_received: financialEvents.some(
          (f) => f.member_id === m.user_id && f.kind === 'reward_received',
        ),
      },
      reward_received: financialEvents.some(
        (f) => f.member_id === m.user_id && f.kind === 'reward_received',
      ),
    }))
  const workspace = (b: RepaBundle): Workspace => ({
    group_id: b.group.id,
    can_manage: fixture.state.role === 'owner',
    capabilities: fixture.state.role === 'owner' ? [...staffCapabilities] : [],
    members: members(b).filter((m) => fixture.state.role === 'owner' || m.user_id === accountId),
    requests,
    invitations: [...invitations.values()].filter((i) => i.group_id === b.group.id),
    policies: policies.get(b.group.latest_version_id) ?? null,
    events,
    replacements,
    staff: [],
    reserved_members: members(b).filter((m) =>
      ['approved', 'active', 'suspended'].includes(m.status),
    ).length,
    member_limit: b.configuration.membership.limit,
  })
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/**', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').at(-1)!
    if (
      ![
        'get_group_membership_workspace',
        'get_group_agreement',
        'publish_group_agreement_policy',
        'accept_group_agreement',
        'get_group_member_profile',
        'change_group_member_status',
        'create_group_invitation',
        'revoke_group_invitation',
        'inspect_group_invitation',
        'redeem_group_invitation',
        'request_group_membership',
        'review_group_membership',
        'set_group_staff_permissions',
        'propose_group_member_replacement',
        'accept_group_member_replacement',
        'complete_group_member_replacement',
      ].includes(rpc)
    )
      return route.fallback()
    const body = route.request().postDataJSON() as Record<string, unknown>
    fixture.state.calls.push({ path: '/rest/v1/rpc/' + rpc, body, query: '' })
    const respond = (json: unknown, status = 200) =>
      route.fulfill({ json, status, headers: { 'Access-Control-Allow-Origin': '*' } })
    const b =
      groups.get(String(body.target)) ??
      [...groups.values()].find((b) => members(b).some((m) => m.id === body.member_id)) ??
      [...groups.values()][0]
    if (!b) return respond({ message: 'Group unavailable' }, 404)
    if (rpc === 'get_group_membership_workspace') return respond(workspace(b))
    if (rpc === 'publish_group_agreement_policy') {
      const p: Policy = {
        id: uuid(),
        version_id: String(body.version_id),
        refund_exit_policy: String(body.refund_exit_policy),
        dispute_process: String(body.dispute_process),
        privacy_notice: String(body.privacy_notice),
        published_at: new Date().toISOString(),
      }
      policies.set(p.version_id, p)
      return respond(p.id)
    }
    if (rpc === 'get_group_agreement') {
      const version = String(
        body.rules_version ?? b.group.accepted_version_id ?? b.group.latest_version_id,
      )
      const me = members(b).find((m) => m.user_id === accountId) ?? null
      return respond({
        group: b.group,
        member: me,
        version_id: version,
        version_number: b.versions.find((v) => v.id === version)?.version_number ?? 1,
        configuration: b.configuration,
        policies: policies.get(version) ?? null,
        agreement: agreements.get(version + ':' + accountId) ?? null,
        replacement:
          replacements.find((r) => r.incoming_member_id === accountId && r.status === 'pending') ??
          null,
      })
    }
    if (rpc === 'accept_group_agreement') {
      const version = String(body.rules_version)
      const m = b.members.find((m) => m.user_id === accountId)
      if (m) m.consented = true
      const a: Agreement = {
        id: uuid(),
        rules_version_id: version,
        policy_id: String(body.expected_policy),
        member_slot: m?.slot ?? 1,
        accepted_by: accountId,
        accepted_at: new Date().toISOString(),
        snapshot: { configuration: b.configuration },
      }
      agreements.set(version + ':' + accountId, a)
      return respond(null)
    }
    if (rpc === 'get_group_member_profile') {
      const m = members(b).find((m) => m.id === body.member_id)!
      return respond({
        member: m,
        profile: {
          full_name: m.name,
          email: 'member@example.test',
          mobile_number: '09123456789',
          city_name: 'Quezon City',
          province_name: '',
          region_name: 'NCR',
        },
        financial: m.financial,
        obligations: [],
        financial_events: financialEvents.filter((f) => f.member_id === m.id),
        agreements: [...agreements.values()].filter((a) => a.accepted_by === m.user_id),
        events,
      })
    }
    if (rpc === 'change_group_member_status') {
      const m = members(b).find((m) => m.id === body.member_id)!
      if (body.new_status === 'removed' || body.new_status === 'withdrawn')
        return respond(
          { message: 'Outstanding contributions must be settled; history cannot be erased.' },
          400,
        )
      statuses.set(b.group.id + ':' + m.id, body.new_status as MemberStatus)
      events.push({
        id: events.length + 1,
        member_id: m.id,
        actor_id: accountId,
        event_type: 'membership.status_changed',
        reason: String(body.reason),
        details: { previous: m.status, next: body.new_status },
        created_at: new Date().toISOString(),
      })
      return respond(null)
    }
    if (rpc === 'create_group_invitation') {
      if (
        [...invitations.values()].some(
          (i) => i.group_id === b.group.id && i.email === body.invite_email && !i.revoked_at,
        )
      )
        return respond({ message: 'An unexpired invitation already exists for this email' }, 400)
      const i = {
        id: uuid(),
        email: body.invite_email as string | null,
        max_uses: Number(body.max_uses),
        use_count: 0,
        expires_at: new Date(Date.now() + Number(body.expires_hours) * 3600000).toISOString(),
        revoked_at: null,
        token: 'b'.repeat(64),
        group_id: b.group.id,
      }
      invitations.set(i.id, i)
      return respond(i)
    }
    if (rpc === 'revoke_group_invitation') {
      invitations.get(String(body.invitation_id))!.revoked_at = new Date().toISOString()
      return respond(null)
    }
    if (rpc === 'inspect_group_invitation') {
      const i = invitations.get(String(body.invitation_id))
      if (
        !i ||
        i.token !== body.invitation_token ||
        Date.parse(i.expires_at) <= Date.now() ||
        i.revoked_at
      )
        return respond({ message: 'Invitation is invalid, expired or revoked.' }, 400)
      return respond({
        group_id: b.group.id,
        group_name: b.group.name,
        organization_name: 'Circle A',
        expires_at: i.expires_at,
        allows_organization_join: true,
        already_requested: false,
      })
    }
    if (rpc === 'redeem_group_invitation' || rpc === 'request_group_membership') {
      if (!b.members.some((m) => m.user_id === accountId)) {
        b.members.push({
          user_id: accountId,
          name: 'Maria Cruz',
          role: 'member',
          slot: null,
          consented: false,
        })
        statuses.set(b.group.id + ':' + accountId, 'pending')
      }
      requests.push({
        id: uuid(),
        member_id: accountId,
        name: 'Maria Cruz',
        message: String(body.message),
        status: 'pending',
        review_reason: '',
        created_at: new Date().toISOString(),
      })
      return respond(b.group.id)
    }
    if (rpc === 'review_group_membership') {
      const req = requests.find((r) => r.id === body.request_id)!
      req.status = body.decision as 'approved' | 'rejected'
      req.review_reason = String(body.reason)
      statuses.set(
        b.group.id + ':' + req.member_id,
        body.decision === 'approved' ? 'approved' : 'removed',
      )
      const m = b.members.find((m) => m.user_id === req.member_id)
      if (m && body.decision === 'approved') m.slot = members(b).filter((m) => m.slot).length + 1
      return respond(null)
    }
    if (rpc === 'propose_group_member_replacement') {
      const outgoing = members(b).find((m) => m.id === body.outgoing_member)!
      const incoming = members(b).find((m) => m.id === body.incoming_member)!
      const r: Replacement = {
        id: uuid(),
        outgoing_member_id: outgoing.id,
        incoming_member_id: incoming.id,
        outgoing_name: outgoing.name,
        incoming_name: incoming.name,
        from_round: Number(body.from_round),
        member_slot: outgoing.slot!,
        reason: String(body.reason),
        status: 'pending',
        rules_version_id: b.group.accepted_version_id!,
        incoming_accepted_at: null,
        outgoing_accepted_at: null,
      }
      replacements.push(r)
      return respond(r.id)
    }
    if (rpc === 'accept_group_member_replacement') {
      const r = replacements.find((r) => r.id === body.replacement_id)!
      if (r.incoming_member_id === accountId) r.incoming_accepted_at = new Date().toISOString()
      else r.outgoing_accepted_at = new Date().toISOString()
      return respond(null)
    }
    if (rpc === 'complete_group_member_replacement') {
      const r = replacements.find((r) => r.id === body.replacement_id)!
      if (!r.incoming_accepted_at || !r.outgoing_accepted_at)
        return respond({ message: 'Both participants must accept' }, 400)
      r.status = 'completed'
      statuses.set(b.group.id + ':' + r.outgoing_member_id, 'withdrawn')
      statuses.set(b.group.id + ':' + r.incoming_member_id, 'active')
      b.members.find((m) => m.user_id === r.incoming_member_id)!.slot = r.member_slot
      events.push({
        id: events.length + 1,
        member_id: r.outgoing_member_id,
        actor_id: accountId,
        event_type: 'replacement.completed',
        reason: r.reason,
        details: { historical_obligations_retained: true },
        created_at: new Date().toISOString(),
      })
      return respond(null)
    }
    return respond(null)
  })
  await page.route('http://127.0.0.1:54321/functions/v1/send-group-invitation', (route) =>
    route.fulfill({ json: { sent: true }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  )
  return {
    policies,
    agreements,
    statuses,
    invitations,
    requests,
    events,
    replacements,
    financialEvents,
    workspace,
  }
}
