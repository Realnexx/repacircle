import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('associates nested row errors with the correct control and reports its full path on blur', () => {
    const blur = vi.fn()
    render(
      <SchemaForm
        fields={[
          {
            key: 'rows',
            label: 'Members',
            type: 'repeating',
            required: true,
            children: [
              {
                key: 'slot',
                label: 'Member slot',
                type: 'number',
                required: true,
                hint: 'Use a unique slot.',
              },
            ],
          },
        ]}
        values={{ rows: [{ slot: 0 }, { slot: 2 }] }}
        pathPrefix="contribution."
        errors={{ 'contribution.rows.0.slot': 'Enter a value at least 1.' }}
        onChange={vi.fn()}
        onFieldBlur={blur}
      />,
    )
    const [first, second] = screen.getAllByLabelText('Member slot *')
    expect(first).toHaveAttribute('aria-invalid', 'true')
    expect(first).toHaveAccessibleDescription('Use a unique slot. Enter a value at least 1.')
    expect(second).toHaveAttribute('aria-invalid', 'false')
    fireEvent.blur(first)
    expect(blur).toHaveBeenCalledWith('contribution.rows.0.slot')
  })
  it('shows a failed upload once and connects its message to the file input', async () => {
    render(
      <SchemaForm
        fields={[{ key: 'image', label: 'Group image', type: 'image', required: false }]}
        values={{}}
        onChange={vi.fn()}
        fileStorage={{
          upload: async () => {
            throw new Error('Image must be smaller than 5 MB.')
          },
          url: async () => '',
        }}
      />,
    )
    const input = screen.getByLabelText('Group image')
    fireEvent.change(input, {
      target: { files: [new File(['test'], 'test.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Image must be smaller than 5 MB.')
  })
})
