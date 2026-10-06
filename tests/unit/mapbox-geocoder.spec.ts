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
function stubFetch(handler: (url: string) => { status?: number; body: unknown }) {
  const fetchSpy = vi.fn(async (input: unknown) => {
    const { status = 200, body } = handler(String(input))
    return { ok: status < 300, status, json: async () => body } as Response
  })
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

/** Answer each call with the next status in turn, then a hit for every call after. */
function stubStatuses(...statuses: number[]) {
  let call = 0
  return stubFetch(() => {
    const status = statuses[call++]
    return status === undefined ? { body: feature('mbx-late', [13.4, 52.5]) } : { status, body: {} }
  })
}

/** Run a lookup to its end with the retry backoff skipped. */
async function settled<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return promise
}

const feature = (mapboxId?: string, coordinates?: [number, number]) => ({
  features: [{ properties: mapboxId ? { mapbox_id: mapboxId } : {}, geometry: { coordinates } }],
})

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
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
  const placed = (context: Record<string, unknown>, properties: Record<string, unknown> = {}) => ({
    features: [
      {
        properties: { mapbox_id: 'mbx-address', feature_type: 'address', context, ...properties },
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
      featureType: 'address',
      latitude: 52.5026,
      longitude: 13.4186,
      countryCode: 'DE',
      subdivisionCode: 'BE',
      regionMapboxId: 'mbx-be',
      placeName: 'Berlin',
      placeId: 'mbx-berlin',
    })
  })

  it('reports a match coarser than an address by its own feature type', async () => {
    stubFetch(() => ({
      body: placed(berlinContext, { mapbox_id: 'mbx-street', feature_type: 'street' }),
    }))
    expect(await located({ query: 'Oranienstraße 999, Berlin', types: 'address' })).toMatchObject({
      mapboxId: 'mbx-street',
      featureType: 'street',
      placeId: 'mbx-berlin',
    })
  })

  it('takes a town that is itself the match as its own place', async () => {
    // A `place` feature has no `place` layer above it, so a city lookup used to
    // come back with no place id at all, and phase 5 had nothing to match on.
    stubFetch(() => ({
      body: placed(
        { country: berlinContext.country, region: berlinContext.region },
        { mapbox_id: 'mbx-berlin', name: 'Berlin', feature_type: 'place' },
      ),
    }))
    expect(await located({ query: 'Berlin', types: 'place,locality' })).toMatchObject({
      placeName: 'Berlin',
      placeId: 'mbx-berlin',
    })
  })

  it('prefers the place above a locality to the locality itself', async () => {
    stubFetch(() => ({
      body: placed(berlinContext, { mapbox_id: 'mbx-kreuzberg', feature_type: 'locality' }),
    }))
    expect((await located({ query: 'Kreuzberg', types: 'place,locality' })).placeId).toBe(
      'mbx-berlin',
    )
  })

  it("maps Mapbox's subdivision code onto the one the dataset lists", async () => {
    stubFetch(() => ({
      body: placed({
        country: { name: 'Spain', country_code: 'ES' },
        region: { mapbox_id: 'mbx-md', name: 'Community of Madrid', region_code: 'MD' },
      }),
    }))
    expect(await located({ query: 'Madrid', types: 'place' })).toMatchObject({
      subdivisionCode: 'M',
      regionMapboxId: 'mbx-md',
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
    expect(await located({ query: 'Somewhere', types: 'address' })).toMatchObject({
      countryCode: null,
      subdivisionCode: null,
      regionMapboxId: null,
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

    it('reports a server error that outlasts the retries as unavailable', async () => {
      const fetchSpy = stubFetch(() => ({ status: 503, body: {} }))
      expect(await settled(geocodeLocation({ query: 'Berlin', types: 'place' }))).toEqual({
        status: 'unavailable',
      })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('reports a network failure that outlasts the retries as unavailable', async () => {
      const fetchSpy = vi.fn(async () => {
        throw new Error('ECONNRESET')
      })
      vi.stubGlobal('fetch', fetchSpy)
      expect(await settled(geocodeLocation({ query: 'Berlin', types: 'place' }))).toEqual({
        status: 'unavailable',
      })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it.each([500, 502, 503, 504, 429, 408])(
      'retries a %i and takes the answer after it',
      async (status) => {
        const fetchSpy = stubStatuses(status)
        const outcome = await settled(geocodeLocation({ query: 'Berlin', types: 'place' }))
        expect(outcome.status).toBe('found')
        expect(fetchSpy).toHaveBeenCalledTimes(2)
      },
    )

    it('gives each attempt its own bounded timeout', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout')
      stubFetch(() => ({ status: 503, body: {} }))
      await settled(geocodeLocation({ query: 'Berlin', types: 'place' }))
      expect(timeout).toHaveBeenCalledTimes(3)
      for (const [ms] of timeout.mock.calls) expect(ms).toBeLessThanOrEqual(8_000)
      timeout.mockRestore()
    })

    it('reports a 200 whose body is not a result as unavailable, not as a miss', async () => {
      // Read as "no features", an aborted or truncated body would become a
      // permanent "could not find this location" for a row Mapbox never
      // answered.
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            ({
              ok: true,
              status: 200,
              json: async () => {
                throw new DOMException('The operation was aborted.', 'AbortError')
              },
            }) as unknown as Response,
        ),
      )
      expect(await settled(geocodeLocation({ query: 'Berlin', types: 'place' }))).toEqual({
        status: 'unavailable',
      })

      stubFetch(() => ({ body: '<html>gateway</html>' }))
      expect(await settled(geocodeLocation({ query: 'Berlin', types: 'place' }))).toEqual({
        status: 'unavailable',
      })
    })

    it('reports a missing token as unconfigured, without calling fetch', async () => {
      vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '')
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      expect(await geocodeLocation({ query: 'Berlin', types: 'place' })).toEqual({
        status: 'unconfigured',
        httpStatus: null,
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each([401, 403])('reports a %i as unconfigured, without retrying', async (status) => {
      // The token is wrong for every row alike, so no row may carry it as an error.
      const fetchSpy = stubFetch(() => ({ status, body: {} }))
      expect(await settled(geocodeLocation({ query: 'Berlin', types: 'place' }))).toEqual({
        status: 'unconfigured',
        httpStatus: status,
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('a refusal is an answer about the query', () => {
    it.each([400, 404, 422])('reports a %i as refused, once, with its status', async (status) => {
      // ⚠ Retrying it, or reporting it as an outage, stalls the batch on this
      // row for good: every resume asks the same query and gets the same 4xx.
      const fetchSpy = stubFetch(() => ({ status, body: { message: 'Query too long' } }))
      expect(await settled(geocodeLocation({ query: 'x'.repeat(300), types: 'address' }))).toEqual({
        status: 'refused',
        httpStatus: status,
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('reports a blank query as a miss, without calling fetch', async () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      expect(await geocodeLocation({ query: '  ', types: 'place' })).toEqual({ status: 'missed' })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
