import { test, expect, type Page } from '@playwright/test'
import { mockRepa } from './fixtures/repa'
import { login } from './fixtures/supabase'

test.use({ baseURL: 'http://127.0.0.1:5174' })
const goToStep = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'REPA wizard steps' })
    .getByRole('button', { name: new RegExp(name) })
    .click()
const field = (page: Page, path: string) => page.locator(`[data-field-path="${path}"]`)

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('repacircle-theme', theme),
    info.project.name === 'mobile' ? 'dark' : 'light',
  )
})

test('group name validates inline, focuses on Next and clears after correction', async ({
  page,
}, info) => {
  await mockRepa(page)
  await login(page)
  await page.goto('/organizer/groups/new')
  const name = page.getByLabel('Group name *', { exact: true })
  await expect(name).toBeVisible()
  await expect(field(page, 'basic.name').getByRole('alert')).toHaveCount(0)
  await name.fill('A')
  await name.blur()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(name).toHaveAccessibleDescription('Enter a group name of at least two characters.')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Basic information', exact: true })).toBeVisible()
  await expect(name).toBeFocused()
  await page.screenshot({ path: info.outputPath('inline-group-name.png'), fullPage: true })
  await page.getByRole('button', { name: /Group name: Enter a group name/ }).click()
  await expect(name).toBeFocused()
  await name.fill('Community savings')
  await expect(name).toHaveAttribute('aria-invalid', 'false')
  await expect(field(page, 'basic.name').getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'REPA mechanism', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('invalid draft values point to their fields while incomplete drafts remain saveable', async ({
  page,
}) => {
  const { groups } = await mockRepa(page)
  await login(page)
  await page.goto('/organizer/groups/new')
  await expect(page.getByLabel('Group name *', { exact: true })).toBeVisible()
  await goToStep(page, 'Contributions')
  const count = page.getByLabel('Number of members *', { exact: true })
  await count.fill('1')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(count).toBeFocused()
  await expect(field(page, 'contribution.member_count').getByRole('alert')).toHaveText(
    'Enter a value at least 2.',
  )
  expect(groups.size).toBe(0)
  await count.fill('2')
  const amount = page.getByLabel('Contribution per member per round / minimum *', { exact: true })
  await amount.fill('12.345')
  await amount.blur()
  await expect(amount).toHaveAttribute('aria-invalid', 'true')
  await expect(field(page, 'contribution.amount_minor').getByRole('alert')).toHaveCount(1)
  await amount.fill('50.00')
  await amount.blur()
  await expect(field(page, 'contribution.amount_minor').getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/organizer\/groups\/[a-f0-9-]+\/edit$/)
  expect(groups.size).toBe(1)
  expect([...groups.values()][0].configuration.membership.terms).toBe('')
  expect([...groups.values()][0].configuration.reward.unit_cost_minor).toBe(0)
})

test('review links return to rotation and grouped payment errors', async ({ page }) => {
  await mockRepa(page)
  await login(page)
  await page.goto('/organizer/groups/new')
  await expect(page.getByLabel('Group name *', { exact: true })).toBeVisible()
  await goToStep(page, 'Payment methods')
  await page.getByRole('checkbox', { name: 'cash', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'cash', exact: true })).toBeFocused()
  await expect(field(page, 'payment.methods').getByRole('alert')).toContainText(
    'Select unique payment methods.',
  )
  await page.getByRole('checkbox', { name: 'cash', exact: true }).check()
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  const order = page.getByLabel('Fixed rotation order (comma-separated member slots) *', {
    exact: true,
  })
  await order.fill('1, 1')
  await order.blur()
  await expect(order).toHaveAccessibleDescription(
    'Example: 1, 2, 3. Every configured member slot must appear exactly once. Provide every member slot exactly once.',
  )
  await goToStep(page, 'Review & activation')
  await page
    .getByRole('button', { name: /Fixed rotation order.*Provide every member slot/ })
    .click()
  await expect(order).toBeFocused()
  await order.fill('1, 2')
  await expect(field(page, 'rotation_order_input').getByRole('alert')).toHaveCount(0)
})

test('calendar, reviewed fee and repeating-row errors appear beside their controls', async ({
  page,
}, info) => {
  await mockRepa(page)
  await login(page)
  await page.goto('/organizer/groups/new')
  await expect(page.getByLabel('Group name *', { exact: true })).toBeVisible()
  await goToStep(page, 'Contributions')
  await page.getByLabel('Contribution per member per round / minimum *', { exact: true }).fill('50')
  await page.getByLabel('Contribution per member per round / minimum *', { exact: true }).blur()
  await page.getByLabel('Contribution frequency *', { exact: true }).selectOption('weekdays')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(field(page, 'schedule.weekdays').getByRole('alert')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Monday', exact: true }).check()
  await expect(field(page, 'schedule.weekdays').getByRole('alert')).toHaveCount(0)
  await page.getByLabel('Late payment policy *', { exact: true }).selectOption('fee')
  await page
    .getByRole('button', { name: 'Configure legally reviewed late fee', exact: true })
    .click()
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByLabel('Fixed late fee *', { exact: true })).toBeFocused()
  await expect(
    field(page, 'contribution.late_fee_rule.review_reference').getByRole('alert'),
  ).toContainText('legal review reference')
  await page.getByLabel('Legal review reference *', { exact: true }).fill('review-2026-01')
  await expect(
    field(page, 'contribution.late_fee_rule.review_reference').getByRole('alert'),
  ).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('inline-contribution-rules.png'), fullPage: true })
  await page.getByLabel('Contribution policy *', { exact: true }).selectOption('configurable')
  await page.getByRole('button', { name: 'Add member contributions row', exact: true }).click()
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(field(page, 'contribution.member_amounts.0.slot').getByRole('alert')).toBeVisible()
  await expect(
    field(page, 'contribution.member_amounts.0.amount_minor').getByRole('alert'),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('required custom reward values have inline messages and block the reward step until corrected', async ({
  page,
}) => {
  await mockRepa(page)
  await login(page)
  await page.goto('/organizer/groups/new')
  await expect(page.getByLabel('Group name *', { exact: true })).toBeVisible()
  await goToStep(page, 'Rewards')
  await page.getByLabel('Disclosed cost per unit / cash reward *', { exact: true }).fill('100')
  await page.getByLabel('Disclosed cost per unit / cash reward *', { exact: true }).blur()
  await page.getByRole('button', { name: 'Add custom reward field', exact: true }).click()
  await page.getByLabel('Field key', { exact: true }).fill('custom_sponsor')
  await page.getByLabel('Label', { exact: true }).fill('Sponsor')
  await page.getByRole('checkbox', { name: 'Required', exact: true }).check()
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  const sponsor = page.getByLabel('Sponsor *', { exact: true })
  await expect(sponsor).toBeFocused()
  await expect(sponsor).toHaveAccessibleDescription('Sponsor is required.')
  await sponsor.fill('Community partners')
  await expect(sponsor).toHaveAttribute('aria-invalid', 'false')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Contributions', exact: true })).toBeVisible()
})
