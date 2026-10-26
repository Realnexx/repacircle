import { Link, Navigate } from 'react-router-dom'
import { useSession } from './session'
import { LoadingSkeleton, ErrorState } from '@/components/feedback/states'
import { getInvitationIntent } from './invitation-intent'
export default function AuthCallback() {
  const { session, loading, error } = useSession()
  const params = new URLSearchParams(location.hash.slice(1))
  const failed = params.has('error') || new URLSearchParams(location.search).has('error')
  if (loading) return <LoadingSkeleton label="Completing sign-in…" />
  if (error || failed)
    return (
      <ErrorState
        title="Sign-in could not be completed"
        message="The link may have expired. Return to sign in and request a new link."
      />
    )
  return session ? (
    <Navigate
      to={
        session.user.email_confirmed_at
          ? getInvitationIntent()
            ? '/invite'
            : '/organizations'
          : '/verify-email'
      }
      replace
    />
  ) : (
    <>
      <h1>Sign-in link unavailable</h1>
      <p>Try signing in again or request a new confirmation link.</p>
      <Link className="button" to="/login">
        Sign in
      </Link>
    </>
  )
}
