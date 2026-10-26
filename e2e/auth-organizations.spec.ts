import { test, expect } from '@playwright/test'
import { mockSupabase, login, accountId, organizationB } from './fixtures/supabase'
test.use({ baseURL: 'http://127.0.0.1:5174' })

test('incomplete profiles cannot skip setup and can continue after saving personal information', async ({
  page,
}) => {
  const fixture = await mockSupabase(page, { complete: false })
  await login(page)
  await expect(page).toHaveURL(/\/profile\/setup$/)
  await page.goto('/member/dashboard')
  await expect(page).toHaveURL(/\/profile\/setup$/)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('This field is required.').first()).toBeVisible()
  expect(fixture.state.calls.some((call) => call.path.endsWith('/save_personal_profile'))).toBe(
    false,
  )
  await page.getByLabel('First name', { exact: true }).fill('Maria')
  await page.getByLabel('Last name', { exact: true }).fill('Cruz')
  await page.getByLabel('Region', { exact: true }).selectOption('130000000')
  await expect(page.getByLabel('Province', { exact: true })).toBeDisabled()
  await page.getByLabel('City / municipality').selectOption('137404000')
  await page.getByLabel('Barangay', { exact: true }).selectOption('137404001')
  await page.getByLabel('House / building, street / purok').fill('12 Test Street')
  await page.getByLabel('Mobile number', { exact: true }).fill('09123456789')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/organizations$/)
  expect(fixture.state.complete).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeVisible()
})

