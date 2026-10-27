import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { logoutAccount } from './service'
import { clearInvitationIntent } from './invitation-intent'
import { clearGroupJoinIntent } from '@/modules/membership/intent'
type State = {
  session: Session | null
  loading: boolean
  error: string | null
  authVersion: number
  recovery: boolean
  finishRecovery: () => void
  logout: () => Promise<string | null>
}
const Context = createContext<State>({
  session: null,
  loading: true,
  error: null,
  authVersion: 0,
  recovery: false,
  finishRecovery: () => {},
  logout: async () => null,
})
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)
  const [authVersion, setAuthVersion] = useState(0)
  const [recovery, setRecovery] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery',
  )
  const lastUser = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!supabase) return
    let active = true
    let eventReceived = false
    const assign = (next: Session | null) => {
      if (!active) return
      const restored = next?.expires_at && next.expires_at <= Date.now() / 1000 ? null : next
      if (lastUser.current && lastUser.current !== restored?.user.id) client.clear()
      lastUser.current = restored?.user.id
      setSession(restored)
      setLoading(false)
      setError(null)
      setAuthVersion((v) => v + 1)
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      eventReceived = true
      assign(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') {
        setRecovery(false)
        clearInvitationIntent()
        clearGroupJoinIntent()
      }
    })
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !eventReceived) {
          assign(data.session)
          if (error) setError(error.message)
        }
      })
      .catch(() => {
        if (active && !eventReceived) {
          setSession(null)
          setLoading(false)
          setError('Unable to restore your session. Please sign in again.')
        }
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client])

  const logout = async () => {
    try {
      return await logoutAccount()
    } finally {
      setSession(null)
      setRecovery(false)
      clearInvitationIntent()
      client.clear()
    }
  }
  return (
    <Context.Provider
      value={{
        session,
        loading,
        error,
        authVersion,
        recovery,
        finishRecovery: () => setRecovery(false),
        logout,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export const useSession = () => useContext(Context)
