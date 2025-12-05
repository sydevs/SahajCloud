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

// Track Sentry initialization status globally (only initialize once)
let sentryInitialized = false

function initializeSentry() {
  if (sentryInitialized) return

  // Initialize Sentry for client-side error tracking (production only)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,

        // Integrations for React error boundaries and browser tracking
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration({
            maskAllText: false,
            blockAllMedia: false,
          }),
        ],

        // Performance monitoring sample rate (adjust as needed)
        tracesSampleRate: 0.1,

        // Session replay sample rate
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      })

      sentryInitialized = true
    }
  }
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }

    // Initialize Sentry on first ErrorBoundary mount
    initializeSentry()
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Capture exception with Sentry in production
    if (process.env.NODE_ENV === 'production' && sentryInitialized) {
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
