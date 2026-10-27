import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { pendingInvitationPath } from './invitation-intent'
import { safeReturnPath } from './service'
import { requireClient } from '@/lib/api/client'
import { useSession } from './session'
import { useAccess } from '@/app/providers/access'
import { PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingSkeleton } from '@/components/feedback/states'
import { errorMessage } from '@/lib/api/errors'
import { environment } from '@/lib/validation/env'
type Enrollment = { id: string; qr: string; secret: string }
export default function Security() {
  const { session } = useSession()
  const location = useLocation()
  const access = useAccess()
  const cache = useQueryClient()
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery({
    queryKey: ['mfa', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await requireClient().auth.mfa.listFactors()
      if (error) throw error
      return data
    },
  })
  const factors = query.data?.all.filter((f) => f.factor_type === 'totp') ?? []
  const verified = factors.filter((f) => f.status === 'verified')
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await cache.invalidateQueries({ queryKey: ['mfa'] })
      await cache.invalidateQueries({ queryKey: ['access'] })
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeader
        title="Account security"
        description="Use an authenticator app to protect privileged operations."
      />
      <section className="panel security-panel">
        {environment.mode === 'setup' ? (
          <p>Connect Supabase and sign in to enroll an authenticator.</p>
        ) : query.isPending ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <p>
              Organizers, treasurers and platform administrators must verify a second factor before
              privileged access. Keep access to your authenticator app.
            </p>
            <p role="status">
              {access.aal === 'aal2'
                ? 'Second factor verified for this session.'
                : verified.length
                  ? 'Enter a current code to verify this session.'
                  : 'No verified authenticator enrolled.'}
            </p>
            {verified.length === 0 && !enrollment && (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { data, error } = await requireClient().auth.mfa.enroll({
                      factorType: 'totp',
                      friendlyName: `RepaCircle ${new Date().toISOString()}`,
                    })
                    if (error) throw error
                    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
                  })
                }
              >
                Enroll authenticator
              </Button>
            )}
            {enrollment && (
              <div className="mfa-enrollment">
                <img
                  src={enrollment.qr}
                  width={220}
                  height={220}
                  alt="Scan this authenticator enrollment QR code"
                />
                <p>
                  Scan the QR code with your authenticator. If scanning is unavailable, enter this
                  key manually:
                </p>
                <code className="mfa-secret">{enrollment.secret}</code>
              </div>
            )}
            {(enrollment || verified.length > 0) && access.aal !== 'aal2' && (
              <form
                className="component-spacing"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(async () => {
                    const factor = enrollment?.id ?? verified[0]?.id
                    if (!factor) throw new Error('Choose an authenticator first.')
                    const { data, error } = await requireClient().auth.mfa.challenge({
                      factorId: factor,
                    })
                    if (error) throw error
                    const response = await requireClient().auth.mfa.verify({
                      factorId: factor,
                      challengeId: data.id,
                      code,
                    })
                    if (response.error) throw response.error
                    setEnrollment(null)
                    setCode('')
                  })
                }}
              >
                <label>
                  Six-digit authenticator code
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Verifying…' : 'Verify authenticator'}
                </Button>
              </form>
            )}
            {factors
              .filter((f) => f.status === 'unverified' && f.id !== enrollment?.id)
              .map((factor) => (
                <div className="component-spacing" key={factor.id}>
                  <p>Unfinished enrollment</p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const { error } = await requireClient().auth.mfa.unenroll({
                          factorId: factor.id,
                        })
                        if (error) throw error
                      })
                    }
                  >
                    Remove unfinished enrollment
                  </Button>
                </div>
              ))}
            {enrollment && (
              <Button
                variant="secondary"
                className="component-spacing"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { error } = await requireClient().auth.mfa.unenroll({
                      factorId: enrollment.id,
                    })
                    if (error) throw error
                    setEnrollment(null)
                  })
                }
              >
                Cancel enrollment
              </Button>
            )}
            {access.aal === 'aal2' && (
              <Link
                className="button component-spacing"
                to={pendingInvitationPath(
                  safeReturnPath((location.state as { from?: string } | null)?.from),
                )}
              >
                Continue
              </Link>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </>
  )
}
