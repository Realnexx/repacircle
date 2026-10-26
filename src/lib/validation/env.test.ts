import { describe, it, expect } from 'vitest'
import { validateEnvironment } from './env'
describe('environment validation', () => {
  it('allows explicitly disconnected setup mode', () =>
    expect(validateEnvironment({}).mode).toBe('setup'))
  it.each([
    { VITE_SUPABASE_URL: 'https://example.supabase.co' },
    { VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(30) },
    { VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(30) },
  ])('fails closed for invalid configuration', (input) =>
    expect(validateEnvironment(input).mode).toBe('invalid'),
  )
  it('accepts HTTPS and local development', () => {
    expect(
      validateEnvironment({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(30),
      }).mode,
    ).toBe('connected')
    expect(
      validateEnvironment({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(30),
      }).mode,
    ).toBe('connected')
  })
})
