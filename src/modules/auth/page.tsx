import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { environment } from '@/lib/validation/env'
import { useSession } from './session'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/forms/controls'
import { errorMessage } from '@/lib/api/errors'
const schema = z.object({ email: z.email('Enter a valid email address.'), password: z.string() })
export default function AuthPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useSession()
  const mode = location.pathname
  const register = mode === '/register'
  const forgot = mode === '/forgot-password'
  const reset = mode === '/reset-password'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const form = useForm<{ email: string; password: string }>({
    resolver: zodResolver(schema),
    defaultValues: { email: session?.user.email ?? '', password: '' },
  })
  const title = register
    ? 'Build something together.'
    : forgot
      ? 'Forgot your password?'
      : reset
        ? 'Choose a new password.'
        : 'Welcome back.'
  const submit = form.handleSubmit(async (values) => {
    setError('')
    setMessage('')
    if (!supabase) {
      setError(environment.error ?? 'Connect Supabase to enable account access. See Help & setup.')
      return
    }
    if (!forgot && values.password.length < 8) {
      form.setError('password', { message: 'Use at least 8 characters.' })
      return
    }
    if (reset && !session) {
      setError('Open the password recovery link from your email first.')
      return
    }
    setBusy(true)
    try {
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${locationOrigin()}/reset-password`,
        })
        if (error) throw error
        setMessage('If an account exists for this email, you’ll receive a recovery link.')
      } else if (reset) {
        const { error } = await supabase.auth.updateUser({ password: values.password })
        if (error) throw error
        setMessage('Password updated. You can return to your workspace.')
        form.resetField('password')
      } else if (register) {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { emailRedirectTo: `${locationOrigin()}/login` },
        })
        if (error) throw error
        setMessage('Check your email to confirm your account, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword(values)
        if (error) throw error
        const from = (location.state as { from?: string } | null)?.from
        navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/organizations', {
          replace: true,
        })
      }
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  })
  return (
    <>
      <span className="eyebrow">YOUR COMMUNITY STARTS HERE</span>
      <h1>{title}</h1>
      <p>
        {forgot
          ? 'We’ll send a link to help you get back in.'
          : 'One place for your community’s savings journey.'}
      </p>
      <form onSubmit={submit} noValidate>
        <FormField
          id="auth-email"
          label="Email address"
          error={form.formState.errors.email?.message}
        >
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            {...form.register('email')}
            aria-invalid={Boolean(form.formState.errors.email)}
            aria-describedby={form.formState.errors.email ? 'auth-email-error' : undefined}
          />
        </FormField>
        {!forgot && (
          <FormField
            id="auth-password"
            label={reset ? 'New password' : 'Password'}
            error={form.formState.errors.password?.message}
            hint="Use at least 8 characters."
          >
            <Input
              id="auth-password"
              type="password"
              autoComplete={register || reset ? 'new-password' : 'current-password'}
              {...form.register('password')}
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby={`auth-password-hint${form.formState.errors.password ? ' auth-password-error' : ''}`}
            />
          </FormField>
        )}
        {register && (
          <p className="field-hint">
            This is a development foundation. Review the{' '}
            <Link to="/privacy">draft privacy policy</Link> and <Link to="/terms">draft terms</Link>{' '}
            before creating a test account.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <Button type="submit" disabled={busy}>
          {busy
            ? 'Please wait…'
            : register
              ? 'Create account'
              : forgot
                ? 'Send recovery link'
                : reset
                  ? 'Update password'
                  : 'Sign in'}
        </Button>
      </form>
      <div className="auth-links">
        {!forgot && !reset && <Link to="/forgot-password">Forgot password?</Link>}
        <Link to={register || forgot || reset ? '/login' : '/register'}>
          {register || forgot || reset ? 'Back to sign in' : 'Create an account'}
        </Link>
      </div>
    </>
  )
}
function locationOrigin() {
  return window.location.origin
}
