import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { environment, googleOAuthEnabled } from '@/lib/validation/env'
import { useSession } from './session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/forms/controls'
import { errorMessage } from '@/lib/api/errors'
import { emailSchema, passwordSchema, registrationSchema } from './validation'
import {
  registerAccount,
  loginAccount,
  requestPasswordRecovery,
  resetPassword,
  googleSignIn,
  safeReturnPath,
} from './service'
import { pendingInvitationPath } from './invitation-intent'
export default function AuthPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, loading, recovery, finishRecovery } = useSession()
  const register = location.pathname === '/register'
  const forgot = location.pathname === '/forgot-password'
  const reset = location.pathname === '/reset-password'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const form = useForm<{ email: string; password: string; full_name: string }>({
    defaultValues: { email: '', password: '', full_name: '' },
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
    form.clearErrors()
    const email = emailSchema.safeParse(values.email)
    if (!reset && !email.success) {
      form.setError('email', { message: 'Enter a valid email address.' })
      return
    }
    if (!supabase) {
      setError(environment.error ?? 'Connect Supabase to enable account access. See Help & setup.')
      return
    }
    if (register) {
      const result = registrationSchema.safeParse(values)
      if (!result.success) {
        for (const issue of result.error.issues)
          form.setError(issue.path[0] as 'email' | 'password' | 'full_name', {
            message: issue.message,
          })
        return
      }
    } else if (reset) {
      const result = passwordSchema.safeParse(values.password)
      if (!result.success) {
        form.setError('password', { message: result.error.issues[0].message })
        return
      }
    } else if (!forgot && !values.password) {
      form.setError('password', { message: 'Enter your password.' })
      return
    }
    if (reset && (!session || !recovery)) {
      setError('Open a new password recovery link from your email first.')
      return
    }
    setBusy(true)
    try {
      if (forgot) {
        await requestPasswordRecovery(values.email)
        setMessage('If an account exists for this email, you’ll receive a recovery link.')
      } else if (reset) {
        await resetPassword(values.password)
        finishRecovery()
        form.resetField('password')
        setMessage('Password updated. Sign in again with your new password.')
        await supabase.auth.signOut({ scope: 'global' })
      } else if (register) {
        await registerAccount(values.email, values.password, values.full_name)
        setMessage('Check your email to confirm your account. Open the newest confirmation link.')
      } else {
        const data = await loginAccount(values.email, values.password)
        if (!data.user?.email_confirmed_at) {
          navigate('/verify-email')
          return
        }
        navigate(
          pendingInvitationPath(safeReturnPath((location.state as { from?: string } | null)?.from)),
          { replace: true },
        )
      }
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  })
  if (register && session?.user.email_confirmed_at)
    return (
      <>
        <h1>Email verified</h1>
        <p>Complete your personal information to get your account ready.</p>
        <Link className="button" to="/profile/setup">
          Continue
        </Link>
      </>
    )
  return (
    <>
      <span className="eyebrow">YOUR COMMUNITY STARTS HERE</span>
      <h1>{title}</h1>
      <p className="auth-intro">
        {forgot
          ? 'We’ll send a link to help you get back in.'
          : register
            ? 'Your savings journey starts here.'
            : 'One place for your community’s savings journey.'}
      </p>
      <form onSubmit={submit} noValidate>
        {register && (
          <FormField
            id="auth-name"
            label="Full name"
            error={form.formState.errors.full_name?.message}
          >
            <Input
              id="auth-name"
              autoComplete="name"
              {...form.register('full_name')}
              aria-invalid={Boolean(form.formState.errors.full_name)}
              aria-describedby={form.formState.errors.full_name ? 'auth-name-error' : undefined}
            />
          </FormField>
        )}
        {!reset && (
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
        )}
        {!forgot && (
          <FormField
            id="auth-password"
            label={reset ? 'New password' : 'Password'}
            error={form.formState.errors.password?.message}
            hint={register || reset ? 'Use 12 to 128 characters.' : undefined}
          >
            <Input
              id="auth-password"
              type="password"
              autoComplete={register || reset ? 'new-password' : 'current-password'}
              {...form.register('password')}
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby={
                form.formState.errors.password
                  ? 'auth-password-error'
                  : register || reset
                    ? 'auth-password-hint'
                    : undefined
              }
            />
          </FormField>
        )}
        {register && (
          <p className="field-hint">
            Read our <Link to="/privacy">draft privacy policy</Link> and{' '}
            <Link to="/terms">draft terms</Link>.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <Button type="submit" disabled={busy || loading}>
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
      {googleOAuthEnabled && !forgot && !reset && (
        <Button
          className="component-spacing google-auth-button"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              setError('')
              await googleSignIn()
            } catch (error) {
              setError(errorMessage(error))
              setBusy(false)
            }
          }}
        >
          <span className="google-brand-icon" aria-hidden="true">
            <img src="/brand/google-g.png" alt="" width={18} height={18} />
          </span>
          Continue with Google
        </Button>
      )}
      {googleOAuthEnabled && !forgot && !reset && (
        <p className="field-hint">
          {register
            ? 'Google signs you in or creates your account.'
            : 'Continue with Google to sign in or create your account automatically. New accounts will complete personal information next.'}
        </p>
      )}
      {!register && (
        <div className="auth-links">
          {!forgot && !reset && <Link to="/forgot-password">Forgot password?</Link>}
          <Link to={register || forgot || reset ? '/login' : '/register'}>
            {register || forgot || reset ? 'Back to sign in' : 'Create an account'}
          </Link>
        </div>
      )}
    </>
  )
}
