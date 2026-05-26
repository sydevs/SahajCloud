import { NextResponse, type NextRequest } from 'next/server'

import { checkBasicAuth } from '@/lib/openapi/basicAuth'

export function middleware(request: NextRequest): NextResponse {
  const docsPassword = process.env.DOCS_PASSWORD
  if (!docsPassword) return NextResponse.next()

  const authHeader = request.headers.get('authorization') ?? ''
  if (!checkBasicAuth(authHeader, docsPassword)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Sahaj Cloud API Documentation"',
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/openapi-raw.json'],
}
