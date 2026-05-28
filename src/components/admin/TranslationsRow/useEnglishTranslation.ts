'use client'

import { useEffect, useState } from 'react'

type FetchState = {
  data: Record<string, unknown> | null
  isLoading: boolean
  isError: boolean
}

type CacheEntry = {
  promise: Promise<Record<string, unknown> | null>
  state: FetchState
}

/**
 * Module-level cache keyed by global slug. Every TranslationsRow that needs
 * English reference values subscribes to the same in-flight promise so a tab
 * with 50 rows only triggers one network request.
 */
const cache = new Map<string, CacheEntry>()

function startFetch(globalSlug: string): CacheEntry {
  const entry: CacheEntry = {
    promise: fetch(`/api/globals/${globalSlug}?locale=en&depth=0`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as Record<string, unknown>
      })
      .then((data) => {
        entry.state = { data, isLoading: false, isError: false }
        return data
      })
      .catch(() => {
        entry.state = { data: null, isLoading: false, isError: true }
        return null
      }),
    state: { data: null, isLoading: true, isError: false },
  }
  return entry
}

export function useEnglishTranslation(globalSlug: string | null): FetchState {
  const [, force] = useState(0)

  useEffect(() => {
    if (!globalSlug) return
    let entry = cache.get(globalSlug)
    if (!entry) {
      entry = startFetch(globalSlug)
      cache.set(globalSlug, entry)
    }
    if (entry.state.isLoading) {
      void entry.promise.then(() => force((n) => n + 1))
    }
  }, [globalSlug])

  if (!globalSlug) return { data: null, isLoading: false, isError: false }
  const entry = cache.get(globalSlug)
  return entry?.state ?? { data: null, isLoading: true, isError: false }
}
