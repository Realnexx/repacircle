import { test, expect } from '@playwright/test'
import { mockRepa } from './fixtures/repa'
import { login, accountId, organizationA } from './fixtures/supabase'
import { defaultConfig } from '../src/modules/repa/config'
import type { RepaBundle } from '../src/modules/repa/service'
test.use({ baseURL: 'http://127.0.0.1:5174' })
test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('repacircle-theme', theme),
    info.project.name === 'mobile' ? 'dark' : 'light',
  )
})
const groupId = '90000000-0000-4000-8000-000000000001'
const versionId = '91000000-0000-4000-8000-000000000001'
function seedGroup(active = false): RepaBundle {
  const c = defaultConfig(organizationA)
  c.basic.name = 'Enrollment Circle'
  c.basic.visibility = 'organization'
  c.contribution.amount_minor = 10000
  c.reward.unit_cost_minor = 20000
  c.membership.terms =
    'All contributions, deadlines and member policies are disclosed and accepted.'
  c.membership.invitation_rule = 'members_can_request'
  return {
    group: {
      id: groupId,
      organization_id: organizationA,
      name: c.basic.name,
      description: 'Membership management',
      image_path: '',
      visibility: 'organization',
      currency: 'PHP',
      mechanism: 'rotating',
      start_date: c.basic.start_date,
      status: active ? 'active' : 'enrollment_open',
      revision: 1,
      latest_version_id: versionId,
      accepted_version_id: active ? versionId : null,
      created_at: new Date().toISOString(),
    },
    configuration: c,
    accepted_configuration: active ? c : null,
    versions: [
      {
        id: versionId,
        version_number: 1,
        approval_status: active ? 'approved' : 'pending',
        change_summary: 'Initial rules',
        changes: [],
        changed_by: accountId,
        approved_by: active ? accountId : null,
        effective_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
    members: active
      ? [
          { user_id: accountId, name: 'Maria Cruz', role: 'member', slot: 1, consented: true },
          {
            user_id: '30000000-0000-4000-8000-000000000002',
            name: 'Staff Member',
            role: 'member',
            slot: 2,
            consented: true,
          },
        ]
      : [],
    my_consent: null,
    can_manage: true,
    checks: [],
  }
}
test('email invitation, join request, approval and complete agreement acceptance', async ({
  page,
}, info) => {
  const { groups, fixture } = await mockRepa(page)
  groups.set(groupId, seedGroup())
  await login(page)
  await page.goto(`/organizer/groups/${groupId}#members`)
  await page.getByRole('button', { name: 'Invite member', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Invite a group member' })
  await dialog.getByLabel('Email address', { exact: true }).fill('maria@example.test')
  await dialog.getByRole('button', { name: 'Create secure invitation' }).click()
  const link = await dialog.getByLabel('Secure group invitation link').inputValue()
  expect(link).toContain('/groups/join#')
  await dialog.getByRole('button', { name: 'Send invitation email' }).click()
  await expect(page.getByText('Invitation email accepted by the delivery provider.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  fixture.state.role = 'member'
  await page.goto(link)
  await page
    .getByLabel('Message to the organizer')
    .fill('I agree to review the full terms before joining.')
  await page.getByRole('button', { name: 'Request to join group' }).click()
  await expect(page).toHaveURL(/\/member\/repa\/.+#members$/)
  await expect(
    page.getByRole('table', { name: 'REPA group members' }).getByText('pending', { exact: true }),
  ).toBeVisible()
  fixture.state.role = 'owner'
  await page.goto(`/organizer/groups/${groupId}/requests`)
  await page.getByRole('button', { name: 'Review request', exact: true }).click()
  await page.getByLabel('Review reason').fill('Verified invitation and available member slot.')
  await page.getByRole('button', { name: 'Confirm request decision' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.goto(`/organizer/groups/${groupId}#members`)
  await page
    .getByLabel('Refund and exit policy', { exact: true })
    .fill(
      'All recorded obligations remain preserved, and any refund or exit is reviewed by the organizer.',
    )
  await page
    .getByLabel('Dispute process', { exact: true })
    .fill(
      'Contact the organizer with evidence; unresolved disputes may be escalated to the organization owner.',
    )
  await page
    .getByLabel('Privacy notice', { exact: true })
    .fill(
      'Personal information is restricted to authorized administration and the member’s own financial records.',
    )
  await page.getByLabel('I confirm these policies are ready for member acceptance.').check()
  await page.getByRole('button', { name: 'Publish policies for this version' }).click()
  await expect(page.getByRole('button', { name: 'Accept this rules version' })).toBeDisabled()
  await page.getByLabel(/I have reviewed and accept version/).check()
  await page.getByRole('button', { name: 'Accept this rules version' }).click()
  await expect(page.getByText(/Your acceptance is preserved for this version/)).toBeVisible()
  await page.getByRole('button', { name: 'View member profile', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Member profile' })
      .getByRole('heading', { name: 'Maria Cruz', exact: true }),
  ).toBeVisible()
  const drawer = await page.getByRole('dialog', { name: 'Member profile' }).boundingBox()
  expect(drawer!.y).toBeLessThanOrEqual(17)
  expect(drawer!.y + drawer!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await page.screenshot({ path: info.outputPath('member-profile.png') })
})
test('suspension preserves member history and outstanding contributions block removal', async ({
  page,
}, info) => {
  const { groups } = await mockRepa(page)
  groups.set(groupId, seedGroup(true))
  await login(page)
  await page.goto(`/organizer/groups/${groupId}#members`)
  const row = page.getByRole('row').filter({ has: page.getByText('Staff Member', { exact: true }) })
  await row.getByRole('button', { name: 'Change membership status' }).click()
  await page.getByLabel('New membership status').selectOption('suspended')
  await page
    .getByLabel('Membership change reason')
    .fill('Temporary suspension while the organizer reviews the account.')
  await page
    .getByLabel('I understand this change does not cancel or erase financial obligations.')
    .check()
  await page.getByRole('button', { name: 'Confirm membership change' }).click()
  await expect(row.getByText('suspended', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Change membership status' }).click()
  await page.getByLabel('New membership status').selectOption('removed')
  await page
    .getByLabel('Membership change reason')
    .fill('Attempt removal while financial obligations remain outstanding.')
  await page
    .getByLabel('I understand this change does not cancel or erase financial obligations.')
    .check()
  await page.getByRole('button', { name: 'Confirm membership change' }).click()
  await expect(
    page.getByText('Outstanding contributions must be settled; history cannot be erased.'),
  ).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Membership activity history', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('membership-suspension.png'), fullPage: true })
})
test('group link survives sign-in and an expired link is rejected', async ({ page }) => {
  const { groups, membership } = await mockRepa(page)
  groups.set(groupId, seedGroup())
  const id = '92000000-0000-4000-8000-000000000001'
  const token = 'b'.repeat(64)
  membership.invitations.set(id, {
    id,
    token,
    group_id: groupId,
    email: 'maria@example.test',
    max_uses: 1,
    use_count: 0,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    revoked_at: null,
  })
  await page.goto(`/groups/join#id=${id}&token=${token}`)
  await expect(page.getByRole('heading', { name: 'Join a REPA group' })).toBeVisible()
  await login(page)
  await expect(page).toHaveURL(/\/groups\/join$/)
  await expect(page.getByRole('heading', { name: 'Enrollment Circle', exact: true })).toBeVisible()
  membership.invitations.get(id)!.expires_at = '2020-01-01T00:00:00Z'
  await page.reload()
  await expect(
    page.getByText('Invitation is invalid, expired or revoked.', { exact: true }),
  ).toBeVisible()
})

test('replacement requires agreement and both consents while retaining the outgoing member', async ({
  page,
}, info) => {
  const { groups, membership } = await mockRepa(page)
  const bundle = seedGroup(true)
  const outgoing = '30000000-0000-4000-8000-000000000002'
  bundle.members = [
    { user_id: outgoing, name: 'Outgoing Member', role: 'member', slot: 2, consented: true },
    {
      user_id: '30000000-0000-4000-8000-000000000003',
      name: 'Existing Recipient',
      role: 'member',
      slot: 1,
      consented: true,
    },
    { user_id: accountId, name: 'Maria Cruz', role: 'member', slot: null, consented: false },
  ]
  groups.set(groupId, bundle)
  membership.statuses.set(groupId + ':' + accountId, 'pending')
  membership.policies.set(versionId, {
    id: '93000000-0000-4000-8000-000000000001',
    version_id: versionId,
    refund_exit_policy:
      'Earlier obligations remain recorded; voluntary replacement transfers only accepted future commitments.',
    dispute_process:
      'Contact the organizer and escalate disputes with supporting records to the organization owner.',
    privacy_notice:
      'Members can read their own financial history and authorized staff can administer the group.',
    published_at: new Date().toISOString(),
  })
  await login(page)
  await page.goto(`/organizer/groups/${groupId}#members`)
  await page.getByRole('combobox', { name: 'Outgoing member', exact: true }).selectOption(outgoing)
  await page.getByLabel('Incoming pending member').selectOption(accountId)
  await page.getByLabel('Transfer from future round').fill('2')
  await page
    .getByLabel('Replacement reason', { exact: true })
    .fill('A voluntary replacement before the next monthly contribution round.')
  await page.getByRole('button', { name: 'Propose replacement', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Complete accepted replacement' })).toBeDisabled()
  membership.replacements[0].outgoing_accepted_at = new Date().toISOString()
  await page.getByLabel(/I have reviewed and accept version/).check()
  await page.getByRole('button', { name: 'Accept this rules version' }).click()
  await expect(page.getByText(/Your acceptance is preserved for this version/)).toBeVisible()
  await page.getByRole('button', { name: 'Review transfer consent' }).click()
  await page.getByRole('button', { name: 'I accept this replacement transfer' }).click()
  await page.getByRole('button', { name: 'Complete accepted replacement' }).click()
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByText('Outgoing Member', { exact: true }) })
      .getByText('withdrawn', { exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByText('Maria Cruz', { exact: true }) })
      .getByText('active', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('replacement · completed', { exact: false })).toBeVisible()
  await page.screenshot({ path: info.outputPath('controlled-replacement.png'), fullPage: true })
})
