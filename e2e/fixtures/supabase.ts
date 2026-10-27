import type { Page } from '@playwright/test'
export const accountId = '30000000-0000-4000-8000-000000000001'
export const organizationA = '31000000-0000-4000-8000-000000000001'
export const organizationB = '31000000-0000-4000-8000-000000000002'
const factorId = '32000000-0000-4000-8000-000000000001'
export async function mockSupabase(
  page: Page,
  options: {
    role?: 'owner' | 'member' | 'treasurer'
    complete?: boolean
    confirmed?: boolean
    mfa?: boolean
    admin?: boolean
  } = {},
) {
  const state = {
    role: options.role ?? 'member',
    confirmed: options.confirmed ?? true,
    mfa: options.mfa ?? false,
    enrolled: false,
    failRefresh: false,
    profileName: 'Maria Cruz',
    complete: options.complete ?? true,
    personal: {
      first_name: 'Maria',
      middle_name: '',
      last_name: 'Cruz',
      extension_name: '',
      gender: 'prefer_not_to_say',
      region_code: '130000000',
      region_name: 'NCR',
      province_code: '',
      province_name: '',
      city_code: '137404000',
      city_name: 'Quezon City',
      barangay_code: '137404001',
      barangay_name: 'Alicia',
      street_address: '12 Test Street',
      postal_code: '',
    } as Record<string, string>,
    avatar: null as string | null,
    invitations: [] as Record<string, unknown>[],
    calls: [] as { path: string; body: Record<string, unknown>; query: string }[],
    accepted: false,
    created: false,
    admin: options.admin ?? false,
    staffRole: 'member',
    otherStatus: 'active',
    supportEmail: 'support@example.test',
    scopes: [] as { id: string; name: string; organization_id: string }[],
    assignments: [] as { id: string; group_id: string; user_id: string; role: string }[],
  }
  const user = () => ({
    id: accountId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'maria@example.test',
    email_confirmed_at: state.confirmed ? '2026-10-01T00:00:00Z' : undefined,
    confirmed_at: state.confirmed ? '2026-10-01T00:00:00Z' : undefined,
    created_at: '2026-10-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: state.profileName },
    identities: [],
    factors:
      state.mfa || state.enrolled
        ? [
            {
              id: factorId,
              factor_type: 'totp',
              status: state.mfa ? 'verified' : 'unverified',
              friendly_name: 'Authenticator',
              created_at: '2026-10-01T00:00:00Z',
              updated_at: '2026-10-01T00:00:00Z',
            },
          ]
        : [],
  })
  const token = () => {
    const payload = {
      sub: accountId,
      aud: 'authenticated',
      role: 'authenticated',
      aal: state.mfa ? 'aal2' : 'aal1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      session_id: '33000000-0000-4000-8000-000000000001',
    }
    return `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test-signature`
  }
  const session = () => ({
    access_token: token(),
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: user(),
  })
  const permissions = () =>
    state.role === 'owner' && state.mfa
      ? [
          'organization.read',
          'organization.update',
          'organization.staff.manage',
          'organization.archive',
          'organization.audit.read',
          'organization.members.read',
          'groups.manage',
          'group.members.manage',
          'group.rules.manage',
          'payments.verify',
          'payouts.manage',
          'reports.organization.read',
        ]
      : state.role === 'treasurer' && state.mfa
        ? ['organization.read', 'treasurer.workspace']
        : ['organization.read']
  const organization = (id: string, name: string) => ({
    id,
    name,
    description: `${name} community`,
    logo_path: null,
    status: 'active',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  })
  await page.route('https://psgc.gitlab.io/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const data =
      path === '/api/regions/'
        ? [
            { code: '130000000', name: 'NCR' },
            { code: '040000000', name: 'CALABARZON' },
          ]
        : path.includes('/provinces')
          ? path.includes('040000000')
            ? [{ code: '042100000', name: 'Cavite' }]
            : []
          : path.includes('barangays')
            ? [{ code: '137404001', name: 'Alicia' }]
            : [{ code: '137404000', name: 'Quezon City', provinceCode: false }]
    await route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    let body: Record<string, unknown> = {}
    try {
      body = request.postDataJSON() ?? {}
    } catch {
      /* Binary media upload. */
    }
    state.calls.push({ path, body, query: url.search })
    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        },
        body: JSON.stringify(data),
      })
    if (request.method() === 'OPTIONS') return respond({})
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token' && state.failRefresh)
        return respond({ code: 'refresh_token_not_found', msg: 'Refresh Token Not Found' }, 400)
      if (body.password === 'wrong-password')
        return respond({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
      return respond(session())
    }
    if (path === '/auth/v1/signup') return respond({ user: user(), session: null })
    if (path === '/auth/v1/recover' || path === '/auth/v1/resend' || path === '/auth/v1/logout')
      return respond({})
    if (path === '/auth/v1/user') return respond(user())
    if (path === '/auth/v1/factors') {
      state.enrolled = true
      return respond({
        id: factorId,
        type: 'totp',
        totp: {
          qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
          secret: 'LOCALTESTAUTHENTICATORSECRET',
          uri: 'otpauth://totp/test',
        },
      })
    }
    if (path.endsWith('/challenge'))
      return respond({ id: 'challenge-id', expires_at: Math.floor(Date.now() / 1000) + 60 })
    if (path.endsWith('/verify')) {
      state.mfa = true
      return respond(session())
    }
    if (path.startsWith('/auth/v1/factors/') && request.method() === 'DELETE') {
      state.enrolled = false
      return respond({ id: factorId })
    }
    if (path === '/rest/v1/repa_groups') return respond([])
    if (path === '/rest/v1/profiles')
      return respond({
        id: accountId,
        email: 'maria@example.test',
        ...Object.fromEntries(
          Object.entries(state.personal).map(([key, value]) => [
            key,
            state.complete || key === 'gender' ? value : '',
          ]),
        ),
        profile_completed_at: state.complete ? '2026-10-01T00:00:00Z' : null,
        full_name: state.profileName,
        mobile_number: state.complete ? '09123456789' : '',
        address: '12 Test Street, Alicia, Quezon City, NCR',
        avatar_path: state.avatar,
        account_status: 'active',
        notification_settings: { email: true, push: true },
        created_at: '2026-10-01T00:00:00Z',
        updated_at: new Date().toISOString(),
      })
    if (path === '/rest/v1/organizations')
      return respond([
        organization(organizationA, 'Circle A'),
        organization(organizationB, 'Circle B'),
        ...(state.created
          ? [organization('31000000-0000-4000-8000-000000000003', 'New Circle')]
          : []),
      ])
    if (path === '/rest/v1/organization_invitations') return respond(state.invitations)
    if (path === '/rest/v1/group_scopes') return respond(state.scopes)
    if (path === '/rest/v1/group_role_assignments') return respond(state.assignments)
    if (path === '/rest/v1/platform_settings') return respond({ support_email: state.supportEmail })
    if (path.startsWith('/rest/v1/rpc/')) {
      const rpc = path.split('/').at(-1)
      if (rpc === 'get_access_context')
        return respond({
          account_status: 'active',
          verified: state.confirmed,
          requires_mfa: state.role !== 'member' || state.admin,
          aal: state.mfa ? 'aal2' : 'aal1',
          platform_permissions:
            state.admin && state.mfa
              ? [
                  'platform.accounts.manage',
                  'platform.settings.manage',
                  'platform.analytics.read',
                  'platform.support.resolve',
                  'platform.disputes.resolve',
                ]
              : [],
          organizations: [
            {
              id: organizationA,
              name: 'Circle A',
              role: state.role,
              status: 'active',
              permissions: permissions(),
              groups: [],
            },
            {
              id: organizationB,
              name: 'Circle B',
              role: 'member',
              status: 'active',
              permissions: ['organization.read'],
              groups: [],
            },
          ],
        })
      if (rpc === 'organization_directory')
        return respond([
          {
            user_id: accountId,
            full_name: state.profileName,
            email: state.role === 'owner' ? 'maria@example.test' : null,
            role: body.target === organizationA ? state.role : 'member',
            mfa_enrolled: state.mfa,
          },
          ...(state.role === 'owner'
            ? [
                {
                  user_id: '30000000-0000-4000-8000-000000000002',
                  full_name: 'Staff Member',
                  email: 'staff@example.test',
                  role: state.staffRole,
                  mfa_enrolled: true,
                },
              ]
            : []),
        ])
      if (rpc === 'set_organization_member_role') {
        state.staffRole = String(body.new_role)
        return respond(null)
      }
      if (rpc === 'create_group_scope') {
        state.scopes.push({
          id: '35000000-0000-4000-8000-000000000001',
          name: String(body.scope_name),
          organization_id: String(body.target),
        })
        return respond('35000000-0000-4000-8000-000000000001')
      }
      if (rpc === 'assign_group_role') {
        state.assignments.push({
          id: '36000000-0000-4000-8000-000000000001',
          group_id: String(body.scope_id),
          user_id: String(body.member_user),
          role: String(body.assigned_role),
        })
        return respond(null)
      }
      if (rpc === 'platform_accounts')
        return respond([
          {
            id: accountId,
            email: 'maria@example.test',
            full_name: state.profileName,
            account_status: 'active',
            created_at: '2026-10-01T00:00:00Z',
          },
          {
            id: '30000000-0000-4000-8000-000000000002',
            email: 'staff@example.test',
            full_name: 'Staff Member',
            account_status: state.otherStatus,
            created_at: '2026-10-01T00:00:00Z',
          },
        ])
      if (rpc === 'set_account_status') {
        state.otherStatus = String(body.new_status)
        return respond(null)
      }
      if (rpc === 'platform_analytics')
        return respond({
          organizations: 2,
          accounts: 2,
          pending_invitations: state.invitations.length,
        })
      if (rpc === 'platform_organizations')
        return respond([
          organization(organizationA, 'Circle A'),
          organization(organizationB, 'Circle B'),
        ])
      if (rpc === 'update_platform_settings') {
        state.supportEmail = String(body.support_email)
        return respond(null)
      }
      if (rpc === 'save_personal_profile') {
        const details = body.details as Record<string, string>
        state.personal = { ...state.personal, ...details }
        state.profileName = [
          details.first_name,
          details.middle_name,
          details.last_name,
          details.extension_name,
        ]
          .filter(Boolean)
          .join(' ')
        state.complete = true
        state.avatar = details.avatar_path as string | null
        return respond(null)
      }
      if (rpc === 'create_organization_with_details') {
        state.created = true
        return respond('31000000-0000-4000-8000-000000000003')
      }
      if (rpc === 'create_organization_invitation') {
        const invite = {
          id: '34000000-0000-4000-8000-000000000001',
          organization_id: organizationA,
          email: body.invite_email,
          role: body.invite_role,
          expires_at: '2099-01-01T00:00:00Z',
          accepted_at: null,
          revoked_at: null,
          created_at: new Date().toISOString(),
        }
        state.invitations.push(invite)
        return respond({ ...invite, token: 'a'.repeat(64) })
      }
      if (rpc === 'revoke_organization_invitation') {
        for (const invite of state.invitations) invite.revoked_at = new Date().toISOString()
        return respond(null)
      }
      if (rpc === 'inspect_organization_invitation')
        return body.invitation_token === 'b'.repeat(64)
          ? respond(
              {
                code: '22023',
                message: 'Invitation is invalid, expired, revoked, or belongs to another email',
              },
              400,
            )
          : respond({
              organization_id: organizationA,
              organization_name: 'Circle A',
              role: 'member',
              accepted: state.accepted,
            })
      if (rpc === 'accept_organization_invitation') {
        state.accepted = true
        return respond(organizationA)
      }
      return respond(null)
    }
    if (path === '/storage/v1/object/sign/test.png' && request.method() === 'GET')
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=',
          'base64',
        ),
      })
    if (path.startsWith('/storage/v1/object/sign/'))
      return respond({ signedURL: '/object/sign/test.png?token=local-test' })
    if (path.startsWith('/storage/v1/object/')) return respond({ Key: 'avatars/test.png' })
    return respond({ message: `Unexpected mock endpoint ${path}` }, 404)
  })
  return { state, user, session }
}
export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill('maria@example.test')
  await page.getByLabel('Password', { exact: true }).fill('correct-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
