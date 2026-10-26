import { AppRouter } from './app/router'
import { environment } from './lib/validation/env'
import { ErrorState } from './components/feedback/states'
export default function App() {
  return environment.error ? (
    <ErrorState title="Configuration required" message={environment.error} />
  ) : (
    <AppRouter />
  )
}
