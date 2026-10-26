import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, it, expect, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
const state = vi.hoisted(() => ({
  session: null as Session | null,
  allowed: false,
  verified: true,
  status: 'active',
  mfa: false,
  aal: 'aal2',
  mode: 'connected',
  error: null as string | null,
}))
vi.mock('@/modules/auth/session', () => ({
  useSession: () => ({ session: state.session, loading: false, error: null }),
}))
vi.mock('@/app/providers/access', () => ({
  useAccess: () => ({
    loading: false,
    error: null,
    verified: state.verified,
    accountStatus: state.status,
    requiresMfa: state.mfa,
    aal: state.aal,
    can: () => state.allowed,
  }),
}))
vi.mock('@/lib/validation/env', () => ({
  environment: {
    get mode() {
      return state.mode
    },
    get error() {
      return state.error
    },
  },
}))
import { PermissionGuard } from './permission-guard'
afterEach(() => {
  cleanup()
  Object.assign(state, {
    session: null,
    allowed: false,
    verified: true,
    status: 'active',
    mfa: false,
    aal: 'aal2',
    mode: 'connected',
    error: null,
  })
})
function signIn() {
  state.session = { user: { id: 'account', email_confirmed_at: '2026-01-01' } } as Session
}
function mount() {
  render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <PermissionGuard role="organizer">
              <h1>Private content</h1>
            </PermissionGuard>
          }
        />
        <Route path="/login" element={<h1>Login</h1>} />
        <Route path="/verify-email" element={<h1>Verify email</h1>} />
        <Route path="/security" element={<h1>MFA</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}
it('redirects unauthenticated users to login', () => {
  mount()
  expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument()
})
it('denies a member without the operation permission', () => {
  signIn()
  mount()
  expect(screen.getByRole('heading', { name: 'Access not permitted' })).toBeInTheDocument()
  expect(screen.queryByText('Private content')).not.toBeInTheDocument()
})
it('allows the server-derived operation permission', () => {
  signIn()
  state.allowed = true
  mount()
  expect(screen.getByText('Private content')).toBeInTheDocument()
})
it('enforces email verification', () => {
  signIn()
  state.verified = false
  mount()
  expect(screen.getByText('Verify email')).toBeInTheDocument()
})
it('enforces MFA for privileged users', () => {
  signIn()
  state.mfa = true
  state.aal = 'aal1'
  mount()
  expect(screen.getByText('MFA')).toBeInTheDocument()
})
it('denies suspended accounts even with a role permission', () => {
  signIn()
  state.allowed = true
  state.status = 'suspended'
  mount()
  expect(
    screen.getByText('This account is suspended. Contact the platform operator.'),
  ).toBeInTheDocument()
  expect(screen.queryByText('Private content')).not.toBeInTheDocument()
})
it('allows labeled setup shells but fails closed on invalid configuration', () => {
  state.mode = 'setup'
  mount()
  expect(screen.getByText('Private content')).toBeInTheDocument()
  cleanup()
  state.error = 'Invalid configuration'
  mount()
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid configuration')
})
