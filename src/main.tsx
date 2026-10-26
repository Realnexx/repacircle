import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProviders } from './app/providers'
import { ErrorBoundary } from './components/feedback/error-boundary'
import App from './App'
import './styles.css'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  </React.StrictMode>,
)
