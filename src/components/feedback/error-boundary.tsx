import { Component, type ReactNode } from 'react'
import { ErrorState } from './states'
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <ErrorState
        message="This view could not be displayed. Reload to try again."
        onRetry={() => location.reload()}
      />
    ) : (
      this.props.children
    )
  }
}
