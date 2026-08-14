import type { EmbedMetadata, EmbedObservation } from '../../src/collections/Clients/embedMetadata'

import { describe, expect, it } from 'vitest'

import { canonicalSeedFromLegacy } from '../../src/collections/Clients/canonicalSeed'
import {
  embedReportSchema,
  isBareOrigin,
  MAX_EMBED_MOUNTS,
  mergeEmbedReport,
  mountKey,
} from '../../src/collections/Clients/embedMetadata'

const observation: EmbedObservation = {
  mode: 'iframe',
  topLevel: false,
  urlWritable: true,
  paramPersisted: true,
  routing: 'query',
}

const now = new Date('2026-08-14T09:12:00.000Z')

const validBody = {
  origin: 'https://sahajayoga.nl',
  pathname: '/locatelessons',
  ...observation,
}

describe('isBareOrigin', () => {
  it.each(['https://sahajayoga.nl', 'http://localhost:3000', 'https://a.b.example.org:8443'])(
    'accepts %s',
    (value) => expect(isBareOrigin(value)).toBe(true),
  )

  it.each([
    ['https://sahajayoga.nl/', 'a trailing slash is already a path'],
    ['https://sahajayoga.nl/locatelessons', 'carries a path'],
    ['https://sahajayoga.nl?a=1', 'carries a query'],
    ['https://sahajayoga.nl#x', 'carries a fragment'],
    ['sahajayoga.nl', 'no scheme'],
    ['ftp://sahajayoga.nl', 'not http(s)'],
    ['', 'empty'],
  ])('rejects %s (%s)', (value) => expect(isBareOrigin(value)).toBe(false))
})

describe('embedReportSchema', () => {
  it('accepts a well-formed report', () => {
    expect(embedReportSchema.safeParse(validBody).success).toBe(true)
  })

  // The endpoint refuses rather than stripping: a widget leaking the seeker's
  // query parameters must fail loudly, not be quietly cleaned up server-side.
  it.each(['/locatelessons?event=12', '/locatelessons#top'])('rejects pathname %s', (pathname) => {
    const result = embedReportSchema.safeParse({ ...validBody, pathname })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain('query string or fragment')
  })

  it('rejects a pathname that is not rooted', () => {
    expect(embedReportSchema.safeParse({ ...validBody, pathname: 'locatelessons' }).success).toBe(
      false,
    )
  })

  it('rejects hash routing, which the widget is dropping entirely', () => {
    expect(embedReportSchema.safeParse({ ...validBody, routing: 'hash' }).success).toBe(false)
  })

  it('requires every observed flag — a partial report is not a report', () => {
    const { topLevel: _omitted, ...partial } = validBody
    expect(embedReportSchema.safeParse(partial).success).toBe(false)
  })
})

describe('mountKey', () => {
  it('keys on origin and path together, so one site can hold several mounts', () => {
    expect(mountKey('https://sahajayoga.nl', '/locatelessons')).toBe(
      'https://sahajayoga.nl/locatelessons',
    )
    expect(mountKey('https://sahajayoga.nl', '/locatelessons')).not.toBe(
      mountKey('https://sahajayoga.nl', '/map'),
    )
  })
})

