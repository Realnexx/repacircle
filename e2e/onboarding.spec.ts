import { test, expect } from '@playwright/test'
import { workspacePaths, publicPages, authPages, workspaces } from '../src/app/router/definitions'

test('navigates from landing to organization setup', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Small contributions/ })).toBeVisible()
  await page.getByRole('link', { name: 'Set up your community' }).click()
  await expect(page.getByRole('heading', { name: 'Your community’s next chapter.' })).toBeVisible()
  await expect(page.getByText('Layout preview', { exact: true })).toBeVisible()
})

test('all public, account and workspace routes render without browser errors or overflow', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  for (const path of [
    ...publicPages.map((p) => p.path),
    ...authPages.map((p) => p.path),
    ...workspacePaths,
    '/organizations',
  ]) {
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      path,
    ).toBe(true)
    if (workspacePaths.includes(path))
      await expect(page.getByText('Layout preview', { exact: true })).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('theme persists across navigation and reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/organizer/dashboard')
  await page.getByRole('button', { name: 'Use dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Use light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('shared filters, pagination and confirmation dialog work', async ({ page }) => {
  await page.goto('/design-system')
  await expect(page.getByRole('cell', { name: 'Community gathering' })).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('cell', { name: 'Organizer workshop' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search sample activities' }).fill('orientation')
  await expect(page.getByRole('cell', { name: 'Member orientation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await page.getByRole('button', { name: 'Confirm action', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm sample action?' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm action', exact: true })).toBeFocused()
})

test('each workspace has working desktop or mobile navigation', async ({ page }, testInfo) => {
  for (const workspace of workspaces) {
    await page.goto(`/${workspace.role}/dashboard`)
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Open navigation' }).click()
    const navigation =
      testInfo.project.name === 'mobile'
        ? page.getByRole('dialog', { name: 'Workspace navigation' })
        : page.locator('aside.sidebar')
    const target = workspace.pages[1]
    await navigation.getByRole('link', { name: target.title, exact: true }).click()
    await expect(page.getByRole('heading', { name: target.title, exact: true })).toBeVisible()
    if (testInfo.project.name === 'mobile')
      await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).not.toBeVisible()
  }
  await page.goto('/organizer/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('workspace-light.png'), fullPage: true })
  await page.getByRole('button', { name: 'Use dark mode' }).click()
  await page.screenshot({ path: testInfo.outputPath('workspace-dark.png'), fullPage: true })
})

test('narrow mobile and tablet pages fit their viewport', async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/platform-admin/dashboard', '/design-system', '/login']) {
      await page.goto(path)
      await expect(page.locator('h1')).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${width}px ${path}`,
      ).toBe(true)
    }
  }
})

test('account forms validate and explain disconnected setup', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await page.getByLabel('Email address').fill('test@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Connect Supabase')
})
