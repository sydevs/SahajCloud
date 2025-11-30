import { NextRequest, NextResponse } from 'next/server'

// Sentry is temporarily disabled for Cloudflare Workers compatibility
// TODO: Re-enable after implementing Workers-compatible Sentry integration (Phase 6)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const testType = searchParams.get('type') || 'error'

  // Return message indicating Sentry is disabled
  return NextResponse.json({
    success: false,
    message: 'Sentry integration temporarily disabled during Cloudflare Workers migration',
    note: 'Will be re-enabled in Phase 6 with Workers-compatible integration',
  }, { status: 503 })
}