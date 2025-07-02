'use client'

import React from 'react'
import * as Sentry from '@sentry/nextjs'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
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

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        component: 'AdminErrorBoundary',
      },
      extra: {
        errorInfo,
      },
    })

    console.error('Admin interface error caught by boundary:', error, errorInfo)
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