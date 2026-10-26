import { requireClient } from '@/lib/api/client'
export const signupRedirect = 'https://repacircle.vercel.app/register'
export function safeReturnPath(value: unknown) {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !/^\/(login|register|reset-password|forgot-password|auth\/callback)(\/|\?|$)/.test(value)
    ? value
    : '/organizations'
}
export async function registerAccount(email: string, password: string, fullName: string) {
  const result = await requireClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: signupRedirect, data: { full_name: fullName } },
  })
  if (result.error) throw result.error
  return result.data
}
export async function loginAccount(email: string, password: string) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}
export async function requestPasswordRecovery(email: string) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}
export async function resetPassword(password: string) {
  const { error } = await requireClient().auth.updateUser({ password })
  if (error) throw error
}
export async function changeEmail(email: string) {
  const { error } = await requireClient().auth.updateUser(
    { email },
    { emailRedirectTo: signupRedirect },
  )
  if (error) throw error
}
export async function resendConfirmation(email: string) {
  const { error } = await requireClient().auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: signupRedirect },
  })
  if (error) throw error
}
export async function googleSignIn() {
  const { error } = await requireClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}
export async function logoutAccount() {
  const client = requireClient()
  const { error } = await client.auth.signOut({ scope: 'global' })
  if (error) {
    const { error: localError } = await client.auth.signOut({ scope: 'local' })
    if (localError) throw new Error('Sign-out failed. Close this browser and try again.')
    return 'Signed out on this device. Other sessions could not be revoked; retry when connected.'
  }
  return null
}
