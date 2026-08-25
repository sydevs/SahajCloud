import { describe, expect, it } from 'vitest'

import { breadcrumbList, compactNode, jsonLdEscape, jsonLdGraph } from '@/endpoints/atlasSeo/jsonLd'
import {
  buildEventSeo,
  buildRegionSeo,
  eventCard,
  hreflangAlternates,
  truncateAtWord,
} from '@/endpoints/atlasSeo/seoDocument'
import type { AtlasSeoBreadcrumb, AtlasSeoEventCard } from '@/endpoints/responseTypes'
import { ATLAS_WIDGET_LOCALES } from '@/lib/atlas/widgetLocales'
import { LOCALES } from '@/lib/locales'
import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'
import type { Event } from '@/payload-types'

/**
 * The shaping half of `GET /api/atlas/seo` (#645) — everything the endpoint
 * decides once the reads have come back. It is all pure, so it is all tested
 * here rather than through the endpoint, where a failure would say only that
 * some field was wrong.
 */

const PATH_CANONICAL = 'https://wemeditate.com/map/gb/london'
const QUERY_CANONICAL = 'https://sahajayoga.nl/locatelessons/?atlas=/nl/amsterdam'

/** 9:26 AM in Asia/Calcutta (UTC+5:30). */
const FIRST_DATE = '2026-06-13T03:56:00.000Z'

const breadcrumbs: AtlasSeoBreadcrumb[] = [
  { name: 'United Kingdom', route: '/gb', url: 'https://wemeditate.com/map/gb' },
  { name: 'London', route: '/gb/london', url: PATH_CANONICAL },
]

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1204,
    title: 'Evening Meditation',
    languages: ['en'],
    eventType: 'offline',
    inactive: false,
    address: {
      venueName: 'Friends Meeting House',
      street: '12 Broad Street',
      city: 'London',
      region: 'Greater London',
      postCode: 'W1 2AB',
      country: 'United Kingdom',
      latitude: 51.5,
      longitude: -0.12,
    },
    schedule: {
      firstDate: FIRST_DATE,
      firstDate_tz: 'Asia/Calcutta',
      recurrenceType: 'WEEKLY',
      interval: 1,
      weekdays: ['SA'],
      endTime: '20:30',
      lastDate: '2027-01-01T00:00:00.000Z',
    },
    ...overrides,
  } as Event
}

describe('jsonLdEscape', () => {
  // The whole reason this function exists: the string it returns is echoed into
  // a WordPress template that never passes through `wp_kses`.
  it('leaves no `</script` or `<!--` for an HTML parser to act on', () => {
    const escaped = jsonLdEscape({ name: 'Meditation </script><script>alert(1)</script>' })
    expect(escaped).not.toContain('</script')
    expect(escaped).not.toContain('<')
    expect(escaped).toContain('\\u003c')
  })

  it('escapes an HTML comment opener, which also ends a script element early', () => {
    expect(jsonLdEscape({ name: 'a <!-- b' })).not.toContain('<!--')
  })

  it('escapes ampersands, closing off entity-decoding template layers', () => {
    const escaped = jsonLdEscape({ name: 'Tea &amp; Meditation' })
    expect(escaped).not.toContain('&')
    expect(escaped).toContain('\\u0026')
  })

  it('escapes the two Unicode line separators', () => {
    const escaped = jsonLdEscape({ name: 'a b c' })
    expect(escaped).toContain('\\u2028')
    expect(escaped).toContain('\\u2029')
    expect(escaped).not.toContain(' ')
    expect(escaped).not.toContain(' ')
  })

  // Every replacement is a valid JSON escape for the same character, so this is
  // an encoding change and never a content change. If that ever stops holding,
  // consumers get corrupted structured data rather than a loud failure.
  it('round-trips: the escaped output parses back to the original value', () => {
    const value = {
      '@type': 'Event',
      name: 'A & B </script> <!-- c   d',
      nested: { list: ['<x>', '&', 'plain'] },
    }
    expect(JSON.parse(jsonLdEscape(value))).toEqual(value)
  })

  it('never returns undefined, so the return type holds for any input', () => {
    expect(jsonLdEscape(undefined)).toBe('null')
  })
})

