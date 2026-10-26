import { describe, it, expect } from 'vitest'
import { organizationSchema } from './service'
describe('organization validation', () => {
  it('normalizes surrounding whitespace', () =>
    expect(organizationSchema.parse({ name: '  Bayanihan  ' }).name).toBe('Bayanihan'))
  it.each(['', ' ', 'a', 'x'.repeat(81)])('rejects invalid name %s', (name) =>
    expect(organizationSchema.safeParse({ name }).success).toBe(false),
  )
})
