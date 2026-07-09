import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { handleCacheMiddleware } from '@/plugins/cache/middleware'
import {
  buildCacheHeaders,
  CACHE_TTLS,
  CACHEABLE_SLUGS,
  DEFAULT_SMAXAGE,
  matchCacheableRead,
  PREVIEW_SECRET_HEADER,
  resolveTtl,
} from '@/plugins/cache/policy'

const API_KEY = 'clients API-Key abc123'

/** Run the middleware decision fn over a synthetic request. */
function run(
  pathname: string,
  init?: { method?: string; headers?: Record<string, string> },
): Headers {
  const request = new NextRequest(`https://cloud.example${pathname}`, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
  })
  return handleCacheMiddleware(request).headers
}

describe('matchCacheableRead', () => {
  it('matches a list read for a cacheable slug', () => {
    expect(matchCacheableRead('/api/meditations')).toEqual({ sMaxAge: 600, tags: ['meditations'] })
  })

  it('matches a findByID read with a numeric id, using the per-collection TTL', () => {
    expect(matchCacheableRead('/api/albums/42')).toEqual({ sMaxAge: 1800, tags: ['albums'] })
  })

  it('tolerates a trailing slash', () => {
    expect(matchCacheableRead('/api/images/')).toEqual({ sMaxAge: 1800, tags: ['images'] })
  })

  it('returns null for a non-cacheable collection', () => {
    expect(matchCacheableRead('/api/users')).toBeNull()
    expect(matchCacheableRead('/api/clients/1')).toBeNull()
  })

  it('returns null for custom endpoints (non-numeric segment or 3 segments)', () => {
    expect(matchCacheableRead('/api/audiences/for-user')).toBeNull()
    expect(matchCacheableRead('/api/events/geojson')).toBeNull()
    expect(matchCacheableRead('/api/meditations/12/songs')).toBeNull()
    expect(matchCacheableRead('/api/lectures/9/related-meditations')).toBeNull()
  })

  it('returns null for a non-numeric id segment', () => {
    expect(matchCacheableRead('/api/meditations/latest')).toBeNull()
  })
})

describe('resolveTtl', () => {
  it('returns the lowest TTL among the collections', () => {
    expect(resolveTtl(['app-cards', 'audiences'])).toBe(300) // 600 vs 300
    expect(resolveTtl(['events', 'regions'])).toBe(300) // 300 vs 600
    expect(resolveTtl(['songs', 'meditations'])).toBe(DEFAULT_SMAXAGE) // 600 vs 600
  })

  it('falls back to the default for an unknown collection or empty list', () => {
    expect(resolveTtl(['not-a-collection'])).toBe(DEFAULT_SMAXAGE)
    expect(resolveTtl([])).toBe(DEFAULT_SMAXAGE)
  })
})

describe('buildCacheHeaders', () => {
  it('returns private, no-store for a preview read (never cache drafts)', () => {
    expect(buildCacheHeaders({ sMaxAge: 600, tags: ['meditations'], preview: true })).toEqual({
      'Cache-Control': 'private, no-store',
    })
  })

  it('emits public + Vary + Cache-Tag for a normal read', () => {
    expect(buildCacheHeaders({ sMaxAge: 600, tags: ['meditations', 'lectures'] })).toEqual({
      'Cache-Control': 'public, max-age=600, s-maxage=600',
      Vary: 'Authorization',
      'Cache-Tag': 'meditations,lectures',
    })
  })

  it('omits Cache-Tag when no tags are given', () => {
    expect(buildCacheHeaders({ sMaxAge: 300 })).toEqual({
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      Vary: 'Authorization',
    })
  })
})

describe('handleCacheMiddleware', () => {
  it('stamps public + Vary + Cache-Tag on an authed built-in list read', () => {
    const headers = run('/api/meditations', { headers: { authorization: API_KEY } })
    expect(headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600')
    expect(headers.get('Vary')).toBe('Authorization')
    expect(headers.get('Cache-Tag')).toBe('meditations')
  })

  it('applies the per-collection TTL (images = 1800) on findByID', () => {
    const headers = run('/api/images/7', { headers: { authorization: API_KEY } })
    expect(headers.get('Cache-Control')).toBe('public, max-age=1800, s-maxage=1800')
    expect(headers.get('Cache-Tag')).toBe('images')
  })

  it('never caches a preview read — private, no-store, no Vary — even with an API key', () => {
    const headers = run('/api/meditations', {
      headers: { authorization: API_KEY, [PREVIEW_SECRET_HEADER]: 'shh' },
    })
    expect(headers.get('Cache-Control')).toBe('private, no-store')
    expect(headers.get('Vary')).toBeNull()
  })

  it('leaves an unauthenticated (manager-cookie / anonymous) read DYNAMIC', () => {
    const headers = run('/api/meditations')
    expect(headers.get('Cache-Control')).toBeNull()
    expect(headers.get('Vary')).toBeNull()
  })

  it('leaves write methods untouched even with an API key', () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const headers = run('/api/meditations', { method, headers: { authorization: API_KEY } })
      expect(headers.get('Cache-Control')).toBeNull()
    }
  })

  it('does not touch custom-endpoint paths (they self-manage in-handler)', () => {
    expect(
      run('/api/meditations/3/songs', { headers: { authorization: API_KEY } }).get('Cache-Control'),
    ).toBeNull()
    expect(
      run('/api/events/geojson', { headers: { authorization: API_KEY } }).get('Cache-Control'),
    ).toBeNull()
  })

  it('does not stamp non-cacheable collections', () => {
    expect(
      run('/api/users', { headers: { authorization: API_KEY } }).get('Cache-Control'),
    ).toBeNull()
  })
})

describe('CACHEABLE_SLUGS (cacheable set = purge set)', () => {
  it('is exactly the CACHE_TTLS keys, including images + albums', () => {
    for (const slug of Object.keys(CACHE_TTLS)) {
      expect(CACHEABLE_SLUGS.has(slug)).toBe(true)
    }
    expect(CACHEABLE_SLUGS.size).toBe(Object.keys(CACHE_TTLS).length)
  })

  it('excludes collections that are never cached', () => {
    expect(CACHEABLE_SLUGS.has('users')).toBe(false)
    expect(CACHEABLE_SLUGS.has('clients')).toBe(false)
  })
})
