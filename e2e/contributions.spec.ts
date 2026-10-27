import { test, expect } from '@playwright/test'
import { mockContributions } from './fixtures/contributions'
import { login } from './fixtures/supabase'
test.use({ baseURL: 'http://127.0.0.1:5174' })
test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('repacircle-theme', theme),
    info.project.name === 'mobile' ? 'dark' : 'light',
  )
})
test('wizard saves calendar selections and reviewed percentage fee terms', async ({ page }) => {
  const f = await mockContributions(page)
  await login(page)
  await page.goto('/organizer/groups/new')
  await expect(page.getByRole('heading', { name: 'Create REPA group', exact: true })).toBeVisible()
  await page.getByLabel('Group name *', { exact: true }).fill('Custom deadline group')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await page.getByLabel('Disclosed cost per unit / cash reward *', { exact: true }).fill('100')
  await page.getByLabel('Disclosed cost per unit / cash reward *', { exact: true }).blur()
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await page.getByLabel('Contribution per member per round / minimum *', { exact: true }).fill('50')
  await page.getByLabel('Contribution per member per round / minimum *', { exact: true }).blur()
  await page.getByLabel('Contribution frequency *', { exact: true }).selectOption('weekdays')
  await page.getByRole('checkbox', { name: 'Monday', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Thursday', exact: true }).check()
  await page.getByLabel('Contribution frequency *', { exact: true }).selectOption('monthly_dates')
  await page.getByRole('textbox', { name: /Specific monthly dates/ }).fill('15, 31')
  await page.getByRole('textbox', { name: /Specific monthly dates/ }).blur()
  await page.getByLabel('Contribution frequency *', { exact: true }).selectOption('custom_dates')
  const start = await page.getByLabel('Contribution start date *', { exact: true }).inputValue()
  const next = new Date(new Date(start + 'T00:00:00Z').getTime() + 7 * 86400000)
    .toISOString()
    .slice(0, 10)
  await page.getByRole('textbox', { name: /Custom contribution dates/ }).fill(start + '\n' + next)
  await page.getByRole('textbox', { name: /Custom contribution dates/ }).blur()
  await page.getByLabel('Late payment policy *', { exact: true }).selectOption('fee')
  await page
    .getByRole('button', { name: 'Configure legally reviewed late fee', exact: true })
    .click()
  await page.getByLabel('Reviewed late fee type *', { exact: true }).selectOption('percentage')
  await page.getByLabel('Late fee rate in basis points (100 = 1%) *', { exact: true }).fill('250')
  await page.getByLabel('Maximum late fee per obligation *', { exact: true }).fill('2.00')
  await page.getByLabel('Maximum late fee per obligation *', { exact: true }).blur()
  await page.getByLabel('Legal review reference *', { exact: true }).fill('review-record-test')
  await page.getByLabel('Legal reviewer *', { exact: true }).fill('Test legal reviewer')
  await page
    .getByLabel('Legal review date *', { exact: true })
    .fill(new Date().toISOString().slice(0, 10))
  await page
    .getByLabel('Member-facing late fee disclosure *', { exact: true })
    .fill('One capped fee on unpaid principal at grace expiry, rounded up to the next minor unit.')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/groups\/[a-f0-9-]+\/edit$/)
  const saved = f.fixture.state.calls
    .filter((call) => call.path.endsWith('save_repa_draft'))
    .at(-1)!.body.configuration as {
    schedule: { custom_dates: string[] }
    contribution: { late_fee_rule: { mode: string; cap_minor: number } }
  }
  expect(saved.schedule.custom_dates).toEqual([start, next])
  expect(saved.contribution.late_fee_rule).toMatchObject({ mode: 'percentage', cap_minor: 200 })
})
test('verified cash and GCash receipts settle one obligation and preserve payment history', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const f = await mockContributions(page)
  await login(page)
  await page.goto('/organizer/contributions')
  await expect(
    page.getByRole('heading', { name: 'Organizer collection dashboard', exact: true }),
  ).toBeVisible()
  const row = page
    .getByRole('table', { name: 'Contribution obligations', exact: true })
    .getByRole('row')
    .filter({ hasText: 'Maria Cruz' })
    .filter({ hasText: 'Round 1' })
  for (const [amount, method, reference] of [
    ['400.00', 'cash', 'cash-400'],
    ['600.00', 'gcash_manual', 'gcash-600'],
  ]) {
    await row.getByRole('button', { name: 'Record verified receipt', exact: true }).click()
    await page.getByLabel('Verified amount *', { exact: true }).fill(amount)
    await page.getByLabel('Verified amount *', { exact: true }).blur()
    await page
      .getByRole('combobox', { name: 'Verified payment method', exact: true })
      .selectOption(method)
    await page.getByLabel('Payment reference', { exact: true }).fill(reference)
    await page
      .getByLabel('Verification evidence', { exact: true })
      .fill('Verified receipt against its signed payment reference.')
    await page.getByRole('button', { name: 'Save verified receipt', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await expect(row.getByText('paid', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'History', exact: true }).click()
  await expect(
    page
      .getByRole('table', { name: 'Verified contribution history', exact: true })
      .getByRole('row'),
  ).toHaveCount(3)
  expect(f.obligations[0].remaining_minor).toBe(0)
  await page.screenshot({
    path: info.outputPath('verified-contribution-history.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Close history', exact: true }).click()
  await page.getByRole('button', { name: 'Run deadline checks', exact: true }).click()
  await expect(
    page.getByText('Deadline checks completed. Duplicate jobs are skipped.', { exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
test('organizer fee waiver and extension preserve original deadlines and audit history', async ({
  page,
}, info) => {
  const f = await mockContributions(page, { fee: true })
  await login(page)
  await page.goto('/organizer/contributions')
  await expect(
    page.getByRole('heading', { name: 'Organizer collection dashboard', exact: true }),
  ).toBeVisible()
  const row = page
    .getByRole('table', { name: 'Contribution obligations', exact: true })
    .getByRole('row')
    .filter({ hasText: 'Staff Member' })
    .filter({ hasText: 'Round 1' })
  await row.getByRole('button', { name: 'Adjust deadline or waiver', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Adjustment type', exact: true })
    .selectOption('fee_waiver')
  await page.getByLabel('Unpaid fee amount to waive').fill('5.00')
  await page
    .getByLabel('Adjustment explanation')
    .fill('Approved hardship waiver of the unpaid disclosed fee.')
  await page.getByRole('button', { name: 'Record adjustment', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const original = f.obligations[1].original_due_at
  await row.getByRole('button', { name: 'Adjust deadline or waiver', exact: true }).click()
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  await page.getByLabel('Extended payment deadline (Asia/Manila)').fill(date + 'T20:00')
  await page
    .getByLabel('Adjustment explanation')
    .fill('Approved member request for a documented two day extension.')
  await page.getByRole('button', { name: 'Record adjustment', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row.getByText('upcoming', { exact: true })).toBeVisible()
  expect(f.obligations[1].original_due_at).toBe(original)
  await row.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByText(/Approved hardship waiver/)).toBeVisible()
  await expect(page.getByText(/Approved member request/)).toBeVisible()
  await page.getByRole('button', { name: 'Close history', exact: true }).click()
  await page.getByRole('button', { name: 'Round 1', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Round 1 collection details', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('contribution-round-detail.png'), fullPage: true })
})
test('members see only their obligations, calendar, reminders and history', async ({
  page,
}, info) => {
  const f = await mockContributions(page, { member: true })
  await login(page)
  await page.goto('/member/my-contributions')
  await expect(
    page.getByRole('heading', { name: 'Your contribution obligations', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Contribution obligations', exact: true }).getByRole('row'),
  ).toHaveCount(3)
  await expect(
    page.getByRole('button', { name: 'Record verified receipt', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run deadline checks', exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByText('Staff Member', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dismiss reminder', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Deadline reminders', exact: true })).toHaveCount(
    0,
  )
  await page
    .getByRole('combobox', { name: 'Obligation status', exact: true })
    .selectOption('upcoming')
  await expect(
    page.getByRole('table', { name: 'Contribution obligations', exact: true }).getByRole('row'),
  ).toHaveCount(2)
  await page.getByRole('button', { name: 'Clear obligation filters', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Contribution calendar', exact: true }),
  ).toBeVisible()
  expect(f.fixture.state.calls.some((c) => c.path.endsWith('get_contribution_workspace'))).toBe(
    true,
  )
  await page.screenshot({
    path: info.outputPath('member-contribution-calendar.png'),
    fullPage: true,
  })
})
