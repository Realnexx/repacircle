import { describe, it, expect } from 'vitest'
import { parseCentavos, displayCentavos } from './currency'
describe('exact monetary input', () => {
  it('preserves cents beyond Number safe integer precision', () =>
    expect(parseCentavos('9007199254740993.99')).toBe('900719925474099399'))
  it('normalizes decimals and grouping', () => {
    expect(parseCentavos('1,250.5')).toBe('125050')
    expect(displayCentavos('125050')).toBe('1250.50')
    expect(parseCentavos('0.01')).toBe('1')
  })
  it.each(['-1', '1.001', '1e3', '', 'abc', 'NaN', '1,,2', '1,00'])(
    'rejects invalid amounts %s',
    (input) => expect(parseCentavos(input)).toBeNull(),
  )
})
