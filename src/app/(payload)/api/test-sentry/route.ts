import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const testType = searchParams.get('type') || 'error'

  try {
    switch (testType) {
      case 'error':
        throw new Error('Test error for Sentry integration')
        
      case 'message':
        Sentry.captureMessage('Test message for Sentry integration', 'info')
        return NextResponse.json({ 
          success: true, 
          message: 'Test message sent to Sentry' 
        })
        
      case 'exception':
        try {
          // Simulate an operation that might fail
          JSON.parse('invalid json')
        } catch (error) {
          Sentry.captureException(error, {
            tags: {
              test: true,
              endpoint: '/api/test-sentry',
            },
            extra: {
              testType: 'exception',
            },
          })
          return NextResponse.json({
            success: true,
            message: 'Test exception sent to Sentry',
          })
        }
        break
        
      default:
        return NextResponse.json({
          error: 'Invalid test type',
          availableTypes: ['error', 'message', 'exception'],
        }, { status: 400 })
    }
  } catch (_error) {
    // This will be automatically captured by Sentry due to our configuration
    return NextResponse.json({
      error: 'Test error thrown successfully',
      message: 'This error should appear in Sentry',
    }, { status: 500 })
  }
}