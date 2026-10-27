import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SchemaForm } from './schema-form'
import { FieldDesigner } from './field-designer'
import { fieldSchema } from './config'

describe('schema renderer monetary input', () => {
  it('keeps an empty optional actual price unknown rather than coercing it to zero', () => {
    const change = vi.fn()
    render(
      <SchemaForm
        fields={[{ key: 'actual', label: 'Actual cost', type: 'currency', required: false }]}
        values={{ actual: 100 }}
        onChange={change}
      />,
    )
    const input = screen.getByLabelText('Actual cost')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(change).toHaveBeenLastCalledWith('actual', null)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('clears the saved amount on invalid input and recovers with exact cents', () => {
    const change = vi.fn()
    render(
      <SchemaForm
        fields={[
          {
            key: 'amount',
            label: 'Amount',
            type: 'currency',
            required: true,
            min: 100,
            max: 10000,
          },
        ]}
        values={{ amount: 5000 }}
        onChange={change}
      />,
    )
    const input = screen.getByLabelText('Amount *')
    fireEvent.change(input, { target: { value: '12.345' } })
    fireEvent.blur(input)
    expect(change).toHaveBeenLastCalledWith('amount', undefined)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: '0.99' } })
    fireEvent.blur(input)
    expect(change).toHaveBeenLastCalledWith('amount', undefined)
    fireEvent.change(input, { target: { value: '100.01' } })
    fireEvent.blur(input)
    expect(change).toHaveBeenLastCalledWith('amount', undefined)
    fireEvent.change(input, { target: { value: '49.99' } })
    fireEvent.blur(input)
    expect(change).toHaveBeenLastCalledWith('amount', 4999)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('generates a valid namespaced field even when the random UUID begins with a digit', () => {
    const uuid = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('10000000-0000-4000-8000-000000000001')
    const change = vi.fn()
    render(<FieldDesigner fields={[]} category="reward" onChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add custom reward field' }))
    expect(fieldSchema.safeParse(change.mock.calls[0][0][0]).success).toBe(true)
    uuid.mockRestore()
  })
})
