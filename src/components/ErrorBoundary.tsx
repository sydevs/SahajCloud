'use client'

import * as Sentry from '@sentry/react'
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ComponentType<{ error: Error; reset: () => void }>
}

/**
 * This boundary reports through the browser client that
 * `src/instrumentation-client.ts` installs. It does **not** call `Sentry.init`
 * itself: a second `init` replaces the first on the current scope, so the one
 * that ran last would decide the DSN, the environment tag and the router
 * instrumentation for the whole page.
 *
 * It used to, and the duplicate was invisible only because neither `init` ever
 * ran — both gated on a DSN that read `undefined` in every browser (#760).
 *
 * `getClient()` is undefined until that init runs, which is the honest test for
 * "is anything listening": off in development, off wherever no DSN is set.
 */
const sentryIsListening = () => Sentry.getClient() !== undefined

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (sentryIsListening()) {
      Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      })
    } else {
      // Log to console in development (avoid logger to prevent any side effects)
      // eslint-disable-next-line no-console
      console.error('Admin interface error caught by boundary:', error, {
        componentStack: errorInfo.componentStack,
      })
    }
  }

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props
      const { error } = this.state

      if (Fallback && error) {
        return (
          <Fallback
            error={error}
            reset={() => this.setState({ hasError: false, error: undefined })}
          />
        )
      }

      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong in the admin interface</h2>
          <p>This error has been logged for investigation.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007cba',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
