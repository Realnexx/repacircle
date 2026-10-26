import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, it, expect, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
const state = vi.hoisted(() => ({
  session: null as Session | null,
  roles: [] as string[],
  mode: 'connected',
  error: null as string | null,
}))
vi.mock('@/modules/auth/session', () => ({
  useSession: () => ({ session: state.session, loading: false, error: null }),
}))
vi.mock('@/app/providers/access', () => ({
  useAccess: () => ({ roles: state.roles, loading: false, error: null }),
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
  state.session = null
  state.roles = []
  state.mode = 'connected'
  state.error = null
})
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
      </Routes>
    </MemoryRouter>,
  )
}
it('redirects unauthenticated configured users to login', () => {
  mount()
  expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument()
})
it('denies a signed-in member from organizer content', () => {
  state.session = { user: { id: 'member' } } as Session
  state.roles = ['member']
  mount()
  expect(screen.getByRole('heading', { name: 'Workspace access required' })).toBeInTheDocument()
  expect(screen.queryByText('Private content')).not.toBeInTheDocument()
})
it('allows the matching server-derived workspace role', () => {
  state.session = { user: { id: 'owner' } } as Session
  state.roles = ['organizer']
  mount()
  expect(screen.getByText('Private content')).toBeInTheDocument()
})
it('allows empty setup previews and blocks invalid configuration', () => {
  state.mode = 'setup'
  mount()
  expect(screen.getByText('Private content')).toBeInTheDocument()
  cleanup()
  state.error = 'Invalid configuration'
  mount()
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid configuration')
  expect(screen.queryByText('Private content')).not.toBeInTheDocument()
})
