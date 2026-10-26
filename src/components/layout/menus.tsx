import { useRef } from 'react'
import { Bell, ChevronDown, LogOut, Moon, Sun, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTheme } from '@/app/providers/theme'
import { useSession } from '@/modules/auth/session'
import { supabase } from '@/lib/supabase'
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      className="icon-button"
      aria-label={theme === 'light' ? 'Use dark mode' : 'Use light mode'}
      onClick={toggle}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}
function closeOnEscape(event: React.KeyboardEvent<HTMLDetailsElement>) {
  if (event.key === 'Escape') {
    event.currentTarget.open = false
    event.currentTarget.querySelector('summary')?.focus()
  }
}
export function NotificationDropdown() {
  return (
    <details className="dropdown" onKeyDown={closeOnEscape}>
      <summary aria-label="Notifications">
        <Bell size={19} />
      </summary>
      <div className="dropdown-content">
        <h3>Notifications</h3>
        <p>
          No notifications are loaded. Notification delivery will be connected in a later phase.
        </p>
        <Link to="/member/notifications">Open notifications</Link>
      </div>
    </details>
  )
}
export function UserMenu() {
  const { session } = useSession()
  const client = useQueryClient()
  const ref = useRef<HTMLDetailsElement>(null)
  return (
    <details ref={ref} className="dropdown user-dropdown" onKeyDown={closeOnEscape}>
      <summary>
        <span className="avatar">{session?.user.email?.charAt(0).toUpperCase() ?? 'R'}</span>
        <span className="sr-only">User menu</span>
        <ChevronDown size={13} />
      </summary>
      <div className="dropdown-content">
        <strong>{session?.user.email ?? 'Preview account'}</strong>
        <Link
          to="/member/profile"
          onClick={() => {
            if (ref.current) ref.current.open = false
          }}
        >
          <User size={16} />
          Profile
        </Link>
        {session ? (
          <button
            onClick={async () => {
              try {
                const { error } = await supabase!.auth.signOut()
                if (error) throw error
                client.clear()
                if (ref.current) ref.current.open = false
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Unable to sign out.')
              }
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        ) : (
          <Link to="/login">Sign in</Link>
        )}
      </div>
    </details>
  )
}
