import { it, expect } from 'vitest'
import { invitationStatus, type Invitation } from './service'
const fixture = {
  id: 'id',
  expires_at: '2020-01-01',
  accepted_at: null,
  revoked_at: null,
} as Invitation
it('shows expiry and gives accepted/revoked status precedence', () => {
  expect(invitationStatus(fixture)).toBe('Expired')
  expect(invitationStatus({ ...fixture, accepted_at: '2020-01-01' })).toBe('Accepted')
  expect(invitationStatus({ ...fixture, revoked_at: '2020-01-01' })).toBe('Revoked')
})
