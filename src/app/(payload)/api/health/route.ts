import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Basic health check - ensure the application is running
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || 'unknown',
    }

    return NextResponse.json(health, { status: 200 })
  } catch (_error) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    }, { status: 500 })
  }
}