describe('compactNode', () => {
  it('drops empty values, which structured-data validators warn on', () => {
    expect(compactNode({ a: 'x', b: null, c: undefined, d: '', e: [], f: 0, g: false })).toEqual({
      a: 'x',
      f: 0,
      g: false,
    })
  })
})

describe('breadcrumbList', () => {
  it('says nothing for a trail of one — a crawler already knows that much', () => {
    expect(breadcrumbList([{ name: 'United Kingdom', url: 'https://x.test/gb' }])).toBeNull()
  })

  it('numbers rungs from 1 and omits `item` where no URL can be published', () => {
    const list = breadcrumbList([
      { name: 'United Kingdom', url: 'https://x.test/gb' },
      { name: 'London', url: null },
    ]) as { itemListElement: Record<string, unknown>[] }
    expect(list.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'United Kingdom',
      item: 'https://x.test/gb',
    })
    expect(list.itemListElement[1]).not.toHaveProperty('item')
  })
})

describe('jsonLdGraph', () => {
  it('always emits a `@graph`, so the envelope is one shape for every route', () => {
    expect(jsonLdGraph([{ '@type': 'Place' }, null])).toEqual({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'Place' }],
    })
  })
})

describe('ATLAS_WIDGET_LOCALES', () => {
  // A code with no CMS locale behind it would advertise an hreflang alternate
  // whose page serves nothing.
  it('is a subset of the locales the CMS is translated into', () => {
    const cmsLocales = LOCALES.map((locale) => locale.code) as string[]
    for (const code of ATLAS_WIDGET_LOCALES) expect(cmsLocales).toContain(code)
  })

  it('is the widget’s ten', () => {
    expect(ATLAS_WIDGET_LOCALES).toHaveLength(10)
  })
})

describe('hreflangAlternates', () => {
  it('emits one row per widget locale plus x-default', () => {
    const alternates = hreflangAlternates(PATH_CANONICAL)
    expect(alternates).toHaveLength(ATLAS_WIDGET_LOCALES.length + 1)
    expect(alternates.at(-1)).toEqual({ hreflang: 'x-default', href: PATH_CANONICAL })
  })

  // x-default is the bare canonical, not the English alternate: that URL really
  // does serve every visitor — the widget picks a language from the page, the
  // browser, or its own `?locale`.
  it('points x-default at the unmodified canonical, not at the `en` row', () => {
    const alternates = hreflangAlternates(PATH_CANONICAL)
    const english = alternates.find((row) => row.hreflang === 'en')
    expect(english?.href).toBe(`${PATH_CANONICAL}?locale=en`)
    expect(alternates.at(-1)?.href).toBe(PATH_CANONICAL)
  })

  it('joins with `&` when the canonical already carries a query — the `query` routing shape', () => {
    const alternates = hreflangAlternates(QUERY_CANONICAL)
    expect(alternates.find((row) => row.hreflang === 'fr')?.href).toBe(
      `${QUERY_CANONICAL}&locale=fr`,
    )
  })

  it('emits nothing without a canonical — a cluster of guesses is worse than none', () => {
    expect(hreflangAlternates(null)).toEqual([])
  })
})

describe('truncateAtWord', () => {
  it('leaves text that already fits untouched, ellipsis included', () => {
    expect(truncateAtWord('short enough', 40)).toBe('short enough')
  })

  it('cuts at a word boundary and marks the cut', () => {
    const cut = truncateAtWord('one two three four five six seven eight', 20)
    expect(cut.length).toBeLessThanOrEqual(20)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toMatch(/\s…$/)
  })

  it('falls back to a hard cut rather than returning almost nothing', () => {
    // No usable boundary in the first half — better a clipped word than a
    // two-character description.
    expect(truncateAtWord(`${'x'.repeat(30)} y`, 10)).toBe('xxxxxxxxx…')
  })
})

