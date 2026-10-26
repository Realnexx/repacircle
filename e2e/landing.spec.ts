import { expect, test } from '@playwright/test'

test('sticky landing navigation reaches sections without covering their headings', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  if (testInfo.project.name === 'mobile') {
    await expect(page.locator('.public-header')).toHaveCSS('height', '68px')
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    const menu = page.getByRole('dialog', { name: 'Explore RepaCircle' })
    await menu.getByRole('link', { name: 'FAQs' }).click()
    await expect(menu).not.toBeVisible()
  } else {
    await page
      .getByRole('navigation', { name: 'Page sections' })
      .getByRole('link', { name: 'FAQs' })
      .click()
  }
  await expect(page).toHaveURL(/#questions$/)
  const header = await page.locator('.public-header').boundingBox()
  const heading = await page
    .getByRole('heading', { name: 'Good questions. Clear answers.' })
    .boundingBox()
  expect(header!.y).toBeLessThanOrEqual(1)
  expect(heading!.y).toBeGreaterThan(header!.y + header!.height)
})

test('role selector and FAQ explain the current product', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Treasurers', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Treasurers', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    page.getByRole('heading', { name: 'Start with a clear view of your responsibilities.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Be part of something you build together.' }),
  ).toBeVisible()
  await page.getByText('Does RepaCircle hold or move my money?', { exact: true }).click()
  await expect(
    page.getByText(
      'RepaCircle does not currently process payments, hold funds, or distribute payouts.',
      { exact: false },
    ),
  ).toBeVisible()
})

test('scroll reveals survive route changes and reduced-motion changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.locator('.landing-page')).toHaveClass(/landing-motion-enabled/)
  const content = page.locator('.landing-role-panel')
  await content.scrollIntoViewIfNeeded()
  await expect(content).toHaveClass(/aos-animate/)
  await expect(content).toHaveCSS('opacity', '1')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.landing-page')).not.toHaveClass(/landing-motion-enabled/)
  await expect(page.locator('.landing-final-cta')).toHaveCSS('opacity', '1')
  await page.getByRole('link', { name: 'Create your account', exact: true }).click()
  await expect(page).toHaveURL(/\/register$/)
  await page.getByRole('link', { name: 'RepaCircle home' }).click()
  await expect(page.getByRole('heading', { name: /Small contributions/ })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.landing-page')).toHaveClass(/landing-motion-enabled/)
  await page.locator('.landing-final-cta').scrollIntoViewIfNeeded()
  await expect(page.locator('.landing-final-cta')).toHaveClass(/aos-animate/)
})
