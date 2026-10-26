import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import type { ReactNode } from 'react'
import { SessionProvider } from '@/modules/auth/session'
import { ThemeProvider, useTheme } from './theme'
import { AccessProvider } from './access'
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })
function Notifications() {
  const { theme } = useTheme()
  return <Toaster richColors theme={theme} closeButton />
}
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SessionProvider>
          <AccessProvider>
            {children}
            <Notifications />
          </AccessProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
