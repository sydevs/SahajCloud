'use client'

/**
 * Global error boundary for Next.js App Router
 *
 * Captures client-side React errors and sends them to Sentry.
 * Server-side errors are handled by the Sentry plugin in payload.config.ts.
 */
// ⚠ `@sentry/nextjs`, never `@sentry/react` — see `src/components/ErrorBoundary.tsx`.
import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Capture client-side errors with Sentry
    Sentry.captureException(error, {
      extra: { digest: error.digest },
    })
  }, [error])

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
