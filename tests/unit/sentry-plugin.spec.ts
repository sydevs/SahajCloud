/**
 * Tests for the sentryPlugin default-context builder. Verifies the
 * enriched context introduced for issue #390 — operation, documentId,
 * request body (truncated), and the per-collection `issue` tag — all
 * land in the Sentry payload so the next first-publish 500 is fully
 * diagnosable from the dashboard alone.
 */
import type { AfterErrorHookArgs, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { buildDefaultSentryContext } from '@/lib/sentryPlugin'

type MockReqInput = {
  method?: string
  pathname?: string
  url?: string
  data?: unknown
  locale?: string
  routeParams?: Record<string, unknown>
  user?: { id: string | number; email?: string } | null
}

const buildArgs = (
  req: MockReqInput = {},
  collectionSlug?: string,
  error: Error = new Error('boom'),
): AfterErrorHookArgs => {
  const mockReq = {
    method: req.method,
    pathname: req.pathname,
    url: req.url,
    data: req.data,
    locale: req.locale,
    routeParams: req.routeParams,
    user: req.user ?? null,
  } as unknown as PayloadRequest

  return {
    collection: collectionSlug
      ? ({ slug: collectionSlug } as AfterErrorHookArgs['collection'])
      : undefined,
    context: {},
    error,
    req: mockReq,
  }
}

describe('buildDefaultSentryContext', () => {
  describe('operation tag', () => {
    it.each([
      ['POST', 'create'],
      ['PATCH', 'update'],
      ['PUT', 'update'],
      ['DELETE', 'delete'],
      ['GET', 'read'],
      ['post', 'create'],
    ])('maps HTTP %s to operation %s', (method, expected) => {
      const ctx = buildDefaultSentryContext(buildArgs({ method }), 500)
      expect(ctx.tags?.operation).toBe(expected)
    })

    it('falls back to lowercased method for unknown verbs', () => {
      const ctx = buildDefaultSentryContext(buildArgs({ method: 'OPTIONS' }), 500)
      expect(ctx.tags?.operation).toBe('options')
    })

    it('is undefined when method is missing', () => {
      const ctx = buildDefaultSentryContext(buildArgs({}), 500)
      expect(ctx.tags?.operation).toBeUndefined()
    })
  })

  describe('documentId extraction', () => {
    it('reads id from routeParams when present', () => {
      const ctx = buildDefaultSentryContext(buildArgs({ routeParams: { id: 114 } }), 500)
      expect(ctx.extra?.documentId).toBe('114')
    })

    it('falls back to last pathname segment for /api/<collection>/<id>', () => {
      const ctx = buildDefaultSentryContext(
        buildArgs({ pathname: '/api/meditations/114' }),
        500,
      )
      expect(ctx.extra?.documentId).toBe('114')
    })

    it('does not extract id for collection-list URLs', () => {
      const ctx = buildDefaultSentryContext(buildArgs({ pathname: '/api/meditations' }), 500)
      expect(ctx.extra?.documentId).toBeUndefined()
    })

    it('does not extract id from nested subroutes like /versions', () => {
      const ctx = buildDefaultSentryContext(
        buildArgs({ pathname: '/api/meditations/114/versions' }),
        500,
      )
      expect(ctx.extra?.documentId).toBeUndefined()
    })

    it('skips well-known non-id segments (count, access, me)', () => {
      for (const segment of ['count', 'access', 'me']) {
        const ctx = buildDefaultSentryContext(
          buildArgs({ pathname: `/api/users/${segment}` }),
          500,
        )
        expect(ctx.extra?.documentId).toBeUndefined()
      }
    })
  })

  describe('request body capture', () => {
    it('includes full body and byte count for small payloads', () => {
      const data = { frames: [{ id: 12, timestamp: 0 }], _status: 'published' }
      const ctx = buildDefaultSentryContext(buildArgs({ data }), 500)
      expect(ctx.extra?.requestBody).toBe(JSON.stringify(data))
      expect(ctx.extra?.requestBodyBytes).toBe(JSON.stringify(data).length)
    })

    it('truncates large payloads at the byte cap with a marker suffix', () => {
      const huge = { blob: 'x'.repeat(20_000) }
      const ctx = buildDefaultSentryContext(buildArgs({ data: huge }), 500)
      const preview = ctx.extra?.requestBody as string
      expect(preview.length).toBeLessThan(JSON.stringify(huge).length)
      expect(preview).toMatch(/…\[truncated \d+ bytes\]$/)
      expect(ctx.extra?.requestBodyBytes).toBe(JSON.stringify(huge).length)
    })

    it('omits requestBody when no data is on the request', () => {
      const ctx = buildDefaultSentryContext(buildArgs({}), 500)
      expect(ctx.extra?.requestBody).toBeUndefined()
      expect(ctx.extra?.requestBodyBytes).toBeUndefined()
    })

    it('serializes unserializable data without throwing', () => {
      const circular: Record<string, unknown> = {}
      circular.self = circular
      const ctx = buildDefaultSentryContext(buildArgs({ data: circular }), 500)
      expect(ctx.extra?.requestBody).toBe('[unserializable]')
    })
  })

  describe('issue tag (collection-scoped)', () => {
    it("tags meditations errors with issue: '390'", () => {
      const ctx = buildDefaultSentryContext(buildArgs({}, 'meditations'), 500)
      expect(ctx.tags?.issue).toBe('390')
      expect(ctx.tags?.collection).toBe('meditations')
    })

    it('does not tag unrelated collections with an issue', () => {
      const ctx = buildDefaultSentryContext(buildArgs({}, 'pages'), 500)
      expect(ctx.tags?.issue).toBeUndefined()
    })

    it('does not tag when collection is undefined (non-collection endpoint)', () => {
      const ctx = buildDefaultSentryContext(buildArgs({}), 500)
      expect(ctx.tags?.issue).toBeUndefined()
      expect(ctx.tags?.collection).toBeUndefined()
    })
  })

  describe('user, level, and base fields', () => {
    it('captures user id and email when authenticated', () => {
      const ctx = buildDefaultSentryContext(
        buildArgs({ user: { id: 42, email: 'me@example.com' } }),
        500,
      )
      expect(ctx.user).toEqual({ id: '42', email: 'me@example.com' })
    })

    it('omits user when request is unauthenticated', () => {
      const ctx = buildDefaultSentryContext(buildArgs({ user: null }), 500)
      expect(ctx.user).toBeUndefined()
    })

    it("uses 'error' level for 500+, 'warning' for <500", () => {
      expect(buildDefaultSentryContext(buildArgs(), 500).level).toBe('error')
      expect(buildDefaultSentryContext(buildArgs(), 404).level).toBe('warning')
    })

    it('forwards url, method, and locale to context', () => {
      const ctx = buildDefaultSentryContext(
        buildArgs({
          method: 'PATCH',
          url: 'https://cloud.sydevelopers.com/api/meditations/114?depth=0',
          locale: 'cs',
        }),
        500,
      )
      expect(ctx.extra?.url).toBe('https://cloud.sydevelopers.com/api/meditations/114?depth=0')
      expect(ctx.extra?.method).toBe('PATCH')
      expect(ctx.tags?.locale).toBe('cs')
    })
  })

  describe('full first-publish failure scenario', () => {
    it('captures everything needed to diagnose a meditations PATCH 500', () => {
      const ctx = buildDefaultSentryContext(
        buildArgs(
          {
            method: 'PATCH',
            pathname: '/api/meditations/114',
            url: 'https://cloud.sydevelopers.com/api/meditations/114?depth=0&locale=en',
            locale: 'en',
            routeParams: { id: 114 },
            user: { id: 7, email: 'editor@example.com' },
            data: {
              _status: 'published',
              frames: [{ id: 12, timestamp: 0 }],
              title: 'Morning Med',
            },
          },
          'meditations',
          new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed'),
        ),
        500,
      )

      expect(ctx.tags).toMatchObject({
        collection: 'meditations',
        operation: 'update',
        issue: '390',
        locale: 'en',
      })
      expect(ctx.extra).toMatchObject({
        status: 500,
        method: 'PATCH',
        documentId: '114',
      })
      expect(ctx.extra?.requestBody).toContain('"_status":"published"')
      expect(ctx.user).toEqual({ id: '7', email: 'editor@example.com' })
      expect(ctx.level).toBe('error')
    })
  })
})
