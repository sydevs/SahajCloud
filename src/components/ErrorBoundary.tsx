'use client'

import { Component, type ReactNode, type ComponentType, type ErrorInfo } from 'react'

import { logger } from '@/lib/logger'

// Sentry integration temporarily disabled for Cloudflare Workers compatibility
// TODO: Re-enable Sentry after implementing Workers-compatible integration (Phase 6)

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ComponentType<{ error: Error; reset: () => void }>
}

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
    // Sentry.captureException disabled - re-enable in Phase 6
    logger.error('Admin interface error caught by boundary', error, {
      componentStack: errorInfo.componentStack,
    })
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
