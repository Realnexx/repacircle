// Exact string arithmetic: monetary input never passes through floating point.
export function parseCentavos(value: string): string | null {
  const trimmed = value.trim()
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(\.\d{0,2})?$/.test(trimmed)) return null
  const normalized = trimmed.replaceAll(',', '')
  const [whole, fraction = ''] = normalized.split('.')
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))).toString()
}
export function displayCentavos(value: string) {
  if (!/^\d+$/.test(value)) return ''
  const cents = BigInt(value)
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}
