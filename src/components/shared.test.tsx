import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { DataTable, Pagination } from './data-display/components'
import { FileUploader, CurrencyInput } from './forms/controls'
afterEach(cleanup)
describe('shared interaction contracts', () => {
  it('sorts table rows accessibly', () => {
    render(
      <DataTable
        caption="Activities"
        rows={[{ name: 'Zulu' }, { name: 'Alpha' }]}
        rowKey={(r) => r.name}
        columns={[{ key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['Alpha', 'Zulu'])
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
  })
  it('disables pagination outside valid bounds', () => {
    const onPageChange = vi.fn()
    render(<Pagination page={1} pageSize={2} total={3} onPageChange={onPageChange} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
  it('rejects oversized or mismatched files and clears selection', () => {
    const onFiles = vi.fn()
    render(<FileUploader id="proof" onFiles={onFiles} maxBytes={10} />)
    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: { files: [new File(['hello'], 'bad.exe', { type: 'application/octet-stream' })] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('accepted file type')
    expect(onFiles).toHaveBeenLastCalledWith([])
  })
  it('reports exact centavos and rejects excess decimal precision', () => {
    const onChange = vi.fn()
    render(<CurrencyInput id="amount" value="0" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '10.25' } })
    expect(onChange).toHaveBeenLastCalledWith('1025')
    fireEvent.change(input, { target: { value: '10.255' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
