import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { geocodeRegion, MANUAL_LOCATION, resolveRegionLocation } from '@/lib/mapbox/geocoder'

/** The Search Box `/forward` types used by the coordless-fallback step. */
const FALLBACK_TYPES = 'country,region,district,place,locality'

/** Stub global fetch with a per-URL handler returning a Search Box-shaped body. */
function stubFetch(handler: (url: string) => { ok?: boolean; body: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const { ok = true, body } = handler(String(input))
      return { ok, status: ok ? 200 : 500, json: async () => body } as Response
    }),
  )
}

const feature = (mapboxId?: string, coordinates?: [number, number]) => ({
  features: [{ properties: mapboxId ? { mapbox_id: mapboxId } : {}, geometry: { coordinates } }],
})

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('geocodeRegion', () => {
  it('returns the Search Box mapbox_id on a hit', async () => {
    stubFetch(() => ({ body: feature('mbx-canada') }))
    expect(await geocodeRegion({ name: 'Canada', level: 'country' })).toBe('mbx-canada')
  })

  it('returns null with no token (and never calls fetch)', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await geocodeRegion({ name: 'Canada', level: 'country' })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns null when there is no match', async () => {
    stubFetch(() => ({ body: { features: [] } }))
    expect(await geocodeRegion({ name: 'Nowhere', level: 'region' })).toBeNull()
  })

  it('biases by proximity when coordinates are supplied', async () => {
    let seenUrl = ''
    stubFetch((url) => {
      seenUrl = url
      return { body: feature('mbx-1') }
    })
    await geocodeRegion({
      name: 'Metro Vancouver',
      level: 'city',
      latitude: 49.2,
      longitude: -123.02,
    })
    expect(seenUrl).toContain('proximity=-123.02%2C49.2')
    expect(seenUrl).toContain('types=place%2Clocality')
  })
})

describe('resolveRegionLocation', () => {
  it('uses the geocoded id when the typed search hits', async () => {
    stubFetch(() => ({ body: feature('mbx-region') }))
    const { location, warning } = await resolveRegionLocation({
      name: 'North of England',
      level: 'region',
    })
    expect(location).toEqual({ mapboxId: 'mbx-region', manual: false })
    expect(warning).toBeNull()
  })

  it('falls back to manual + legacy coords when a city/venue misses', async () => {
    stubFetch(() => ({ body: { features: [] } }))
    const { location, warning } = await resolveRegionLocation({
      name: 'Some Center',
      level: 'venue',
      latitude: 49.2,
      longitude: -123.0,
    })
    expect(location).toMatchObject({
      mapboxId: MANUAL_LOCATION,
      manual: true,
      latitude: 49.2,
      longitude: -123.0,
      radius: 500, // default venue radius
    })
    expect(warning).toContain('manual')
  })

  it('approximates a coordless miss from an untyped centroid search', async () => {
    stubFetch((url) =>
      url.includes(encodeURIComponent(FALLBACK_TYPES))
        ? { body: feature('ignored', [10, 20]) }
        : { body: { features: [] } },
    )
    const { location, warning } = await resolveRegionLocation({
      name: 'Obscure Region',
      level: 'region',
    })
    expect(location).toMatchObject({
      mapboxId: MANUAL_LOCATION,
      manual: true,
      longitude: 10,
      latitude: 20,
    })
    expect(warning).toContain('approximated')
  })

  it('returns manual with null coords when nothing resolves', async () => {
    stubFetch(() => ({ body: { features: [] } }))
    const { location, warning } = await resolveRegionLocation({ name: 'Void', level: 'region' })
    expect(location).toEqual({
      mapboxId: MANUAL_LOCATION,
      manual: true,
      latitude: null,
      longitude: null,
      radius: null,
    })
    expect(warning).toContain('manual cleanup')
  })
})
