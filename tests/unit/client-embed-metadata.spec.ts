import type {
  EmbedMetadata,
  EmbedMountObservation,
} from '../../src/lib/clients/embedMetadata'
import type { Client } from '../../src/payload-types'

import { describe, expect, expectTypeOf, it } from 'vitest'


import {
  EMBED_REPORT_REFRESH_MS,
  MAX_EMBED_MOUNTS,
  MAX_MOUNT_KEY_LENGTH,
  mergeEmbedReport,
  parseMountKey,
  sanitizeEmbedMetadata,
} from '../../src/lib/clients/embedMetadata'

const OBSERVATION: EmbedMountObservation = {
  mode: 'iframe',
  topLevel: false,
  urlWritable: true,
  paramPersisted: true,
  routing: 'query',
}

const AT = '2026-08-14T09:12:00.000Z'

/** `at` shifted by `ms`, for exercising the freshness window. */
const shift = (ms: number) => new Date(Date.parse(AT) + ms).toISOString()

describe('parseMountKey', () => {
  it('normalizes an origin + pathname into a key and its host', () => {
    const result = parseMountKey('https://sahajayoga.nl/locatelessons')
    expect(result).toEqual({
      ok: true,
      key: 'https://sahajayoga.nl/locatelessons',
      host: 'sahajayoga.nl',
    })
  })

  it('collapses spellings that name the same page', () => {
    // Default port and host case are not distinctions — two spellings of one
    // page must not accumulate as two mounts.
    const withPort = parseMountKey('https://Sahajayoga.NL:443/locatelessons')
    expect(withPort.ok && withPort.key).toBe('https://sahajayoga.nl/locatelessons')
  })

  // The AC: the widget strips query + fragment before sending, and the endpoint
  // rejects a payload that carries either rather than trusting the client. A
  // host page's query string can carry session tokens we have no business
  // storing, so silently cleaning it up would hide a misbehaving widget.
  it.each([
    ['a query string', 'https://sahajayoga.nl/locatelessons?token=secret'],
    ['a fragment', 'https://sahajayoga.nl/locatelessons#section'],
    ['a bare query marker', 'https://sahajayoga.nl/?p=123'],
  ])('rejects %s', (_label, url) => {
    expect(parseMountKey(url)).toEqual({ ok: false, reason: 'query_or_fragment' })
  })

  it.each([
    ['a relative path', '/locatelessons', 'invalid_url'],
    ['gibberish', 'not a url', 'invalid_url'],
    ['a javascript: url', 'javascript:alert(1)', 'unsupported_scheme'],
    ['a data: url', 'data:text/html,<b>x</b>', 'unsupported_scheme'],
    ['embedded credentials', 'https://user:pass@sahajayoga.nl/x', 'credentials'],
  ])('rejects %s', (_label, url, reason) => {
    expect(parseMountKey(url)).toEqual({ ok: false, reason })
  })

  it('rejects an over-long url before parsing it', () => {
    const url = `https://sahajayoga.nl/${'a'.repeat(MAX_MOUNT_KEY_LENGTH)}`
    expect(parseMountKey(url)).toEqual({ ok: false, reason: 'too_long' })
  })
})

describe('sanitizeEmbedMetadata', () => {
  it('drops malformed records and reports how many', () => {
    const { metadata, dropped } = sanitizeEmbedMetadata({
      'https://a.org/x': { ...OBSERVATION, lastSeen: AT },
      'https://a.org/bad': { mode: 'carrier-pigeon', lastSeen: AT },
      'https://a.org/worse': 'not an object',
    })
    expect(Object.keys(metadata)).toEqual(['https://a.org/x'])
    expect(dropped).toBe(2)
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'nope'],
  ])('treats %s as empty', (_label, stored) => {
    expect(sanitizeEmbedMetadata(stored)).toEqual({ metadata: {}, dropped: 0 })
  })
})

