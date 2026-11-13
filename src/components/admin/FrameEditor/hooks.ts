'use client'

import { useLocale } from '@payloadcms/ui'
import useSWR from 'swr'

import { payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'
import type { Frame } from '@/payload-types'

import { framesByNarratorKey } from './utils'

const readFrames = payloadListFetcher<Frame>

/**
 * Hook to fetch and cache available frames for a narrator
 * Uses SWR for automatic caching, deduplication, and revalidation
 *
 * The active admin locale is part of the URL, and so of the SWR key. The
 * endpoint's role gate resolves the manager's roles at `req.locale`, and a
 * request naming no locale resolves to the default one — denying any manager
 * whose roles live only elsewhere (#701). Carrying the locale in the key also
 * makes a locale switch refetch for free.
 */
export const useAvailableFrames = (
  narratorId: string | null,
): {
  frames: Frame[]
  isLoading: boolean
  isError: boolean
  error: string | null
} => {
  const { code } = useLocale()

  const { data, error, isLoading } = useSWR(framesByNarratorKey(narratorId, code), readFrames, {
    revalidateOnFocus: false, // Don't refetch when window regains focus
    revalidateOnReconnect: false, // Don't refetch on network reconnect
    dedupingInterval: 300000, // 5 minutes - deduplication window
  })

  return {
    frames: data?.docs || [],
    isLoading,
    isError: !!error,
    error: error instanceof Error ? error.message : null,
  }
}
