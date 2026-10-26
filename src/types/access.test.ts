import { it, expect } from 'vitest'
import { hasWorkspaceAccess } from './access'
it('does not elevate member or organizer access to platform administrator', () => {
  expect(hasWorkspaceAccess(['member'], 'organizer')).toBe(false)
  expect(hasWorkspaceAccess(['organizer'], 'platform-admin')).toBe(false)
  expect(hasWorkspaceAccess(['treasurer'], 'treasurer')).toBe(true)
})
