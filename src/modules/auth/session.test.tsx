import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mock.getSession,
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        mock.listener = callback
        return { data: { subscription: { unsubscribe: mock.unsubscribe } } }
      },
    },
  },
}))
import { SessionProvider, useSession } from './session'
function Probe() {
  const state = useSession()
  return (
    <>
      <span>{state.loading ? 'restoring' : (state.session?.user.id ?? 'signed out')}</span>
      <span>{state.recovery ? 'recovery session' : 'normal session'}</span>
      {state.error && <span>{state.error}</span>}
    </>
  )
}
const valid = {
  user: { id: 'test-user' },
  expires_at: Math.floor(Date.now() / 1000) + 3600,
} as Session
function mount() {
  const client = new QueryClient()
  const view = render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
}
beforeEach(() => {
  mock.getSession.mockResolvedValue({ data: { session: valid }, error: null })
  mock.listener = null
  mock.unsubscribe.mockClear()
})
afterEach(cleanup)
it('restores a valid session and unsubscribes on unmount', async () => {
  const view = mount()
  expect(await screen.findByText('test-user')).toBeInTheDocument()
  view.unmount()
  expect(mock.unsubscribe).toHaveBeenCalled()
})
it('rejects an expired restored session', async () => {
  mock.getSession.mockResolvedValue({ data: { session: { ...valid, expires_at: 1 } }, error: null })
  mount()
  expect(await screen.findByText('signed out')).toBeInTheDocument()
})
it('handles restoration failure without exposing protected state', async () => {
  mock.getSession.mockRejectedValue(new Error('offline'))
  mount()
  expect(
    await screen.findByText('Unable to restore your session. Please sign in again.'),
  ).toBeInTheDocument()
  expect(screen.getByText('signed out')).toBeInTheDocument()
})
it('clears private cached data after sign-out and recognizes password recovery', async () => {
  const { client } = mount()
  await screen.findByText('test-user')
  client.setQueryData(['private-data'], { secret: true })
  act(() => mock.listener?.('PASSWORD_RECOVERY', valid))
  expect(screen.getByText('recovery session')).toBeInTheDocument()
  act(() => mock.listener?.('SIGNED_OUT', null))
  await waitFor(() => expect(client.getQueryData(['private-data'])).toBeUndefined())
  expect(screen.getByText('normal session')).toBeInTheDocument()
})
