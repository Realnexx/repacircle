const key = 'repacircle-group-invitation'
export function groupInvitationLink(id: string, token: string) {
  return `${window.location.origin}/groups/join#${new URLSearchParams({ id, token })}`
}
export function getGroupJoinIntent(): { id: string; token: string } | null {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const capture = window.location.pathname === '/groups/join' && hash.has('token')
    const value = capture
      ? { id: hash.get('id'), token: hash.get('token') }
      : JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (value && /^[a-f0-9-]{36}$/.test(value.id) && /^[a-f0-9]{64}$/.test(value.token)) {
      sessionStorage.setItem(key, JSON.stringify(value))
      if (capture) history.replaceState(null, '', window.location.pathname)
      return value
    }
  } catch {
    /* Private browsing can disable intent persistence. */
  }
  return null
}
export function clearGroupJoinIntent() {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* Optional persistence. */
  }
}
