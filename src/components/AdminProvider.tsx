'use client'
import type { ReactNode } from 'react'

import ErrorBoundary from './ErrorBoundary'

interface AdminProviderProps {
  children: ReactNode
}

const AdminErrorFallback = ({ error, reset }: { error: Error; reset: () => void }) => (
  <div
    style={{
      padding: '40px',
      maxWidth: '600px',
      margin: '0 auto',
      textAlign: 'center',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      marginTop: '40px',
    }}
  >
    <h1 style={{ color: '#dc3545', marginBottom: '20px' }}>
      Admin Interface Error
    </h1>
    <p style={{ marginBottom: '20px', color: '#6c757d' }}>
      An unexpected error occurred in the admin interface. The error has been logged and reported.
    </p>
    <details style={{ marginBottom: '20px', textAlign: 'left' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
        Error Details
      </summary>
      <pre
        style={{
          backgroundColor: '#e9ecef',
          padding: '10px',
          borderRadius: '4px',
          overflow: 'auto',
          marginTop: '10px',
          fontSize: '12px',
        }}
      >
        {error.message}
        {error.stack && `\n\n${error.stack}`}
      </pre>
    </details>
    <div>
      <button
        onClick={reset}
        style={{
          padding: '12px 24px',
          backgroundColor: '#007cba',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px',
          marginRight: '10px',
        }}
      >
        Try Again
      </button>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '12px 24px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px',
        }}
      >
        Reload Page
      </button>
    </div>
  </div>
)

const AdminProvider = ({ children }: AdminProviderProps) => {
  return (
    <ErrorBoundary fallback={AdminErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}

export default AdminProvider