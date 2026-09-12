import { NextResponse } from 'next/server'

import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

export async function GET() {
  try {
    // Basic health check - ensure the application is running
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      // The deployment name, not NODE_ENV (#733). Nothing reads this field
      // today, so this is a consistency fix, not a behaviour one.
      environment: deploymentEnvironment(),
      version: process.env.npm_package_version || 'unknown',
    }

    return NextResponse.json(health, { status: 200 })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Health Route] Health check failed:', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      },
      { status: 500 },
    )
  }
}
