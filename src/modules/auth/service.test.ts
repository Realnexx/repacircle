import { beforeEach, describe, it, expect, vi } from 'vitest'
const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  resend: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ requireClient: () => ({ auth }) }))
import {
  registerAccount,
  loginAccount,
  requestPasswordRecovery,
  resetPassword,
  resendConfirmation,
  googleSignIn,
  logoutAccount,
  safeReturnPath,
  signupRedirect,
} from './service'
beforeEach(() => {
  vi.resetAllMocks()
  for (const method of Object.values(auth))
    method.mockResolvedValue({ data: { user: { id: 'user' } }, error: null })
})
describe('authentication commands', () => {
  it('registers with the production confirmation URL and only name metadata', async () => {
    await registerAccount('user@example.test', 'long-password', 'Maria Cruz')
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.test',
      password: 'long-password',
      options: { emailRedirectTo: signupRedirect, data: { full_name: 'Maria Cruz' } },
    })
  })
  it('propagates invalid credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') })
    await expect(loginAccount('user@example.test', 'bad')).rejects.toThrow(
      'Invalid login credentials',
    )
  })
  it('uses the recovery route and supports updating a password', async () => {
    await requestPasswordRecovery('user@example.test')
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.test', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    await resetPassword('new-long-password')
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-long-password' })
  })
  it('resends confirmation without changing its destination', async () => {
    await resendConfirmation('user@example.test')
    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'user@example.test',
      options: { emailRedirectTo: signupRedirect },
    })
  })
  it('uses a dedicated optional Google callback', async () => {
    await googleSignIn()
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })
  it('revokes refresh sessions globally on logout', async () => {
    expect(await logoutAccount()).toBeNull()
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })
  it('clears the local session and reports remote revocation failure', async () => {
    auth.signOut.mockResolvedValueOnce({ error: new Error('offline') })
    expect(await logoutAccount()).toContain('Other sessions could not be revoked')
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
  })
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/login', '/register?x=1', null])(
    'rejects unsafe or looping return paths %s',
    (value) => expect(safeReturnPath(value)).toBe('/organizations'),
  )
})