describe('buildEventSeo', () => {
  const base = {
    route: '/gb/london/1204',
    canonical: PATH_CANONICAL,
    breadcrumbs,
    // Resolved by the endpoint, not read off the event — see `EventSeoInput`.
    images: [],
    locale: 'en' as const,
  }

  it('passes the canonical through verbatim rather than composing one', () => {
    const seo = buildEventSeo({ ...base, event: makeEvent() })
    expect(seo.canonical).toBe(PATH_CANONICAL)
    expect(seo.openGraph['og:url']).toBe(PATH_CANONICAL)
  })

  it('renders the description as plain-text paragraphs, never HTML', () => {
    const event = makeEvent({
      description: plainTextToLexical('First block.\nSecond block.') as Event['description'],
    })
    const seo = buildEventSeo({ ...base, event })
    if (seo.type !== 'event') throw new Error('expected an event')
    expect(seo.content.paragraphs).toEqual(['First block.', 'Second block.'])
    expect(JSON.stringify(seo.content)).not.toContain('<')
  })

  it('falls back to schedule and address when a class has no description of its own', () => {
    const seo = buildEventSeo({ ...base, event: makeEvent() })
    expect(seo.description).toBe(
      'Every week on Saturday at 9:26 AM · 12 Broad Street, London, Greater London, United Kingdom W1 2AB',
    )
  })

  it('bounds the meta description without losing the full text', () => {
    const long = 'Meditation and self-realisation, every week. '.repeat(10)
    const seo = buildEventSeo({
      ...base,
      event: makeEvent({ description: plainTextToLexical(long) as Event['description'] }),
    })
    if (seo.type !== 'event') throw new Error('expected an event')
    expect(seo.description!.length).toBeLessThanOrEqual(160)
    expect(seo.content.paragraphs.join(' ').length).toBeGreaterThan(160)
  })

  it('describes an online class as a VirtualLocation with no postal address', () => {
    const event = makeEvent({
      eventType: 'online',
      onlineUrl: 'https://meet.example/abc',
      address: undefined,
    })
    const seo = buildEventSeo({ ...base, event })
    if (seo.type !== 'event') throw new Error('expected an event')
    expect(seo.content.address).toBeNull()
    expect(seo.content.onlineUrl).toBe('https://meet.example/abc')
    const graph = JSON.parse(seo.jsonLd)['@graph'] as Record<string, never>[]
    expect(graph[0].eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode')
    expect(graph[0].location).toEqual({
      '@type': 'VirtualLocation',
      url: 'https://meet.example/abc',
    })
  })

  it('emits a Place with coordinates for an offline class', () => {
    const seo = buildEventSeo({ ...base, event: makeEvent() })
    const graph = JSON.parse(seo.jsonLd)['@graph'] as Record<string, never>[]
    expect(graph[0].location).toMatchObject({
      '@type': 'Place',
      name: 'Friends Meeting House',
      address: { '@type': 'PostalAddress', addressLocality: 'London', postalCode: 'W1 2AB' },
      geo: { '@type': 'GeoCoordinates', latitude: 51.5, longitude: -0.12 },
    })
  })

  it('translates the recurrence into a schema.org Schedule', () => {
    const seo = buildEventSeo({ ...base, event: makeEvent() })
    const graph = JSON.parse(seo.jsonLd)['@graph'] as Record<string, never>[]
    expect(graph[0].eventSchedule).toMatchObject({
      '@type': 'Schedule',
      repeatFrequency: 'P1W',
      byDay: ['https://schema.org/Saturday'],
      startTime: '09:26',
      endTime: '20:30',
      scheduleTimezone: 'Asia/Calcutta',
    })
  })

  // A dormant class is hidden from the admin schedule tab and skipped by the
  // expiry job; reporting its stored schedule here would make this the one
  // surface claiming it still runs.
  it('reports no schedule for a dormant class', () => {
    const seo = buildEventSeo({ ...base, event: makeEvent({ inactive: true }) })
    if (seo.type !== 'event') throw new Error('expected an event')
    expect(seo.content.schedule).toMatchObject({ oneLine: '', startDate: null, inactive: true })
    const graph = JSON.parse(seo.jsonLd)['@graph'] as Record<string, never>[]
    expect(graph[0]).not.toHaveProperty('eventSchedule')
    expect(graph[0]).not.toHaveProperty('startDate')
  })

  it('closes the breadcrumb trail with the event itself', () => {
    const seo = buildEventSeo({
      ...base,
      event: makeEvent(),
      breadcrumbs: [...breadcrumbs, { name: 'Evening Meditation', route: base.route, url: null }],
    })
    expect(seo.breadcrumbs.at(-1)).toEqual({
      name: 'Evening Meditation',
      route: '/gb/london/1204',
      url: null,
    })
  })
})

describe('buildRegionSeo', () => {
  const card: AtlasSeoEventCard = eventCard(makeEvent(), {
    route: '/gb/london/1204',
    url: `${PATH_CANONICAL}/1204`,
  })

  const base = {
    id: 88,
    name: 'London',
    subtitle: null,
    level: 'city',
    route: '/gb/london',
    canonical: PATH_CANONICAL,
    breadcrumbs,
    events: [card],
    eventCount: 1,
    locale: 'en' as const,
  }

  // Region names collide across the tree — Georgia the country and Georgia the
  // US state are both in this data — so a bare name is a title a search engine
  // can't tell apart either.
  it('qualifies the title with the root ancestor', () => {
    expect(buildRegionSeo(base).title).toBe('London, United Kingdom')
  })

  it('does not repeat a country’s own name back at it', () => {
    expect(
      buildRegionSeo({
        ...base,
        name: 'United Kingdom',
        level: 'country',
        breadcrumbs: [breadcrumbs[0]],
      }).title,
    ).toBe('United Kingdom')
  })

  // Deliberate: a region carries no description in the CMS, and an invented
  // English sentence would land in a Dutch site's <head>.
  it('emits no description, and no og:description with it', () => {
    const seo = buildRegionSeo(base)
    expect(seo.description).toBeNull()
    expect(seo.openGraph['og:description']).toBeUndefined()
  })

  it('reports the true class total even when the list is capped', () => {
    const seo = buildRegionSeo({ ...base, eventCount: 137 })
    if (seo.type !== 'region') throw new Error('expected a region')
    expect(seo.content.eventCount).toBe(137)
    expect(seo.content.events).toHaveLength(1)
    const list = (JSON.parse(seo.jsonLd)['@graph'] as Record<string, never>[]).find(
      (node) => node['@type'] === 'ItemList',
    )
    expect(list?.numberOfItems).toBe(137)
  })

  it('types the place node by region level', () => {
    const typeOf = (level: string) =>
      (
        JSON.parse(buildRegionSeo({ ...base, level }).jsonLd)['@graph'] as Record<string, never>[]
      )[0]['@type']
    expect(typeOf('country')).toBe('Country')
    expect(typeOf('region')).toBe('AdministrativeArea')
    expect(typeOf('city')).toBe('City')
    expect(typeOf('venue')).toBe('Place')
  })

  it('omits the ItemList entirely when a region lists nothing', () => {
    const seo = buildRegionSeo({ ...base, events: [], eventCount: 0 })
    const graph = JSON.parse(seo.jsonLd)['@graph'] as Record<string, never>[]
    expect(graph.some((node) => node['@type'] === 'ItemList')).toBe(false)
  })

  it('spells og:locale the way Open Graph does', () => {
    expect(buildRegionSeo({ ...base, locale: 'pt-BR' }).openGraph['og:locale']).toBe('pt_BR')
  })
})
