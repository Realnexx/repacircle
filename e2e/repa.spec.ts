import { test, expect } from '@playwright/test'
import { mockRepa } from './fixtures/repa'
import { accountId, login } from './fixtures/supabase'
test.use({ baseURL: 'http://127.0.0.1:5174' })
for (const mechanism of ['rotating', 'random_draw', 'pooled_savings']) {
  test(`${mechanism}: wizard draft, review, member agreement and activation`, async ({
    page,
  }, info) => {
    test.setTimeout(60000)
    const browserErrors: string[] = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    await page.addInitScript(
      (theme) => localStorage.setItem('repacircle-theme', theme),
      info.project.name === 'mobile' ? 'dark' : 'light',
    )
    const { groups } = await mockRepa(page)
    await login(page)
    await page.goto('/organizer/groups')
    await page.getByRole('link', { name: 'Create REPA group', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Create REPA group', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Group name *', { exact: true }).fill('Community ' + mechanism)
    await page.getByRole('button', { name: 'Next step', exact: true }).click()
    await page.getByRole('radio', { name: mechanism.replaceAll('_', ' '), exact: true }).check()
    if (mechanism === 'pooled_savings') {
      const target = page.getByLabel('Pooled savings target *')
      await target.fill('200.00')
      await target.blur()
    }
    await page.getByRole('button', { name: 'Next step', exact: true }).click()
    await page.getByLabel('Disclosed cost per unit / cash reward *').fill('100.00')
    await page.getByLabel('Disclosed cost per unit / cash reward *').blur()
    if (mechanism === 'rotating') {
      await page.getByRole('button', { name: 'Add custom reward field', exact: true }).click()
      await page.getByLabel('Field key', { exact: true }).fill('custom_sponsor')
      await page.getByLabel('Label', { exact: true }).fill('Reward sponsor')
      await page.getByLabel('Reward sponsor', { exact: true }).fill('Community partners')
    }
    await page.getByRole('button', { name: 'Next step', exact: true }).click()
    await page.getByLabel('Contribution per member per round / minimum *').fill('50.00')
    await page.getByLabel('Contribution per member per round / minimum *').blur()
    await page.getByRole('button', { name: 'Next step', exact: true }).click()
    await page.getByRole('button', { name: 'Next step', exact: true }).click()
    if (mechanism === 'rotating') {
      const order = page.getByLabel('Fixed rotation order (comma-separated member slots) *')
      await order.fill('')
      await order.pressSequentially('2, 1')
      await expect(order).toHaveValue('2, 1')
    }
    await page.getByRole('button', { name: 'Next step', exact: true }).click()
    await page
      .getByLabel('Group terms and obligations *')
      .fill('Every member accepts the disclosed contribution, reward, schedule and payout rules.')
    await page.getByRole('button', { name: 'Next step', exact: true }).click()
    await expect(page.getByText('Funding assumptions balance', { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`repa-${mechanism}-wizard.png`), fullPage: true })
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page).toHaveURL(/\/organizer\/groups\/[a-f0-9-]+\/edit$/)
    await page.getByRole('button', { name: 'Run server activation checks', exact: true }).click()
    await expect(
      page.getByText('Assign exactly the configured members.', { exact: true }),
    ).toBeVisible()
    const id = [...groups.keys()][0]
    await page.goto(`/organizer/groups/${id}#members`)
    await page
      .getByLabel('Refund and exit policy', { exact: true })
      .fill(
        'Past contributions and obligations remain recorded. Any future exit must be approved by the organizer.',
      )
    await page
      .getByLabel('Dispute process', { exact: true })
      .fill(
        'Contact the organizer with evidence and escalate unresolved disputes to the organization owner.',
      )
    await page
      .getByLabel('Privacy notice', { exact: true })
      .fill(
        'Member information is used for group administration and access to personal financial history is restricted.',
      )
    await page.getByLabel('I confirm these policies are ready for member acceptance.').check()
    await page
      .getByRole('button', { name: 'Publish policies for this version', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: 'Published agreement policies' })).toBeVisible()
    await page.getByLabel('Organization member to enroll').selectOption(accountId)
    await page.getByRole('button', { name: 'Assign member', exact: true }).click()
    await expect(page.getByText('1 of 2 configured members.', { exact: false })).toBeVisible()
    await page
      .getByLabel('Organization member to enroll')
      .selectOption('30000000-0000-4000-8000-000000000002')
    await page.getByRole('button', { name: 'Assign member', exact: true }).click()
    groups.get(id)!.members.find((m) => m.user_id !== accountId)!.consented = true
    await page.getByLabel(/I have reviewed and accept version/).check()
    await page.getByRole('button', { name: 'Accept this rules version', exact: true }).click()
    await expect(page.getByText(/Your acceptance is preserved for this version/)).toBeVisible()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Run server activation checks', exact: true }).click()
    await expect(
      page.getByText('All server checks passed for the saved version.', { exact: true }),
    ).toBeVisible()
    await page.getByLabel(/I accept the financial assumptions/).check()
    await page.getByRole('button', { name: 'Review activation', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm activation', exact: true }).click()
    await expect(page.getByText('active', { exact: true })).toBeVisible()
    expect(groups.get(id)!.group.accepted_version_id).toBe(groups.get(id)!.group.latest_version_id)
    await page.getByRole('button', { name: 'Rules & funding', exact: true }).click()
    await expect(page.getByText(/Accepted rules are locked/)).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`repa-${mechanism}-overview.png`),
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Configuration history', exact: true }).click()
    await expect(page.getByText(/Version 1 · approved/)).toBeVisible()
    await page.screenshot({ path: info.outputPath(`repa-${mechanism}.png`), fullPage: true })
    expect(browserErrors).toEqual([])
  })
}
