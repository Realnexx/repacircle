import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
const Context = createContext<{ session: Session | null; loading: boolean; error: string | null }>({
  session: null,
  loading: true,
  error: null,
})
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!supabase) return
    let active = true
    let eventReceived = false
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      eventReceived = true
      if (active) {
        setSession(next)
        setError(null)
        setLoading(false)
      }
    })
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !eventReceived) {
          setSession(data.session)
          setError(error?.message ?? null)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active && !eventReceived) {
          setError('Unable to restore your session. Please reload and try again.')
          setLoading(false)
        }
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
  return <Context.Provider value={{ session, loading, error }}>{children}</Context.Provider>
}
export const useSession = () => useContext(Context)
