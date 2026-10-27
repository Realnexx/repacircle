import type { Page } from '@playwright/test'
import { mockRepa } from './repa'
import { accountId, organizationA } from './supabase'
import { defaultConfig } from '../../src/modules/repa/config'
import { obligationStatus } from '../../src/modules/contributions/engine'
import type {
  Obligation,
  ObligationDetail,
  ContributionWorkspace,
} from '../../src/modules/contributions/service'
import type { RepaBundle } from '../../src/modules/repa/service'
const id = (n: number) => `92000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export async function mockContributions(
  page: Page,
  options: { member?: boolean; fee?: boolean } = {},
) {
  const base = await mockRepa(page)
  if (options.member) base.fixture.state.role = 'member'
  const today = new Date().toISOString().slice(0, 10),
    tomorrow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const c = defaultConfig(organizationA)
  c.basic.name = 'Contribution circle'
  c.basic.start_date = yesterday
  c.schedule.start_date = yesterday
  c.schedule.frequency = 'custom_dates'
  c.schedule.custom_dates = [yesterday, tomorrow]
  c.contribution.amount_minor = 100000
  c.contribution.partial_payments = true
  c.reward.unit_cost_minor = 100000
  c.membership.terms = 'Every member accepts the disclosed contributions, deadlines and rewards.'
  c.payment.methods = ['cash', 'gcash_manual']
  c.payment.instructions = 'Staff verify manual cash and transfer references.'
  if (options.fee) {
    c.contribution.late_policy = 'fee'
    c.contribution.late_fee_rule = {
      mode: 'fixed',
      fixed_minor: 500,
      rate_basis_points: 0,
      cap_minor: 500,
      review_reference: 'test-review',
      reviewed_by: 'Legal reviewer',
      reviewed_on: today,
      disclosure: 'One disclosed and legally reviewed fixed fee capped at five pesos.',
    }
  }
  const bundle: RepaBundle = {
    group: {
      id: id(1),
      organization_id: organizationA,
      name: c.basic.name,
      description: 'Accepted contribution circle',
      image_path: '',
      visibility: 'organization',
      currency: 'PHP',
      mechanism: 'rotating',
      start_date: yesterday,
      status: 'active',
      revision: 1,
      latest_version_id: id(2),
      accepted_version_id: id(2),
      created_at: new Date().toISOString(),
    },
    configuration: c,
    accepted_configuration: c,
    versions: [
      {
        id: id(2),
        version_number: 1,
        approval_status: 'approved',
        change_summary: 'Accepted contribution rules',
        changes: [],
        changed_by: accountId,
        approved_by: accountId,
        effective_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
    checks: [],
    members: [],
    my_consent: null,
    can_manage: true,
  }
  base.groups.set(id(1), bundle)
  const obligations: Obligation[] = []
  const details = new Map<string, ObligationDetail>()
  let seq = 100
  for (let round = 1; round <= 2; round++)
    for (let slot = 1; slot <= 2; slot++) {
      const date = round === 1 ? (slot === 1 ? today : yesterday) : tomorrow
      const due = new Date(date + 'T23:30:00+08:00').toISOString()
      const original = new Date(
        (round === 1 ? yesterday : tomorrow) + 'T23:30:00+08:00',
      ).toISOString()
      const fee = options.fee && round === 1 ? 500 : 0
      const o: Obligation = {
        id: id(round * 10 + slot),
        group_id: id(1),
        member_id: id(20 + slot),
        member_name: slot === 1 ? 'Maria Cruz' : 'Staff Member',
        member_status: 'active',
        member_slot: slot,
        round,
        rules_version_id: id(2),
        currency: 'PHP',
        timezone: 'Asia/Manila',
        principal_due_minor: 100000,
        principal_verified_minor: 0,
        principal_remaining_minor: 100000,
        fee_minor: fee,
        fee_waived_minor: 0,
        fee_verified_minor: 0,
        fee_remaining_minor: fee,
        due_minor: 100000 + fee,
        verified_minor: 0,
        remaining_minor: 100000 + fee,
        original_due_at: original,
        due_at: due,
        local_due_date: date,
        grace_ends_at: due,
        grace_hours: 0,
        partial_payments: true,
        late_policy: c.contribution.late_policy,
        status: 'unpaid',
      }
      o.status = obligationStatus({
        ...o,
        remaining_minor: BigInt(o.remaining_minor),
        verified_minor: 0n,
      })
      obligations.push(o)
      details.set(o.id, { obligation: o, payments: [], adjustments: [], status_history: [] })
    }
  const own = (o: Obligation) => base.fixture.state.role === 'owner' || o.member_slot === 1
  const refresh = (o: Obligation) => {
    o.principal_remaining_minor = o.principal_due_minor - o.principal_verified_minor
    o.fee_remaining_minor = Math.max(0, o.fee_minor - o.fee_waived_minor - o.fee_verified_minor)
    o.verified_minor = o.principal_verified_minor + o.fee_verified_minor
    o.due_minor = o.principal_due_minor + o.fee_minor - o.fee_waived_minor
    o.remaining_minor = Math.max(0, o.due_minor - o.verified_minor)
    if (!['waived', 'cancelled'].includes(o.status))
      o.status = obligationStatus({
        ...o,
        remaining_minor: BigInt(o.remaining_minor),
        verified_minor: BigInt(o.verified_minor),
      })
  }
  let reminders = [
    {
      id: id(90),
      kind: 'due_today',
      deadline_at: obligations[0].due_at,
      obligation_id: obligations[0].id,
    },
  ]
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/*contribution*', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').at(-1)!
    const b = route.request().postDataJSON()
    base.fixture.state.calls.push({ path: '/rest/v1/rpc/' + rpc, body: b, query: '' })
    const respond = (json: unknown, status = 200) =>
      route.fulfill({ status, json, headers: { 'Access-Control-Allow-Origin': '*' } })
    if (rpc === 'list_contribution_groups')
      return respond([
        {
          id: id(1),
          name: c.basic.name,
          status: 'active',
          currency: 'PHP',
          timezone: 'Asia/Manila',
          can_collect: base.fixture.state.role === 'owner',
        },
      ])
    if (rpc === 'get_contribution_workspace') {
      const visible = obligations.filter(own)
      const filtered = visible.filter(
        (o) =>
          (!b.filter_status || o.status === b.filter_status) &&
          (!b.from_date || o.local_due_date >= b.from_date) &&
          (!b.to_date || o.local_due_date <= b.to_date),
      )
      const manager = base.fixture.state.role === 'owner'
      const workspace: ContributionWorkspace = {
        group: {
          id: id(1),
          name: c.basic.name,
          status: 'active',
          currency: 'PHP',
          timezone: 'Asia/Manila',
          can_collect: manager,
          rules_version_id: id(2),
        },
        configuration: c,
        can_collect: manager,
        can_record: manager,
        can_adjust: manager,
        total: filtered.length,
        obligations: filtered.slice((b.page_number - 1) * b.page_size, b.page_number * b.page_size),
        summary: {
          due_minor: visible.reduce((s, o) => s + o.due_minor, 0),
          verified_minor: visible.reduce((s, o) => s + o.verified_minor, 0),
          remaining_minor: visible.reduce((s, o) => s + o.remaining_minor, 0),
          overdue: visible.filter((o) => o.status === 'overdue').length,
          paid: visible.filter((o) => o.status === 'paid').length,
          obligations: visible.length,
        },
        rounds: [1, 2].map((round) => {
          const rows = visible.filter((o) => o.round === round)
          return {
            round_number: round,
            status: rows.some((o) => o.status === 'overdue') ? 'overdue' : 'collecting',
            expected_minor: rows.reduce((s, o) => s + o.principal_due_minor, 0),
            verified_minor: rows.reduce((s, o) => s + o.principal_verified_minor, 0),
            outstanding_minor: rows.reduce((s, o) => s + o.remaining_minor, 0),
            funding_gap_minor: manager
              ? rows.reduce((s, o) => s + o.principal_remaining_minor, 0)
              : undefined,
            collection_ready: rows.every((o) => o.remaining_minor === 0),
            can_progress: false,
            grace_ends_at: rows[0].grace_ends_at,
          }
        }),
        reminders,
        engine: manager
          ? { current_round: 1, cycle_ready: false, last_checked_at: new Date().toISOString() }
          : null,
        last_job_runs: manager
          ? [{ job_kind: 'generation', completed_at: new Date().toISOString() }]
          : [],
      }
      return respond(workspace)
    }
    if (rpc === 'get_contribution_obligation') {
      const d = details.get(b.target)
      return d && own(d.obligation)
        ? respond(d)
        : respond({ message: 'Obligation access denied' }, 403)
    }
    if (rpc === 'dismiss_contribution_reminder') {
      reminders = reminders.filter((r) => r.id !== b.target)
      return respond(null)
    }
    if (base.fixture.state.role !== 'owner')
      return respond({ message: 'Group permission required' }, 403)
    if (rpc === 'refresh_contribution_deadlines') return respond(7)
    const o = obligations.find((o) => o.id === b.target)!
    const d = details.get(o.id)!
    if (rpc === 'record_verified_contribution') {
      if (b.amount_minor > o.remaining_minor)
        return respond({ message: 'Receipt exceeds the remaining balance' }, 400)
      const principal = Math.min(b.amount_minor, o.principal_remaining_minor),
        fee = b.amount_minor - principal
      o.principal_verified_minor += principal
      o.fee_verified_minor += fee
      d.payments.push({
        id: id(++seq),
        principal_minor: principal,
        fee_minor: fee,
        payment_method: b.payment_method,
        external_reference: b.external_reference,
        evidence_note: b.evidence_note,
        verified_at: new Date().toISOString(),
        verified_by: accountId,
      })
      refresh(o)
      return respond(id(seq))
    }
    if (rpc === 'adjust_contribution_obligation') {
      d.adjustments.push({
        id: id(++seq),
        kind: b.adjustment_kind,
        amount_minor: b.amount_minor,
        extended_due_at: b.extended_due_at,
        reason: b.reason,
        created_at: new Date().toISOString(),
        created_by: accountId,
      })
      if (b.adjustment_kind === 'fee_waiver') o.fee_waived_minor += b.amount_minor
      else if (b.adjustment_kind === 'extension') {
        o.due_at = b.extended_due_at
        o.grace_ends_at = b.extended_due_at
        o.local_due_date = new Date(new Date(b.extended_due_at).getTime() + 8 * 3600000)
          .toISOString()
          .slice(0, 10)
      } else {
        o.status = b.adjustment_kind === 'waiver' ? 'waived' : 'cancelled'
        o.remaining_minor = 0
        o.due_minor = o.verified_minor
        return respond(id(seq))
      }
      refresh(o)
      return respond(id(seq))
    }
    return respond(null)
  })
  return { ...base, obligations, details, groupId: id(1) }
}
