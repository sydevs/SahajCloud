import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  geocodeLocation,
  geocodeRegion,
  MANUAL_LOCATION,
  resolveRegionLocation,
} from '@/lib/mapbox/geocoder'

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

describe('geocodeLocation', () => {
  /** A Search Box `/forward` body with the context layers the import reads. */
  const placed = (context: Record<string, unknown>) => ({
    features: [
      {
        properties: { mapbox_id: 'mbx-address', context },
        geometry: { coordinates: [13.4186, 52.5026] },
      },
    ],
  })

  const berlinContext = {
    country: { mapbox_id: 'mbx-de', name: 'Germany', country_code: 'DE' },
    region: { mapbox_id: 'mbx-be', name: 'Berlin', region_code: 'BE', region_code_full: 'DE-BE' },
    place: { mapbox_id: 'mbx-berlin', name: 'Berlin' },
  }

  /** The found location, or a thrown assertion naming the status instead. */
  async function located(args: { query: string; types: string; countryCode?: string }) {
    const outcome = await geocodeLocation(args)
    if (outcome.status !== 'found') throw new Error(`expected a location, got ${outcome.status}`)
    return outcome.location
  }

  it('returns the point and the administrative context around it', async () => {
    stubFetch(() => ({ body: placed(berlinContext) }))
    expect(await located({ query: 'Oranienstraße 25, Berlin', types: 'address,poi' })).toEqual({
      mapboxId: 'mbx-address',
      latitude: 52.5026,
      longitude: 13.4186,
      countryCode: 'DE',
      subdivisionCode: 'BE',
      placeName: 'Berlin',
      placeId: 'mbx-berlin',
    })
  })

  it("restricts the search to the caller's country and asks for its own types", async () => {
    let seenUrl = ''
    stubFetch((url) => {
      seenUrl = url
      return { body: placed(berlinContext) }
    })
    await geocodeLocation({ query: 'Berlin', types: 'place,locality', countryCode: 'DE' })
    expect(seenUrl).toContain('country=de')
    expect(seenUrl).toContain('types=place%2Clocality')
  })

  it("reads a context layer's id under either key Mapbox spells it with", async () => {
    // `@mapbox/search-js-core` types it as `id`; the API reference calls it
    // `mapbox_id`. Both have to resolve, or phase 5 matches no existing region.
    stubFetch(() => ({
      body: placed({ ...berlinContext, place: { id: 'mbx-berlin', name: 'Berlin' } }),
    }))
    expect((await located({ query: 'Berlin', types: 'place' })).placeId).toBe('mbx-berlin')
  })

  it('reads the city off `locality` where a country files one below `place`', async () => {
    stubFetch(() => ({
      body: placed({
        country: berlinContext.country,
        locality: { mapbox_id: 'mbx-loc', name: 'Harlem' },
      }),
    }))
    expect(await located({ query: 'Harlem', types: 'place,locality' })).toMatchObject({
      placeName: 'Harlem',
      placeId: 'mbx-loc',
    })
  })

  it('resolves a subdivision Mapbox spelled only country-prefixed', async () => {
    stubFetch(() => ({
      body: placed({
        country: berlinContext.country,
        region: { name: 'Bayern', region_code_full: 'DE-BY' },
      }),
    }))
    expect((await located({ query: 'München', types: 'place' })).subdivisionCode).toBe('BY')
  })

  it('resolves a subdivision Mapbox named but did not code', async () => {
    stubFetch(() => ({
      body: placed({ country: berlinContext.country, region: { name: 'Bayern' } }),
    }))
    expect((await located({ query: 'München', types: 'place' })).subdivisionCode).toBe('BY')
  })

  it('leaves the context codes null when Mapbox sent none', async () => {
    stubFetch(() => ({ body: placed({}) }))
    expect(await located({ query: 'Somewhere', types: 'place' })).toMatchObject({
      countryCode: null,
      subdivisionCode: null,
      placeName: null,
      placeId: null,
    })
  })

  describe('a miss and an outage are different answers', () => {
    // ⚠ The whole point of the three-way outcome: a caller writing a permanent
    // row error on an outage turns minutes of Mapbox trouble into addresses a
    // volunteer can only fix by re-uploading the file.

    it('reports an empty result set as a miss', async () => {
      stubFetch(() => ({ body: { features: [] } }))
      expect(await geocodeLocation({ query: 'Nowhere', types: 'place' })).toEqual({
        status: 'missed',
      })
    })

    it('reports a feature with no coordinates as a miss', async () => {
      stubFetch(() => ({ body: { features: [{ properties: { context: berlinContext } }] } }))
      expect(await geocodeLocation({ query: 'Berlin', types: 'place' })).toEqual({
        status: 'missed',
      })
    })

    it('reports an HTTP failure as unavailable', async () => {
      stubFetch(() => ({ ok: false, body: {} }))
      expect(await geocodeLocation({ query: 'Berlin', types: 'place' })).toEqual({
        status: 'unavailable',
      })
    })

    it('reports a network failure that outlasts the retries as unavailable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('ECONNRESET')
        }),
      )
      expect(await geocodeLocation({ query: 'Berlin', types: 'place' })).toEqual({
        status: 'unavailable',
      })
    })

    it('reports a missing token as unavailable, without calling fetch', async () => {
      vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '')
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      expect(await geocodeLocation({ query: 'Berlin', types: 'place' })).toEqual({
        status: 'unavailable',
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
