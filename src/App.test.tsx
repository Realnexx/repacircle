import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, it, expect } from 'vitest'
import App from './App'
import { AppProviders } from './app/providers'
afterEach(cleanup)
function mount(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AppProviders>,
  )
}
describe('workspace routes', () => {
  it('renders the public landing page', async () => {
    mount('/')
    expect(await screen.findByRole('heading', { name: /Small contributions/ })).toBeInTheDocument()
  })
  it('preserves organization setup without invented records', async () => {
    mount('/organizations')
    expect(await screen.findByText('Your community’s next chapter.')).toBeInTheDocument()
    expect(screen.getByText('Layout preview')).toBeInTheDocument()
  })
  it('provides an explicit missing-route state', async () => {
    mount('/missing')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
  it('renders distinct forgot-password and register forms', async () => {
    mount('/forgot-password')
    expect(
      await screen.findByRole('heading', { name: 'Forgot your password?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send recovery link' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })
})
