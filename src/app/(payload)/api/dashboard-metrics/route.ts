import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'

import config from '@payload-config'

type LocaleCode = Config['locale']

/**
 * Dashboard Metrics API Endpoint
 *
 * Returns collection counts for meditations, lessons, and music
 * filtered by the specified locale.
 *
 * Query Parameters:
 * - locale: The locale code to filter by (default: 'en')
 *
 * Response:
 * {
 *   meditations: number,
 *   lessons: number,
 *   music: number
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Extract locale from query parameters
    const searchParams = request.nextUrl.searchParams
    const localeParam = searchParams.get('locale') || 'en'
    const locale = localeParam as LocaleCode

    // Get Payload instance
    const payload = await getPayload({ config })

    // Fetch collection counts in parallel
    const [meditationsResult, lessonsResult, musicResult] = await Promise.all([
      // Count meditations for this locale
      payload.find({
        collection: 'meditations',
        locale,
        limit: 0, // Only get count, not actual documents
        pagination: false,
      }),

      // Count lessons for this locale
      payload.find({
        collection: 'lessons',
        locale,
        limit: 0,
        pagination: false,
      }),

      // Count music for this locale
      payload.find({
        collection: 'music',
        locale,
        limit: 0,
        pagination: false,
      }),
    ])

    // Return counts as JSON
    return NextResponse.json({
      meditations: meditationsResult.totalDocs,
      lessons: lessonsResult.totalDocs,
      music: musicResult.totalDocs,
    })
  } catch (error) {
    // Return error response
    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
