import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  geocodeLocation,
  geocodeRegion,
  MANUAL_LOCATION,
  resolveRegionLocation,
  type GeocodeLocationArgs,
} from '@/lib/mapbox/geocoder'

/** The `/forward` types used by the coordless-fallback step. */
const FALLBACK_TYPES = 'country,region,district,place,locality'

/** Stub global fetch with a per-URL handler returning a Geocoding v6-shaped body. */
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

const feature = (mapboxId?: string, coordinates?: [number, number], featureType?: string) => ({
  features: [
    {
      properties: {
        ...(mapboxId ? { mapbox_id: mapboxId } : {}),
        ...(featureType ? { feature_type: featureType } : {}),
      },
      geometry: { coordinates },
    },
  ],
})

/** The URL of the last request the stub answered. */
const lastUrl = (spy: ReturnType<typeof stubFetch>) => new URL(String(spy.mock.calls.at(-1)?.[0]))

/** Every stored lookup owes the same endpoint and the same flag (#893). */
function expectPermanentV6(url: URL) {
  expect(url.pathname).toBe('/search/geocode/v6/forward')
  expect(url.searchParams.get('permanent')).toBe('true')
}

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
  it('returns the mapbox_id on a hit', async () => {
    stubFetch(() => ({ body: feature('mbx-canada') }))
    expect(await geocodeRegion({ name: 'Canada', level: 'country' })).toBe('mbx-canada')
  })

  /**
   * ⚠ **The endpoint is the assertion, not the parameter.** Search Box ignores
   * `permanent`, so a spec pinning the flag alone would be green against the
   * API that cannot honour it (#893).
   */
  it('asks Geocoding v6, as permanent, because the answer is stored', async () => {
    const fetchSpy = stubFetch(() => ({ body: feature('mbx-canada') }))
    await geocodeRegion({ name: 'Canada', level: 'country' })
    const url = lastUrl(fetchSpy)
    expectPermanentV6(url)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: 'Canada', types: 'country' })
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

  it('falls back to manual + legacy coords when a city misses', async () => {
    stubFetch(() => ({ body: { features: [] } }))
    const { location, warning } = await resolveRegionLocation({
      name: 'Some Town',
      level: 'city',
      latitude: 49.2,
      longitude: -123.0,
    })
    expect(location).toMatchObject({
      mapboxId: MANUAL_LOCATION,
      manual: true,
      latitude: 49.2,
      longitude: -123.0,
      radius: 50_000, // default region radius
    })
    expect(warning).toContain('manual')
  })

  it('approximates a coordless miss from an untyped centroid search', async () => {
    const fetchSpy = stubFetch((url) =>
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
    expectPermanentV6(lastUrl(fetchSpy)) // the centroid is stored too
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

describe('a venue, which Geocoding v6 holds no POI layer for', () => {
  const venue = {
    name: 'Friends Meeting House',
    level: 'venue' as const,
    latitude: 51.36,
    longitude: 1.42,
    countryCode: 'GB',
    address: { street: '2 Osborne Road', postCode: 'CT10 2BL', city: 'Broadstairs' },
  }

  /** A v6 answer at one feature type, with a point. */
  const at = (featureType: string, mapboxId: string) =>
    feature(mapboxId, [1.42, 51.36], featureType)

  it('is placed by its postal address, as a permanent v6 lookup', async () => {
    const fetchSpy = stubFetch(() => ({ body: at('address', 'mbx-door') }))
    const { location, warning } = await resolveRegionLocation(venue)
    expect(location).toEqual({ mapboxId: 'mbx-door', manual: false })
    expect(warning).toBeNull()
    const url = lastUrl(fetchSpy)
    expectPermanentV6(url)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      address_line1: '2 Osborne Road',
      postcode: 'CT10 2BL',
      place: 'Broadstairs',
      country: 'gb',
    })
    // The building's own name is never the query — v6 holds no feature for it.
    expect(url.searchParams.has('q')).toBe(false)
  })

  it('keeps its legacy coordinates when the match is coarser than a door', async () => {
    stubFetch(() => ({ body: at('street', 'mbx-street') }))
    const { location, warning } = await resolveRegionLocation(venue)
    expect(location).toMatchObject({
      mapboxId: MANUAL_LOCATION,
      manual: true,
      latitude: 51.36,
      longitude: 1.42,
      radius: 500, // default venue radius
    })
    expect(warning).toContain('manual')
  })

  it('never reaches Mapbox with no street to place it by', async () => {
    const fetchSpy = stubFetch(() => ({ body: at('address', 'mbx-door') }))
    const { location } = await resolveRegionLocation({
      ...venue,
      address: { ...venue.address, street: null },
    })
    expect(location).toMatchObject({ mapboxId: MANUAL_LOCATION, manual: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('geocodeLocation', () => {
  /** A Geocoding v6 body with the context layers the import reads. */
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
  async function located(args: GeocodeLocationArgs) {
    const outcome = await geocodeLocation(args)
    if (outcome.status !== 'found') throw new Error(`expected a location, got ${outcome.status}`)
    return outcome.location
  }

  it('returns the point, the matched feature and the town around it', async () => {
    stubFetch(() => ({ body: placed(berlinContext) }))
    expect(
      await located({
        kind: 'address',
        address: 'Oranienstraße 25, Berlin',
        city: 'Berlin',
        countryCode: 'DE',
      }),
    ).toEqual({
      mapboxId: 'mbx-address',
      featureType: 'address',
      latitude: 52.5026,
      longitude: 13.4186,
      placeName: 'Berlin',
      placeId: 'mbx-berlin',
    })
  })

  /**
   * ⚠ **Field by field, and permanent.** One line — street, town, state and
   * postcode joined — let Mapbox put Köln's Hansaring in Kiel; the import also
   * stores what comes back, which Mapbox's terms allow only for a permanent
   * geocode.
   */
  it('sends the address as structured fields, to Geocoding v6, as permanent', async () => {
    let seenUrl = ''
    stubFetch((url) => {
      seenUrl = url
      return { body: placed(berlinContext) }
    })
    await geocodeLocation({
      kind: 'address',
      address: 'Hansaring 22',
      postcode: '50670',
      city: 'Köln',
      region: 'NRW',
      countryCode: 'DE',
    })
    const url = new URL(seenUrl)
    expect(url.pathname).toBe('/search/geocode/v6/forward')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      address_line1: 'Hansaring 22',
      postcode: '50670',
      place: 'Köln',
      region: 'NRW',
      country: 'de',
      permanent: 'true',
    })
    expect(url.searchParams.has('q')).toBe(false)
  })

  it('asks a town lookup for a town, and sends no address', async () => {
    let seenUrl = ''
    stubFetch((url) => {
      seenUrl = url
      return { body: placed(berlinContext) }
    })
    await geocodeLocation({ kind: 'place', city: 'Leipzig', countryCode: 'DE', address: 'ignored' })
    const url = new URL(seenUrl)
    expect(url.searchParams.get('types')).toBe('place,locality')
    expect(url.searchParams.has('address_line1')).toBe(false)
  })

  it('reports a match coarser than an address by its own feature type', async () => {
    stubFetch(() => ({
      body: placed(berlinContext, { mapbox_id: 'mbx-street', feature_type: 'street' }),
    }))
    expect(
      await located({
        kind: 'address',
        address: 'Oranienstraße 999, Berlin',
        city: 'Berlin',
        countryCode: 'DE',
      }),
    ).toMatchObject({
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
    expect(await located({ kind: 'place', city: 'Berlin', countryCode: 'DE' })).toMatchObject({
      placeName: 'Berlin',
      placeId: 'mbx-berlin',
    })
  })

  it('prefers the place above a locality to the locality itself', async () => {
    stubFetch(() => ({
      body: placed(berlinContext, { mapbox_id: 'mbx-kreuzberg', feature_type: 'locality' }),
    }))
    expect((await located({ kind: 'place', city: 'Kreuzberg', countryCode: 'DE' })).placeId).toBe(
      'mbx-berlin',
    )
  })

  it("restricts the search to the caller's country and asks for its own types", async () => {
    let seenUrl = ''
    stubFetch((url) => {
      seenUrl = url
      return { body: placed(berlinContext) }
    })
    await geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })
    expect(seenUrl).toContain('country=de')
    expect(seenUrl).toContain('types=place%2Clocality')
  })

  it("reads a context layer's id under either key Mapbox spells it with", async () => {
    // `@mapbox/search-js-core` types it as `id`; the API reference calls it
    // `mapbox_id`. Both have to resolve, or phase 5 matches no existing region.
    stubFetch(() => ({
      body: placed({ ...berlinContext, place: { id: 'mbx-berlin', name: 'Berlin' } }),
    }))
    expect((await located({ kind: 'place', city: 'Berlin', countryCode: 'DE' })).placeId).toBe(
      'mbx-berlin',
    )
  })

  it('reads the city off `locality` where a country files one below `place`', async () => {
    stubFetch(() => ({
      body: placed({
        country: berlinContext.country,
        locality: { mapbox_id: 'mbx-loc', name: 'Harlem' },
      }),
    }))
    expect(await located({ kind: 'place', city: 'Harlem', countryCode: 'DE' })).toMatchObject({
      placeName: 'Harlem',
      placeId: 'mbx-loc',
    })
  })

  it('leaves the town null when Mapbox sent no context', async () => {
    stubFetch(() => ({ body: placed({}) }))
    expect(
      await located({ kind: 'address', address: 'Somewhere', city: 'Berlin', countryCode: 'DE' }),
    ).toMatchObject({ placeName: null, placeId: null })
  })

  describe('a miss and an outage are different answers', () => {
    // ⚠ The whole point of the three-way outcome: a caller writing a permanent
    // row error on an outage turns minutes of Mapbox trouble into addresses a
    // volunteer can only fix by re-uploading the file.

    it('reports an empty result set as a miss', async () => {
      stubFetch(() => ({ body: { features: [] } }))
      expect(await geocodeLocation({ kind: 'place', city: 'Nowhere', countryCode: 'DE' })).toEqual({
        status: 'missed',
      })
    })

    it('reports a feature with no coordinates as a miss', async () => {
      stubFetch(() => ({ body: { features: [{ properties: { context: berlinContext } }] } }))
      expect(await geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })).toEqual({
        status: 'missed',
      })
    })

    it('reports a server error that outlasts the retries as unavailable', async () => {
      const fetchSpy = stubFetch(() => ({ status: 503, body: {} }))
      expect(
        await settled(geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })),
      ).toEqual({
        status: 'unavailable',
      })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('reports a network failure that outlasts the retries as unavailable', async () => {
      const fetchSpy = vi.fn(async () => {
        throw new Error('ECONNRESET')
      })
      vi.stubGlobal('fetch', fetchSpy)
      expect(
        await settled(geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })),
      ).toEqual({
        status: 'unavailable',
      })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it.each([500, 502, 503, 504, 429, 408])(
      'retries a %i and takes the answer after it',
      async (status) => {
        const fetchSpy = stubStatuses(status)
        const outcome = await settled(
          geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' }),
        )
        expect(outcome.status).toBe('found')
        expect(fetchSpy).toHaveBeenCalledTimes(2)
      },
    )

    it('gives each attempt its own bounded timeout', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout')
      stubFetch(() => ({ status: 503, body: {} }))
      await settled(geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' }))
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
      expect(
        await settled(geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })),
      ).toEqual({
        status: 'unavailable',
      })

      stubFetch(() => ({ body: '<html>gateway</html>' }))
      expect(
        await settled(geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })),
      ).toEqual({
        status: 'unavailable',
      })
    })

    it('reports a missing token as unconfigured, without calling fetch', async () => {
      vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '')
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      expect(await geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })).toEqual({
        status: 'unconfigured',
        httpStatus: null,
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each([401, 403])('reports a %i as unconfigured, without retrying', async (status) => {
      // The token is wrong for every row alike, so no row may carry it as an error.
      const fetchSpy = stubFetch(() => ({ status, body: {} }))
      expect(
        await settled(geocodeLocation({ kind: 'place', city: 'Berlin', countryCode: 'DE' })),
      ).toEqual({
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
      expect(
        await settled(
          geocodeLocation({
            kind: 'address',
            address: 'x'.repeat(300),
            city: 'Berlin',
            countryCode: 'DE',
          }),
        ),
      ).toEqual({
        status: 'refused',
        httpStatus: status,
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('reports a blank query as a miss, without calling fetch', async () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      expect(await geocodeLocation({ kind: 'place', city: '  ', countryCode: 'DE' })).toEqual({
        status: 'missed',
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
