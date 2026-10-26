import { it, expect } from 'vitest'
import { profileInputSchema, isProfileComplete } from './service'
import { emptyPersonal } from './personal'
const personal = {
  ...emptyPersonal,
  first_name: 'Maria',
  last_name: 'Cruz',
  region_code: '130000000',
  region_name: 'NCR',
  city_code: '137404000',
  city_name: 'Quezon City',
  barangay_code: '137404001',
  barangay_name: 'Alicia',
  street_address: '12 Test Street',
}
it('validates mobile numbers and strips account status from profile updates', () => {
  const input = {
    ...personal,
    full_name: 'Maria Cruz',
    mobile_number: '+63 912 345 6789',
    address: '',
    notification_settings: { email: true, push: false },
    account_status: 'active',
    role: 'owner',
  }
  const parsed = profileInputSchema.parse(input)
  expect(parsed).not.toHaveProperty('role')
  expect(parsed).not.toHaveProperty('account_status')
  expect(profileInputSchema.safeParse({ ...input, mobile_number: 'invalid' }).success).toBe(false)
})
it('does not accept a completion timestamp without required details', () => {
  expect(isProfileComplete({ profile_completed_at: '2026-10-26' })).toBe(false)
  expect(
    profileInputSchema.safeParse({
      ...personal,
      full_name: 'Maria Cruz',
      mobile_number: '',
      address: '',
      notification_settings: { email: true, push: true },
    }).success,
  ).toBe(false)
})
