/**
 * The canonical Atlas URL contract (#634).
 *
 * The table is not written here — it is read from
 * `src/lib/atlas/atlas-url-contract.json`, the fixture SahajCloud,
 * SahajAtlasWeb and WeMeditateWeb all assert against. Three repos composing
 * and parsing the same URL is exactly the kind of agreement that rots
 * silently, so the cases live in data one repo can copy from another rather
 * than in three hand-maintained test files.
 */
import { describe, expect, it } from 'vitest'

import contract from '@/lib/atlas/atlas-url-contract.json'
import type { CanonicalTarget } from '@/lib/atlas/canonicalUrl'
import { ATLAS_QUERY_PARAM, buildCanonicalUrl, canonicalUrlBase } from '@/lib/atlas/canonicalUrl'

interface ContractCase {
  name: string
  target: CanonicalTarget
  webPath: string
  expected: string | null
}

const cases = contract.cases as ContractCase[]

describe('atlas-url-contract fixture', () => {
  it('is the shape the other two repos read', () => {
    expect(contract.version).toBe(1)
    expect(contract.queryParam).toBe(ATLAS_QUERY_PARAM)
    expect(cases.length).toBeGreaterThan(0)
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    expect(buildCanonicalUrl(testCase.target, testCase.webPath)).toBe(testCase.expected)
  })
})

describe('buildCanonicalUrl', () => {
  const owner: CanonicalTarget = {
    origin: 'https://sahajayoga.nl',
    mount: '/locatelessons/',
    routing: 'query',
  }

  it('never emits a fragment for any fixture case', () => {
    for (const testCase of cases) {
      const url = buildCanonicalUrl(testCase.target, testCase.webPath)
      if (url !== null) expect(url).not.toContain('#')
    }
  })

  it('never emits the noindex Atlas host', () => {
    for (const testCase of cases) {
      const url = buildCanonicalUrl(testCase.target, testCase.webPath)
      if (url !== null) expect(url).not.toContain('sahajatlas')
    }
  })

  it('composes as base + path, which is what publicUrlFields relies on', () => {
    // `webUrl` is built by `publicUrlFields` as `base + webPath`, not by calling
    // buildCanonicalUrl — so if these two ever disagreed, the collection fields
    // would emit something no test of the builder would catch.
    for (const testCase of cases) {
      const full = buildCanonicalUrl(testCase.target, testCase.webPath)
      if (full === null) continue
      expect(`${canonicalUrlBase(testCase.target)}${testCase.webPath}`).toBe(full)
    }
  })

  it('appends a numeric event id as a further path segment', () => {
    expect(buildCanonicalUrl(owner, '/nl/amsterdam/1204')).toBe(
      'https://sahajayoga.nl/locatelessons/?atlas=/nl/amsterdam/1204',
    )
  })

  it('refuses a mount that is a full URL rather than a path', () => {
    expect(buildCanonicalUrl({ ...owner, mount: 'https://elsewhere.example' }, '/nl')).toBeNull()
  })
})

/**
 * The builder emits `webPath` **raw**, not percent-encoded, and that is only a
 * no-op because every segment a path can contain is already URL-safe: region
 * slugs are transliterated to `[a-z0-9-]` (Москва → `moskva`, see
 * `Regions.ts`) and event ids are numeric.
 *
 * This asserts that assumption directly, so widening the slug charset fails
 * here — loudly, next to the reason — instead of silently emitting a URL with
 * an unencoded space or a `?` in it.
 */
describe('slug-charset assumption behind emitting the path raw', () => {
  const SLUG_PATH = new RegExp(contract.slugPattern)

  const realisticPaths = [
    '/united-kingdom',
    '/nl/amsterdam',
    '/belgium/flanders/antwerp/downtown-hall',
    '/belgium/flanders/antwerp/downtown-hall/12345',
    '/russia/moskva',
    '/georgia-united-states',
  ]

  it.each(realisticPaths)('%s matches the slug charset', (path) => {
    expect(SLUG_PATH.test(path)).toBe(true)
  })

  it.each(realisticPaths)('%s survives the builder unchanged', (path) => {
    const url = buildCanonicalUrl(
      { origin: 'https://host.example', mount: '/map', routing: 'path' },
      path,
    )
    expect(url).toBe(`https://host.example/map${path}`)
    // Raw is only safe because encoding would be a no-op — prove it.
    expect(encodeURI(path)).toBe(path)
  })

  it.each(['/nl/Amsterdam', '/nl/amster dam', '/nl/москва', '/nl/a?b', '/nl/'])(
    'rejects %s, which the raw-emission assumption does not cover',
    (path) => {
      expect(SLUG_PATH.test(path)).toBe(false)
    },
  )
})
