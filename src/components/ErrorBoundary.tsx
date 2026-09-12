'use client'

// ⚠ `@sentry/nextjs`, never `@sentry/react`. Sentry keys its global client by
// SDK version (`core/carrier.js`: `__SENTRY__[SDK_VERSION]`), and this repo
// resolves two copies — `@sentry/nextjs` carries its own `@sentry/react`. A
// capture through the other copy reads an empty carrier and is dropped.
import * as Sentry from '@sentry/nextjs'
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ComponentType<{ error: Error; reset: () => void }>
}

/** Undefined until `src/instrumentation-client.ts` runs `Sentry.init`. */
const sentryIsListening = () => Sentry.getClient() !== undefined

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

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
      // Nothing is listening — development, or a deploy with no DSN. Console,
      // not `clientLogger`, to keep the error path free of side effects.
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