test('changing a PSGC parent clears dependent address selections', async ({ page }) => {
  await mockSupabase(page, { complete: false })
  await login(page)
  await expect(page).toHaveURL(/\/profile\/setup$/)
  await page.getByLabel('Region', { exact: true }).selectOption('130000000')
  await page.getByLabel('City / municipality').selectOption('137404000')
  await page.getByLabel('Barangay', { exact: true }).selectOption('137404001')
  await page.getByLabel('Region', { exact: true }).selectOption('040000000')
  await expect(page.getByLabel('Province', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('City / municipality')).toHaveValue('')
  await expect(page.getByLabel('Barangay', { exact: true })).toHaveValue('')
})

for (const existing of [false, true]) {
  test(`Google from ${existing ? 'sign up signs in an existing account' : 'login creates a new account and requires setup'}`, async ({
    page,
  }) => {
    const fixture = await mockSupabase(page, { complete: existing })
    await page.route('http://127.0.0.1:54321/auth/v1/authorize**', async (route) => {
      const url = new URL(route.request().url())
      expect(url.searchParams.get('provider')).toBe('google')
      expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:5174/auth/callback')
      const session = fixture.session()
      await route.fulfill({
        status: 302,
        headers: {
          location: `http://127.0.0.1:5174/auth/callback#access_token=${session.access_token}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer`,
        },
      })
    })
    await page.goto(existing ? '/register' : '/login')
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page).toHaveURL(existing ? /\/organizations$/ : /\/profile\/setup$/)
    expect(fixture.state.calls.filter((call) => call.path === '/auth/v1/signup')).toHaveLength(0)
  })
}
test('registration preserves confirmation destination and handles verified email callback', async ({
  page,
}) => {
  const fixture = await mockSupabase(page, { confirmed: false, complete: false })
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Maria Cruz')
  await page.getByLabel('Email address').fill('maria@example.test')
  await page.getByLabel('Password', { exact: true }).fill('long-test-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Check your email')
  expect(fixture.state.calls.find((call) => call.path === '/auth/v1/signup')?.query).toContain(
    encodeURIComponent('https://repacircle.vercel.app/register'),
  )
  fixture.state.confirmed = true
  const session = fixture.session()
  await page.goto(
    `/register#access_token=${session.access_token}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=signup`,
  )
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Complete your personal information' }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/profile\/setup$/)
})
test('login restores the session, restricts organizer pages and securely logs out', async ({
  page,
}) => {
  const fixture = await mockSupabase(page)
  await login(page)
  await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeVisible()
  await page.goto('/organizer/dashboard')
  await expect(page.getByRole('heading', { name: 'Access not permitted' })).toBeVisible()
  await page.getByLabel('User menu', { exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(
    fixture.state.calls.some(
      (call) => call.path === '/auth/v1/logout' && call.query.includes('scope=global'),
    ),
  ).toBe(true)
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)
})
test('unverified users are routed to email verification', async ({ page }) => {
  await mockSupabase(page, { confirmed: false })
  await login(page)
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible()
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/verify-email$/)
})
test('expired refresh sessions cannot reopen protected profiles', async ({ page }) => {
  const fixture = await mockSupabase(page)
  await login(page)
  await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeVisible()
  fixture.state.failRefresh = true
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const data = JSON.parse(localStorage.getItem(key)!)
        data.expires_at = 1
        localStorage.setItem(key, JSON.stringify(data))
      }
    }
  })
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)
})
test('password recovery uses a recovery session and updates the password', async ({ page }) => {
  const fixture = await mockSupabase(page)
  await page.goto('/forgot-password')
  await page.getByLabel('Email address').fill('maria@example.test')
  await page.getByRole('button', { name: 'Send recovery link' }).click()
  await expect(page.getByRole('status')).toContainText('If an account exists')
  const session = fixture.session()
  await page.goto(
    `/reset-password#access_token=${session.access_token}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery`,
  )
  await page.getByLabel('New password').fill('new-long-password')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByRole('status')).toContainText('Password updated')
  expect(
    fixture.state.calls.some(
      (call) => call.path === '/auth/v1/user' && call.body.password === 'new-long-password',
    ),
  ).toBe(true)
})
test('organization switching is constrained to memberships and persists', async ({
  page,
}, testInfo) => {
  const fixture = await mockSupabase(page)
  await login(page)
  await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeVisible()
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click()
  const region =
    testInfo.project.name === 'mobile'
      ? page.getByRole('dialog', { name: 'Workspace navigation' })
      : page.locator('aside.sidebar')
  await region.getByRole('combobox', { name: 'Current organization' }).selectOption(organizationB)
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Close navigation' }).click()
  await expect(page.getByRole('heading', { name: 'Circle B', exact: true, level: 2 })).toBeVisible()
  expect(
    fixture.state.calls.some(
      (call) => call.path.endsWith('/organization_directory') && call.body.target === organizationB,
    ),
  ).toBe(true)
  await page.reload()
  expect(
    await page.evaluate((id) => localStorage.getItem(`repacircle-organization:${id}`), accountId),
  ).toBe(organizationB)
})
test('profile changes are saved through the validated server command', async ({ page }) => {
  const fixture = await mockSupabase(page)
  await login(page)
  await page.goto('/profile')
  await page.getByLabel('Last name', { exact: true }).fill('Updated')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('heading', { name: 'Maria Updated' })).toBeVisible()
  expect(
    fixture.state.calls.find((call) => call.path.endsWith('/save_personal_profile'))?.body,
  ).not.toHaveProperty('account_status')
})
test('MFA enrollment upgrades the session before privileged organization creation', async ({
  page,
}) => {
  const fixture = await mockSupabase(page, { role: 'owner' })
  await login(page)
  await page.goto('/organizer/dashboard')
  await expect(page).toHaveURL(/\/security$/)
  await page.getByRole('button', { name: 'Enroll authenticator' }).click()
  await page.getByLabel('Six-digit authenticator code').fill('123456')
  await page.getByRole('button', { name: 'Verify authenticator' }).click()
  await expect(page.getByText('Second factor verified for this session.')).toBeVisible()
  expect(fixture.state.mfa).toBe(true)
  await page.goto('/organizations')
  await page.getByRole('button', { name: 'Create organization', exact: true }).click()
  const wizard = page.getByRole('dialog', { name: 'Create organization' })
  await wizard.getByLabel('Organization name', { exact: true }).fill('New Circle')
  await wizard.getByLabel('Description', { exact: true }).fill('A new tenant')
  await wizard.getByRole('button', { name: 'Review organization' }).click()
  await wizard.getByRole('button', { name: 'Create organization', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New Circle', exact: true })).toBeVisible()
})
test('owners can create and revoke secure staff invitations', async ({ page }) => {
  const fixture = await mockSupabase(page, { role: 'owner', mfa: true })
  await login(page)
  const panel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Staff invitations', exact: true }) })
  await panel.getByLabel('Email address', { exact: true }).fill('invited@example.test')
  await panel.getByRole('button', { name: 'Create invitation' }).click()
  await expect(panel.getByLabel('Secure invitation link')).toHaveValue(/\/invite#id=/)
  expect(
    fixture.state.calls.some((call) => call.path.endsWith('/create_organization_invitation')),
  ).toBe(true)
  await panel.getByRole('button', { name: 'Revoke', exact: true }).click()
  await expect(panel.getByRole('cell', { name: 'Revoked', exact: true })).toBeVisible()
})
test('valid invitation acceptance and expired invitation errors', async ({ page }) => {
  const fixture = await mockSupabase(page)
  await login(page)
  await page.goto(`/invite#id=34000000-0000-4000-8000-000000000001&token=${'a'.repeat(64)}`)
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Invitation accepted')
  expect(fixture.state.accepted).toBe(true)
  await page.goto(`/invite#id=34000000-0000-4000-8000-000000000001&token=${'b'.repeat(64)}`)
  await expect(page.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('expired')
})

test('owner role dialogs and group assignments use scoped commands', async ({ page }) => {
  const fixture = await mockSupabase(page, { role: 'owner', mfa: true })
  await login(page)
  await page.getByRole('button', { name: 'Change role', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Change staff role' })
  await dialog.getByLabel('Role', { exact: true }).selectOption('treasurer')
  await dialog.getByRole('button', { name: 'Save role' }).click()
  await expect(page.getByRole('cell', { name: 'treasurer', exact: true })).toBeVisible()
  const scope = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Group-scoped access', exact: true }) })
  await scope.getByLabel('New scope name').fill('Assigned Circle')
  await scope.getByRole('button', { name: 'Create access scope' }).click()
  await scope
    .getByLabel('Group scope', { exact: true })
    .selectOption('35000000-0000-4000-8000-000000000001')
  await scope.getByLabel('Role', { exact: true }).selectOption('treasurer')
  await scope
    .getByLabel('Member', { exact: true })
    .selectOption('30000000-0000-4000-8000-000000000002')
  await scope.getByRole('button', { name: 'Assign group role' }).click()
  await expect(scope.getByRole('cell', { name: 'treasurer', exact: true })).toBeVisible()
  expect(
    fixture.state.calls.find((call) => call.path.endsWith('/assign_group_role'))?.body,
  ).toMatchObject({
    target: '31000000-0000-4000-8000-000000000001',
    scope_id: '35000000-0000-4000-8000-000000000001',
  })
})

test('private avatar upload uses the user directory and signed image access', async ({ page }) => {
  const fixture = await mockSupabase(page)
  await login(page)
  await page.goto('/profile')
  await page.getByLabel('Avatar (private)', { exact: false }).setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('img', { name: 'Your profile avatar' })).toBeVisible()
  expect(fixture.state.avatar).toMatch(new RegExp(`^${accountId}/`))
  expect(
    fixture.state.calls.some((call) =>
      call.path.startsWith(`/storage/v1/object/avatars/${accountId}/`),
    ),
  ).toBe(true)
})

test('platform administration manages account status and platform preferences', async ({
  page,
}) => {
  const fixture = await mockSupabase(page, { admin: true, mfa: true })
  await login(page)
  await page.goto('/platform-admin/users')
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'staff@example.test', exact: true }) })
  await row.getByRole('button', { name: 'Suspend', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Change account access?' })
    .getByRole('button', { name: 'Confirm', exact: true })
    .click()
  await expect(row.getByRole('cell', { name: 'suspended', exact: true })).toBeVisible()
  await page.goto('/platform-admin/settings')
  await page.getByLabel('Support email').fill('help@example.test')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect.poll(() => fixture.state.supportEmail).toBe('help@example.test')
  await page.goto('/platform-admin/dashboard')
  await expect(page.getByText('Active organizations', { exact: true })).toBeVisible()
})
