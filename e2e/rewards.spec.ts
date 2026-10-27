import { test, expect } from '@playwright/test'
import { mockRewards } from './fixtures/rewards'
import { login, organizationA } from './fixtures/supabase'
import { defaultConfig } from '../src/modules/repa/config'
test.use({ baseURL: 'http://127.0.0.1:5174' })
test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('repacircle-theme', theme),
    info.project.name === 'mobile' ? 'dark' : 'light',
  )
})
test('custom attributes support conditional fields and private file uploads', async ({ page }) => {
  const f = await mockRewards(page)
  await login(page)
  await page.goto('/organizer/rewards/new')
  await expect(page.getByRole('heading', { name: 'Create reward', exact: true })).toBeVisible()
  await page.getByLabel('Reward name *', { exact: true }).fill('Custom equipment')
  await page
    .getByRole('combobox', { name: 'Reward category', exact: true })
    .selectOption({ label: 'Community experiences' })
  await page.getByLabel('Estimated price per unit *', { exact: true }).fill('100')
  await page.getByLabel('Estimated price per unit *', { exact: true }).blur()
  await page.getByLabel('Delivery / fulfillment method *', { exact: true }).fill('Supplier pickup')
  await page.getByRole('button', { name: 'Add custom reward field', exact: true }).click()
  await page.getByLabel('Field key', { exact: true }).fill('custom_certificate')
  await page.getByLabel('Label', { exact: true }).fill('Product certificate')
  await page.getByRole('combobox', { name: 'Field type', exact: true }).selectOption('file')
  await page.getByLabel('Product certificate', { exact: true }).setInputFiles({
    name: 'certificate.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Verified product specification'),
  })
  await expect(page.getByRole('button', { name: 'View uploaded file', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add custom reward field', exact: true }).click()
  await page.getByLabel('Field key', { exact: true }).nth(1).fill('custom_pickup')
  await page.getByLabel('Label', { exact: true }).nth(1).fill('Pickup instructions')
  await page
    .getByRole('combobox', { name: 'Show only when field equals', exact: true })
    .nth(1)
    .selectOption('custom_certificate')
  await page.getByLabel('Equals value', { exact: true }).fill('show')
  await expect(page.getByLabel('Pickup instructions', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Publish reward', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Custom equipment', exact: true })).toBeVisible()
  const saved = [...f.items.values()].find((i) => i.name === 'Custom equipment')!
  expect(saved.configuration.values.custom_certificate).toMatch(new RegExp(`^${organizationA}/`))
})
for (const kind of ['cash', 'physical_product', 'digital_product', 'service', 'custom', 'mixed']) {
  test(`${kind}: create, price, publish and inspect reward`, async ({ page }, info) => {
    await page.addInitScript(
      (theme) => localStorage.setItem('repacircle-theme', theme),
      info.project.name === 'mobile' ? 'dark' : 'light',
    )
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const f = await mockRewards(page)
    await login(page)
    await page.goto('/organizer/rewards')
    await expect(page.getByRole('heading', { name: 'Reward catalog', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Create reward', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Create reward', exact: true })).toBeVisible()
    await page.getByRole('combobox', { name: 'Reward type', exact: true }).selectOption(kind)
    await expect(page.getByRole('combobox', { name: 'Reward type', exact: true })).toHaveValue(kind)
    await page
      .getByRole('combobox', { name: 'Reward category', exact: true })
      .selectOption({ label: 'Community experiences' })
    await expect(page.getByRole('combobox', { name: 'Reward type', exact: true })).toHaveValue(kind)
    await page.getByLabel('Reward name *', { exact: true }).fill(`Community ${kind}`)
    await expect(page.getByRole('combobox', { name: 'Reward type', exact: true })).toHaveValue(kind)
    if (kind === 'mixed') {
      for (const name of ['Cash reserve', 'Laptop bundle']) {
        await page.getByRole('button', { name: 'Add component', exact: true }).click()
        await page.getByRole('button', { name: `Select ${name}`, exact: true }).click()
      }
    } else {
      const input = page.getByLabel(
        kind === 'cash' ? 'Payout amount per unit *' : 'Estimated price per unit *',
        { exact: true },
      )
      await input.fill('100.01')
      await input.blur()
    }
    await page
      .getByLabel(kind === 'cash' ? 'Transfer method *' : 'Delivery / fulfillment method *', {
        exact: true,
      })
      .fill('Verified fulfillment and recipient confirmation')
    await page.getByRole('button', { name: 'Publish reward', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: `Community ${kind}`, exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Immutable version history' })).toBeVisible()
    expect([...f.items.values()].find((i) => i.name === `Community ${kind}`)?.status).toBe(
      'published',
    )
    expect(errors).toEqual([])
    if (kind === 'mixed')
      await page.screenshot({ path: info.outputPath('mixed-reward.png'), fullPage: true })
  })
}
test('template attributes, gallery, edits and reusable templates', async ({ page }, info) => {
  const f = await mockRewards(page)
  await login(page)
  await page.goto('/organizer/rewards')
  await page.getByRole('link', { name: 'Refrigerator', exact: true }).click()
  await page.getByLabel('Reward name *', { exact: true }).fill('Refrigerator package')
  await page.getByLabel('Estimated price per unit *', { exact: true }).fill('100.00')
  await page.getByLabel('Estimated price per unit *', { exact: true }).blur()
  await page
    .getByLabel('Delivery / fulfillment method *', { exact: true })
    .fill('Supplier delivery')
  await page.getByLabel('Capacity (liters) *', { exact: true }).fill('300')
  await page.getByLabel('Add reward image', { exact: true }).setInputFiles({
    name: 'fridge.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVXsAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByLabel('Image 1 description')).toBeVisible()
  await page.getByLabel('Image 1 description').fill('Refrigerator front')
  await page.getByRole('button', { name: 'Publish reward', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Refrigerator package', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'View Refrigerator front', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click()
  const old = [...f.items.values()].find(
    (i) => i.name === 'Refrigerator package',
  )!.current_version_id
  await page.getByRole('link', { name: 'Edit reward', exact: true }).click()
  await page.getByLabel('Actual purchase / payout price per unit (optional)').fill('110.00')
  await page.getByLabel('Actual purchase / payout price per unit (optional)').blur()
  await page.getByRole('button', { name: 'Publish reward', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Refrigerator package', exact: true }),
  ).toBeVisible()
  await page.getByRole('combobox', { name: 'View reward version', exact: true }).selectOption(old)
  await expect(page.getByText('Not yet known', { exact: true }).first()).toBeVisible()
  await page.getByLabel('Reusable template name').fill('Community refrigerator template')
  await page.getByRole('button', { name: 'Save as template', exact: true }).click()
  await expect(page.getByText('Reusable reward template created.', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('reward-gallery-details.png'), fullPage: true })
})
test('category builder, draft and per-round group assignments', async ({ page }, info) => {
  const f = await mockRewards(page)
  await login(page)
  await page.goto('/organizer/rewards')
  await page.getByRole('button', { name: 'Manage categories', exact: true }).click()
  await page.getByLabel('Category name', { exact: true }).fill('Community equipment')
  await page.getByRole('button', { name: 'Save category', exact: true }).click()
  await page.getByRole('link', { name: 'Create reward', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create reward', exact: true })).toBeVisible()
  await page.getByLabel('Reward name *', { exact: true }).fill('Equipment draft')
  await page
    .getByRole('combobox', { name: 'Reward category', exact: true })
    .selectOption({ label: 'Community equipment' })
  await page.getByRole('button', { name: 'Save reward draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Equipment draft', exact: true })).toBeVisible()
  const c = defaultConfig(organizationA)
  c.basic.name = 'Catalog group'
  c.contribution.amount_minor = 20000
  c.reward.unit_cost_minor = 10000
  c.membership.terms = 'All members accept the configured terms and commitments.'
  await page.evaluate(async (configuration) => {
    await fetch('http://127.0.0.1:54321/rest/v1/rpc/save_repa_draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_organization: configuration.basic.organization_id,
        group_id: null,
        expected_revision: 0,
        configuration,
        change_summary: 'Initial rules',
        effective_date: new Date().toISOString(),
      }),
    })
  }, c)
  const group = [...f.groups.values()][0]
  await page.goto(`/organizer/groups/${group.group.id}#rewards`)
  for (const name of ['Cash reserve', 'Laptop bundle']) {
    await page.getByRole('button', { name: 'Add reward assignment', exact: true }).click()
    await page.getByRole('button', { name: `Select ${name}`, exact: true }).click()
  }
  await page
    .getByRole('combobox', { name: 'Assignment scope', exact: true })
    .nth(0)
    .selectOption('round')
  await page
    .getByRole('combobox', { name: 'Assignment scope', exact: true })
    .nth(1)
    .selectOption('round')
  await page.getByLabel('Payout round', { exact: true }).nth(1).fill('2')
  await page.getByRole('button', { name: 'Preview reward funding', exact: true }).click()
  await expect(page.getByText('Funding assumptions balance', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save reward plan', exact: true }).click()
  await expect(
    page.getByText(
      'Reward plan saved in a new rules version. Fresh member agreement is required.',
      { exact: true },
    ),
  ).toBeVisible()
  expect([...f.plans.values()][0].required_minor).toBe('26000')
  await page.screenshot({ path: info.outputPath('group-reward-plan.png'), fullPage: true })
})
