import { getGroupJoinIntent } from '@/modules/membership/intent'
const key = 'repacircle-invitation'
export function pendingInvitationPath(fallback = '/organizations') {
  return getGroupJoinIntent() ? '/groups/join' : getInvitationIntent() ? '/invite' : fallback
}
export type InvitationIntent = { id: string; token: string }
export function getInvitationIntent(): InvitationIntent | null {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const capture = window.location.pathname === '/invite' && hash.has('token')
    const raw = capture
      ? { id: hash.get('id'), token: hash.get('token') }
      : JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (raw && /^[a-f0-9-]{36}$/.test(raw.id) && /^[a-f0-9]{64}$/.test(raw.token)) {
      sessionStorage.setItem(key, JSON.stringify(raw))
      if (capture) history.replaceState(null, '', window.location.pathname)
      return raw
    }
  } catch {
    /* A malformed or unavailable intent is ignored. */
  }
  return null
}
export function clearInvitationIntent() {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* No persisted intent. */
  }
}
export function invitationLink(id: string, token: string) {
  return `${window.location.origin}/invite#${new URLSearchParams({ id, token })}`
}
