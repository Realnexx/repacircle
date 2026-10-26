import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSession } from './session'
import { resendConfirmation } from './service'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api/errors'
export default function Verification() {
  const { session, logout } = useSession()
  const [email, setEmail] = useState(session?.user.email ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (session?.user.email_confirmed_at) return <Navigate to="/organizations" replace />
  return (
    <>
      <h1>Verify your email</h1>
      <p>Open the latest confirmation email before accessing your workspace.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            await resendConfirmation(email)
            setMessage('If confirmation is needed, a new email will arrive shortly.')
          } catch (error) {
            setError(errorMessage(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Email address
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Resend confirmation email'}
        </Button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="auth-links">
        <Link to="/login">Back to sign in</Link>
        {session && (
          <Button
            variant="ghost"
            onClick={() => void logout().catch((e) => setError(errorMessage(e)))}
          >
            Sign out
          </Button>
        )}
      </div>
    </>
  )
}
