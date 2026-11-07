'use client'

import { useRouteTransition } from '@payloadcms/ui'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Patch the URL's query, for a server-rendered view whose state lives there.
 *
 * The server reads the query, so Back works and a link is shareable. Name the
 * view's own query shape as `Q` and a misspelled key is a build error.
 */
export function useSetQuery<Q extends Record<string, number | string>>(): (
  patch: Partial<Q>,
) => void {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { startRouteTransition } = useRouteTransition()
  return (patch) => {
    const params = new URLSearchParams(searchParams?.toString())
    for (const [key, value] of Object.entries(patch)) params.set(key, String(value))
    startRouteTransition(() => router.push(`${pathname}?${params.toString()}`))
  }
}