describe('mergeEmbedReport', () => {
  // The AC: two reports from different pages of one site produce two keys, not
  // one overwrite.
  it('accumulates one record per mount', () => {
    const first = mergeEmbedReport({
      stored: null,
      key: 'https://a.org/lessons',
      observation: OBSERVATION,
      at: AT,
    })
    const second = mergeEmbedReport({
      stored: first.metadata,
      key: 'https://a.org/classes',
      observation: { ...OBSERVATION, mode: 'script' },
      at: AT,
    })

    expect(Object.keys(second.metadata).sort()).toEqual([
      'https://a.org/classes',
      'https://a.org/lessons',
    ])
    expect(second.metadata['https://a.org/lessons'].mode).toBe('iframe')
    expect(second.metadata['https://a.org/classes'].mode).toBe('script')
  })

  it('stamps lastSeen from the supplied clock', () => {
    const { metadata, changed } = mergeEmbedReport({
      stored: null,
      key: 'https://a.org/x',
      observation: OBSERVATION,
      at: AT,
    })
    expect(changed).toBe(true)
    expect(metadata['https://a.org/x']).toEqual({ ...OBSERVATION, lastSeen: AT })
  })

  it('reports no change for a recent identical observation', () => {
    const stored: EmbedMetadata = { 'https://a.org/x': { ...OBSERVATION, lastSeen: AT } }
    const result = mergeEmbedReport({
      stored,
      key: 'https://a.org/x',
      observation: OBSERVATION,
      at: shift(EMBED_REPORT_REFRESH_MS - 1),
    })
    // This is what keeps a flood of forged reports off the database entirely.
    expect(result.changed).toBe(false)
    expect(result.metadata).toEqual(stored)
  })

  it('refreshes an identical observation once it goes stale', () => {
    const at = shift(EMBED_REPORT_REFRESH_MS + 1)
    const result = mergeEmbedReport({
      stored: { 'https://a.org/x': { ...OBSERVATION, lastSeen: AT } },
      key: 'https://a.org/x',
      observation: OBSERVATION,
      at,
    })
    expect(result.changed).toBe(true)
    expect(result.metadata['https://a.org/x'].lastSeen).toBe(at)
  })

  it('writes when a recent observation differs', () => {
    const result = mergeEmbedReport({
      stored: { 'https://a.org/x': { ...OBSERVATION, lastSeen: AT } },
      key: 'https://a.org/x',
      observation: { ...OBSERVATION, urlWritable: false },
      at: shift(1000),
    })
    expect(result.changed).toBe(true)
    expect(result.metadata['https://a.org/x'].urlWritable).toBe(false)
  })

  it('writes even when unchanged if a malformed sibling needs repairing', () => {
    // Otherwise one bad record makes every later report fail the field's JSON
    // Schema and the endpoint 500s forever.
    const result = mergeEmbedReport({
      stored: {
        'https://a.org/x': { ...OBSERVATION, lastSeen: AT },
        'https://a.org/bad': { nonsense: true },
      },
      key: 'https://a.org/x',
      observation: OBSERVATION,
      at: shift(1000),
    })
    expect(result.changed).toBe(true)
    expect(Object.keys(result.metadata)).toEqual(['https://a.org/x'])
  })

  describe('mount cap', () => {
    const fill = (count: number, lastSeenBase = 0): EmbedMetadata =>
      Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `https://a.org/p${i}`,
          { ...OBSERVATION, lastSeen: shift(lastSeenBase + i * 1000) },
        ]),
      )

    it('evicts least-recently-seen mounts past the cap', () => {
      const result = mergeEmbedReport({
        stored: fill(MAX_EMBED_MOUNTS),
        key: 'https://a.org/new',
        observation: OBSERVATION,
        at: shift(10_000_000),
      })

      expect(result.evicted).toEqual(['https://a.org/p0'])
      expect(Object.keys(result.metadata)).toHaveLength(MAX_EMBED_MOUNTS)
      expect(result.metadata['https://a.org/new']).toBeDefined()
      expect(result.metadata['https://a.org/p0']).toBeUndefined()
    })

    it('never evicts the mount just reported', () => {
      // A clock running behind would otherwise make the new record look oldest
      // and delete the very write we came to make.
      const result = mergeEmbedReport({
        stored: fill(MAX_EMBED_MOUNTS, 10_000_000),
        key: 'https://a.org/new',
        observation: OBSERVATION,
        at: AT,
      })
      expect(result.metadata['https://a.org/new']).toBeDefined()
      expect(result.evicted).toHaveLength(1)
    })

    it('leaves an at-capacity record alone when nothing is added', () => {
      const stored = fill(MAX_EMBED_MOUNTS)
      const result = mergeEmbedReport({
        stored,
        key: 'https://a.org/p0',
        observation: OBSERVATION,
        at: shift(10_000_000),
      })
      expect(result.evicted).toEqual([])
      expect(Object.keys(result.metadata)).toHaveLength(MAX_EMBED_MOUNTS)
    })
  })
})

describe('stored shape agrees with the generated type', () => {
  // The field's JSON Schema is what Payload generates `Client['embedMetadata']`
  // from, so this assignment fails to compile if the hand-written record type
  // and the schema ever drift apart. Verified by mutation: adding a field to
  // EmbedMountRecord that the schema does not declare breaks `pnpm typecheck`.
  it('is assignable in both directions', () => {
    expectTypeOf<EmbedMetadata>().toExtend<NonNullable<Client['embedMetadata']>>()
    expectTypeOf<NonNullable<Client['embedMetadata']>>().toExtend<EmbedMetadata>()
  })
})