describe('mergeEmbedReport', () => {
  it('records a first mount', () => {
    const result = mergeEmbedReport({ existing: null, key: 'a', observation, now })
    expect(result.status).toBe('merged')
    expect(result.status === 'merged' && result.metadata.a).toEqual({
      ...observation,
      lastSeen: now.toISOString(),
    })
  })

  it('adds a second page as its own key rather than overwriting the first', () => {
    const first = mergeEmbedReport({
      existing: null,
      key: 'https://sahajayoga.nl/locatelessons',
      observation,
      now,
    })
    const second = mergeEmbedReport({
      existing: first.status === 'merged' ? first.metadata : null,
      key: 'https://sahajayoga.nl/map',
      observation: { ...observation, mode: 'inline', topLevel: true },
      now,
    })

    expect(second.status).toBe('merged')
    const metadata = second.status === 'merged' ? second.metadata : {}
    expect(Object.keys(metadata).sort()).toEqual([
      'https://sahajayoga.nl/locatelessons',
      'https://sahajayoga.nl/map',
    ])
    expect(metadata['https://sahajayoga.nl/locatelessons'].mode).toBe('iframe')
    expect(metadata['https://sahajayoga.nl/map'].mode).toBe('inline')
  })

  it('does not write when an unchanged mount was seen within the interval', () => {
    const existing: EmbedMetadata = {
      a: { ...observation, lastSeen: '2026-08-14T09:00:00.000Z' },
    }
    expect(mergeEmbedReport({ existing, key: 'a', observation, now }).status).toBe('unchanged')
  })

  it('writes an unchanged mount again once it is stale', () => {
    const existing: EmbedMetadata = {
      a: { ...observation, lastSeen: '2026-08-14T07:00:00.000Z' },
    }
    const result = mergeEmbedReport({ existing, key: 'a', observation, now })
    expect(result.status).toBe('merged')
    expect(result.status === 'merged' && result.metadata.a.lastSeen).toBe(now.toISOString())
  })

  it('writes a changed mount immediately, however recently it was seen', () => {
    const existing: EmbedMetadata = {
      a: { ...observation, lastSeen: '2026-08-14T09:11:59.000Z' },
    }
    const result = mergeEmbedReport({
      existing,
      key: 'a',
      observation: { ...observation, urlWritable: false },
      now,
    })
    expect(result.status).toBe('merged')
    expect(result.status === 'merged' && result.metadata.a.urlWritable).toBe(false)
  })

  it('treats an unparseable stored timestamp as stale so a mount cannot freeze', () => {
    const existing: EmbedMetadata = { a: { ...observation, lastSeen: 'not-a-date' } }
    expect(mergeEmbedReport({ existing, key: 'a', observation, now }).status).toBe('merged')
  })

  it('refuses a new mount past the cap but keeps serving the known ones', () => {
    const existing: EmbedMetadata = Object.fromEntries(
      Array.from({ length: MAX_EMBED_MOUNTS }, (_, i) => [
        `/p${i}`,
        { ...observation, lastSeen: '2026-08-01T00:00:00.000Z' },
      ]),
    )

    const refused = mergeEmbedReport({ existing, key: '/new', observation, now })
    expect(refused.status).toBe('limit-exceeded')
    expect(refused.status === 'limit-exceeded' && refused.limit).toBe(MAX_EMBED_MOUNTS)

    // An existing mount is untouched by the cap — only growth is refused.
    const known = mergeEmbedReport({
      existing,
      key: '/p0',
      observation: { ...observation, routing: 'path' },
      now,
    })
    expect(known.status).toBe('merged')
  })
})

describe('canonicalSeedFromLegacy', () => {
  it('takes the domain and routing an imported record actually carries', () => {
    expect(
      canonicalSeedFromLegacy({ config: { domain: 'www.sahajayoga.ca', routing_type: 'query' } }),
    ).toEqual({ domain: 'www.sahajayoga.ca', routing: 'query' })
  })

  it('normalises case and surrounding whitespace', () => {
    expect(canonicalSeedFromLegacy({ config: { domain: '  Sahajayoga.NL  ' } })).toEqual({
      domain: 'sahajayoga.nl',
    })
  })

  // Two of the 31 imported records hold two hosts in the one domain field.
  // Seeding either as *the* canonical domain would name a site at random.
  it('refuses a domain holding more than one host', () => {
    expect(
      canonicalSeedFromLegacy({ config: { domain: 'sahajayoga.fr\r\nyogaessonne.fr' } }),
    ).toBeNull()
  })

  it('keeps a legible routing even when the domain is unusable', () => {
    expect(
      canonicalSeedFromLegacy({
        config: { domain: 'sahajayoga.fr\r\nyogaessonne.fr', routing_type: 'path' },
      }),
    ).toEqual({ routing: 'path' })
  })

  it('drops a routing value outside the new enum (the legacy system had hash)', () => {
    expect(canonicalSeedFromLegacy({ config: { domain: 'a.org', routing_type: 'hash' } })).toEqual({
      domain: 'a.org',
    })
  })

  it.each<[string, unknown]>([
    ['no legacy data', undefined],
    ['no config', {}],
    ['empty config', { config: {} }],
    ['blank domain', { config: { domain: '' } }],
  ])('returns null when there is %s', (_label, legacyData) => {
    expect(canonicalSeedFromLegacy(legacyData)).toBeNull()
  })

  it('never derives `enabled` — that is a human decision', () => {
    const seed = canonicalSeedFromLegacy({
      config: { domain: 'a.org', routing_type: 'query', embed_type: 'iframe' },
    })
    expect(seed).not.toHaveProperty('enabled')
  })
})
