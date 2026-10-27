import { test, expect } from '@playwright/test'
import { mockSupabase } from './fixtures/supabase'
test.use({ baseURL: 'http://127.0.0.1:5174' })
for (const theme of ['light', 'dark'])
  test(`registration fits the viewport and clearly identifies the active tab in ${theme} mode`, async ({
    page,
  }, info) => {
    await mockSupabase(page, { confirmed: false, complete: false })
    await page.addInitScript((t) => localStorage.setItem('repacircle-theme', t), theme)
    const sizes =
      info.project.name === 'mobile'
        ? [
            { width: 390, height: 844 },
            { width: 375, height: 667 },
            { width: 320, height: 640 },
            { width: 768, height: 1024 },
          ]
        : [
            { width: 1366, height: 768 },
            { width: 1280, height: 720 },
            { width: 1024, height: 768 },
            { width: 820, height: 768 },
          ]
    for (const size of sizes) {
      await page.setViewportSize(size)
      await page.goto('/register')
      await expect(
        page.getByRole('heading', { name: 'Build something together.', exact: true }),
      ).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const nav = page.getByRole('navigation', { name: 'Account access', exact: true }),
        selected = nav.getByRole('link', { name: 'Create account', exact: true }),
        other = nav.getByRole('link', { name: 'Sign in', exact: true })
      await expect(selected).toHaveAttribute('aria-current', 'page')
      await expect(other).not.toHaveAttribute('aria-current', 'page')
      const colors = await nav.evaluate((el) => {
        const active = el.querySelector('[aria-current="page"]')!,
          inactive = el.querySelector('a:not([aria-current="page"])')!
        return {
          active: getComputedStyle(active).backgroundColor,
          inactive: getComputedStyle(inactive).backgroundColor,
        }
      })
      expect(colors.active).not.toBe(colors.inactive)
      await expect(
        page.getByRole('button', { name: 'Continue with Google', exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${theme} ${size.width}: horizontal overflow`,
      ).toBe(true)
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
        `${theme} ${size.width}×${size.height}: vertical overflow`,
      ).toBe(true)
      const back = await page
        .getByRole('link', { name: '← Back to RepaCircle', exact: true })
        .boundingBox()
      expect(back!.y + back!.height).toBeLessThanOrEqual(size.height)
      await page.screenshot({
        path: info.outputPath(`register-${theme}-${size.width}-${size.height}.png`),
        fullPage: true,
      })
    }
    await page
      .getByRole('navigation', { name: 'Account access' })
      .getByRole('link', { name: 'Sign in', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible()
    await expect(
      page
        .getByRole('navigation', { name: 'Account access' })
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await page
      .getByRole('navigation', { name: 'Account access' })
      .getByRole('link', { name: 'Create account', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Build something together.', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Email address', { exact: true }).fill('layout@example.test')
    await page.getByLabel('Password', { exact: true }).fill('short')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByText('Enter your full name.', { exact: true })).toBeVisible()
    await expect(page.getByText('Use at least 12 characters.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Create account', exact: true }).scrollIntoViewIfNeeded()
    const submit = await page
      .getByRole('button', { name: 'Create account', exact: true })
      .boundingBox()
    expect(submit!.y + submit!.height).toBeLessThanOrEqual(sizes.at(-1)!.height)
  })
