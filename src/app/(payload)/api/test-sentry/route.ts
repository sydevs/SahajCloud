import * as Sentry from '@sentry/cloudflare'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const _testType = searchParams.get('type') || 'error'

  // Only allow Sentry testing in production
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json(
      {
        success: false,
        message: 'Sentry test endpoint only works in production',
        environment: process.env.NODE_ENV,
      },
      { status: 503 },
    )
  }

  // Check if DSN is configured
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return NextResponse.json(
      {
        success: false,
        message: 'NEXT_PUBLIC_SENTRY_DSN not configured',
      },
      { status: 503 },
    )
  }

  try {
    if (testType === 'error') {
      // Test error capture
      const testError = new Error('Sentry test error from API endpoint')
      const eventId = Sentry.captureException(testError, {
        tags: {
          test: true,
          endpoint: '/api/test-sentry',
        },
        extra: {
          testType: 'error',
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Test error captured successfully',
        eventId,
        testType: 'error',
      })
    } else if (testType === 'message') {
      // Test message capture
      const eventId = Sentry.captureMessage('Sentry test message from API endpoint', {
        level: 'info',
        tags: {
          test: true,
          endpoint: '/api/test-sentry',
        },
        extra: {
          testType: 'message',
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Test message captured successfully',
        eventId,
        testType: 'message',
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid test type. Use ?type=error or ?type=message',
        },
        { status: 400 },
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to capture Sentry event',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
