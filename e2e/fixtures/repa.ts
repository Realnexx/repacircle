import type { Page } from '@playwright/test'
import { mockSupabase, accountId, organizationA } from './supabase'
import { calculateFunding, changeDiff } from '../../src/modules/repa/calculations'
import type { GroupConfig } from '../../src/modules/repa/config'
import type { RepaBundle, RepaGroup, RuleVersion } from '../../src/modules/repa/service'
import { mockMembership } from './membership'
export async function mockRepa(page: Page) {
  const fixture = await mockSupabase(page, { role: 'owner', mfa: true })
  const groups = new Map<string, RepaBundle>()
  let sequence = 0
  await page.route('http://127.0.0.1:54321/rest/v1/repa_groups*', async (route) => {
    await route.fulfill({
      json: [...groups.values()].map((b) => b.group),
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  })
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/*repa*', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON() as Record<string, unknown>
    fixture.state.calls.push({ path: '/rest/v1/rpc/' + rpc, body, query: '' })
    const respond = (json: unknown, status = 200) =>
      route.fulfill({ status, json, headers: { 'Access-Control-Allow-Origin': '*' } })
    if (rpc === 'save_repa_draft') {
      const c = body.configuration as GroupConfig
      const id = String(
        body.group_id ?? `60000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      )
      const old = groups.get(id)
      if (old && old.group.revision !== body.expected_revision)
        return respond({ message: 'Stale draft revision' }, 400)
      const revision = (old?.group.revision ?? 0) + 1
      const vid = `61000000-0000-4000-8000-${String(sequence * 100 + revision).padStart(12, '0')}`
      const group: RepaGroup = {
        id,
        organization_id: organizationA,
        name: c.basic.name,
        description: c.basic.description,
        image_path: c.basic.image_path,
        visibility: c.basic.visibility,
        currency: c.basic.currency,
        mechanism: c.mechanism,
        start_date: c.basic.start_date,
        status: old?.group.status ?? 'draft',
        revision,
        latest_version_id: vid,
        accepted_version_id: old?.group.accepted_version_id ?? null,
        created_at: old?.group.created_at ?? new Date().toISOString(),
      }
      const version: RuleVersion = {
        id: vid,
        version_number: revision,
        approval_status: 'pending',
        change_summary: String(body.change_summary),
        changes: changeDiff(old?.configuration ?? {}, c),
        changed_by: accountId,
        approved_by: null,
        effective_date: String(body.effective_date),
        created_at: new Date().toISOString(),
      }
      groups.set(id, {
        group,
        configuration: c,
        accepted_configuration: old?.accepted_configuration ?? null,
        versions: [version, ...(old?.versions ?? [])],
        checks: [],
        members: (old?.members ?? []).map((m) => ({ ...m, consented: false })),
        my_consent: null,
        can_manage: true,
      })
      return respond(id)
    }
    const id = String(body.target ?? '')
    const bundle =
      groups.get(id) ??
      [...groups.values()].find((b) => b.group.latest_version_id === body.target_version)
    if (!bundle) return respond({ message: 'Group unavailable' }, 404)
    if (rpc === 'get_repa_group')
      return respond({ ...bundle, can_manage: fixture.state.role === 'owner' })
    if (rpc === 'set_repa_member') {
      if (body.assigned)
        bundle.members.push({
          user_id: String(body.member_user),
          name: body.member_user === accountId ? 'Maria Cruz' : 'Staff Member',
          role: 'member',
          slot: bundle.members.length + 1,
          consented: false,
        })
      else bundle.members = bundle.members.filter((m) => m.user_id !== body.member_user)
      return respond(null)
    }
    if (rpc === 'consent_repa_rules') {
      bundle.my_consent = {
        accepted_at: new Date().toISOString(),
        custom_values: body.custom_values as Record<string, unknown>,
      }
      bundle.members = bundle.members.map((m) =>
        m.user_id === accountId ? { ...m, consented: true } : m,
      )
      return respond(null)
    }
    if (rpc === 'check_repa_activation') {
      const report = calculateFunding(bundle.configuration)
      if (bundle.members.length !== bundle.configuration.contribution.member_count)
        report.errors.push('Assign exactly the configured members.')
      if (bundle.members.some((m) => !m.consented))
        report.errors.push('Each member must accept this exact version.')
      report.valid = report.errors.length === 0
      return respond({
        ...report,
        assigned_members: bundle.members.length,
        member_consents: bundle.members.filter((m) => m.consented).length,
        eligible_approvers: 1,
      })
    }
    if (rpc === 'activate_repa_group') {
      if (
        !body.accepted_terms ||
        bundle.members.some((m) => !m.consented) ||
        !calculateFunding(bundle.configuration).valid
      )
        return respond({ message: 'Activation blocked' }, 400)
      bundle.group.status = 'active'
      bundle.group.accepted_version_id = bundle.group.latest_version_id
      bundle.accepted_configuration = bundle.configuration
      bundle.versions[0].approval_status = 'approved'
      bundle.versions[0].approved_by = accountId
      return respond(null)
    }
    if (rpc === 'transition_repa_group') {
      bundle.group.status = body.new_status as RepaGroup['status']
      return respond(null)
    }
    return respond(null)
  })
  const membership = await mockMembership(page, groups, fixture)
  return { fixture, groups, membership }
}
