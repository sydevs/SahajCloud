/**
 * Shape a resolved atlas document into the SEO answer `GET /api/atlas/seo`
 * returns — title, meta description, hreflang, Open Graph, JSON-LD, and the
 * body content a host renders as children of `<sahaj-atlas>`.
 *
 * **Pure.** Everything that needs a database (resolving the route, the canonical
 * URLs, the region's event list) happens in the endpoint and arrives here as
 * plain values, so every rule below is unit-testable without booting Payload.
 *
 * **Two things this module deliberately does not do:**
 *
 * - **It never composes prose.** Nothing in the atlas is localized — not an
 *   event title, not a region name, not a description (the widget translates
 *   its own chrome client-side). So a sentence written here would be English
 *   served to a Dutch site's `<head>`, in the one place a visitor cannot skip.
 *   Titles are the document's own names; a region, which has no description
 *   field at all, gets `description: null` and the host writes its own line in
 *   its own language.
 * - **It never recomputes a canonical.** `canonical` is the `webUrl` the caller
 *   read off the document. If this module could derive one, that would be a
 *   second implementation of #640 free to disagree with the first.
 */

import type { JsonLdNode } from './jsonLd'
import type { AtlasSeoAddress } from '../../responseTypes'
import type {
  AtlasSeoAlternate,
  AtlasSeoBreadcrumb,
  AtlasSeoEventCard,
  AtlasSeoEventContent,
  AtlasSeoImage,
  AtlasSeoOpenGraph,
  AtlasSeoRegionContent,
  AtlasSeoResponse,
  AtlasSeoSchedule,
} from '../../responseTypes'

import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

import { addressOneLine, scheduleOneLine } from '@/lib/notifications/eventDetails'
import { getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'
import type { Event } from '@/payload-types'

import { breadcrumbList, compactNode, jsonLdEscape, jsonLdGraph } from './jsonLd'

/**
 * A rich-text value as plain-text paragraphs; `[]` when it is empty, absent or
 * malformed.
 *
 * `convertLexicalToPlaintext` renders each paragraph, heading and list item as
 * text and separates blocks with a blank line, keeping a soft break as a single
 * newline — so splitting on the blank line recovers exactly the block structure
 * the editor stored, and a soft break stays inside its paragraph. The inverse of
 * `@/lib/richEditor/plainTextToLexical`, which the Atlas importer uses to get
 * these values in.
 *
 * Malformed editor state resolves to `[]` rather than throwing: this feeds a
 * public read on somebody else's page render, where one bad document must not
 * take the response down.
 */
export function lexicalToParagraphs(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  try {
    return convertLexicalToPlaintext({ data: value as never })
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * The query parameter the widget reads its UI language from
 * (`lookupQuerystring` in the widget's i18n detection). An alternate URL is the
 * canonical plus this parameter, which is the only difference between locales:
 * the *content* is identical, so the canonical stays locale-free and every
 * alternate points back at it.
 */
const LOCALE_QUERY_PARAM = 'locale'

/**
 * Meta descriptions are truncated to what a result page actually shows. Search
 * engines cut around 155–160 characters; the untruncated text is still in
 * `content.paragraphs`, so nothing is lost — this bound applies only to the
 * `<meta>` value.
 */
const META_DESCRIPTION_MAX = 160

/** `MO` … `SU` as the schema.org day URLs `Schedule.byDay` expects. */
const SCHEMA_WEEKDAYS: Record<string, string> = {
  MO: 'https://schema.org/Monday',
  TU: 'https://schema.org/Tuesday',
  WE: 'https://schema.org/Wednesday',
  TH: 'https://schema.org/Thursday',
  FR: 'https://schema.org/Friday',
  SA: 'https://schema.org/Saturday',
  SU: 'https://schema.org/Sunday',
}

/** ISO 8601 duration unit per recurrence type, for `Schedule.repeatFrequency`. */
const REPEAT_UNIT: Record<string, string> = { DAILY: 'D', WEEKLY: 'W', MONTHLY: 'M' }

/**
 * The schema.org type for a region level. A country or state is an
 * `AdministrativeArea`; a city is a `City`; a shared venue is a plain `Place`,
 * since it is a building rather than an area.
 */
const SCHEMA_PLACE_TYPE: Record<string, string> = {
  country: 'Country',
  region: 'AdministrativeArea',
  city: 'City',
  venue: 'Place',
}

/** Truncate at a word boundary, appending an ellipsis only when text was cut. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const clipped = text.slice(0, max - 1)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > max / 2 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}

/**
 * Every `<link rel="alternate">` row for a canonical URL: one per enabled
 * locale, plus `x-default` pointing at the bare canonical.
 *
 * `locales` comes from the `sy-atlas-config` global (see `./atlasLocales`), not
 * from a constant — an operator turning a language off has to stop us telling
 * crawlers that language still has a page.
 *
 * `x-default` is the canonical *unchanged* because that URL genuinely serves
 * every visitor — the widget picks a language from the page, the browser or its
 * own `?locale`, so the parameter-free URL is the correct "we have no better
 * match" target rather than a synonym for English.
 *
 * Returns `[]` with no canonical: an hreflang cluster whose members are guesses
 * is worse than none.
 */
export function hreflangAlternates(
  canonical: string | null,
  locales: readonly string[],
): AtlasSeoAlternate[] {
  if (!canonical || locales.length === 0) return []
  const separator = canonical.includes('?') ? '&' : '?'
  return [
    ...locales.map((code) => ({
      hreflang: code,
      href: `${canonical}${separator}${LOCALE_QUERY_PARAM}=${code}`,
    })),
    { hreflang: 'x-default', href: canonical },
  ]
}

/**
 * Open Graph properties.
 *
 * `og:site_name` is absent on purpose — the host page knows what site it is and
 * we do not. `og:locale` uses Open Graph's `language_TERRITORY` spelling, so the
 * CMS's `pt-BR` is emitted as `pt_BR`.
 */
function openGraph(args: {
  title: string
  description: string | null
  canonical: string | null
  locale: string
  image: AtlasSeoImage | null
}): AtlasSeoOpenGraph {
  const properties: AtlasSeoOpenGraph = {
    'og:type': 'website',
    'og:title': args.title,
    'og:locale': args.locale.replace('-', '_'),
  }
  if (args.description) properties['og:description'] = args.description
  if (args.canonical) properties['og:url'] = args.canonical
  if (args.image) {
    properties['og:image'] = args.image.url
    if (args.image.alt) properties['og:image:alt'] = args.image.alt
  }
  return properties
}

/** An event's address as the response carries it, or `null` for an online class. */
function addressOf(event: Pick<Event, 'address' | 'eventType'>): AtlasSeoAddress | null {
  const address = event.address
  if (event.eventType === 'online' || !address) return null
  return {
    venueName: address.venueName ?? null,
    street: address.street ?? null,
    room: address.room ?? null,
    city: address.city ?? null,
    region: address.region ?? null,
    postCode: address.postCode ?? null,
    country: address.country ?? null,
    latitude: typeof address.latitude === 'number' ? address.latitude : null,
    longitude: typeof address.longitude === 'number' ? address.longitude : null,
    oneLine: addressOneLine(address),
  }
}

/** An event's schedule as the response carries it. */
function scheduleOf(event: Pick<Event, 'schedule' | 'inactive'>): AtlasSeoSchedule {
  const schedule = event.schedule
  const inactive = event.inactive === true
  // A dormant event's stored schedule is not shown anywhere else either (the
  // admin hides it, the expiry job skips it), so reporting it here would be the
  // one surface claiming a class runs when it does not.
  if (inactive || !schedule?.firstDate) {
    return {
      oneLine: '',
      startDate: null,
      endDate: null,
      timezone: null,
      recurrence: null,
      weekdays: [],
      endTime: null,
      inactive,
    }
  }
  return {
    oneLine: scheduleOneLine(schedule),
    startDate: schedule.firstDate,
    endDate: schedule.lastDate ?? null,
    timezone: schedule.firstDate_tz ?? null,
    recurrence: schedule.recurrenceType ?? null,
    weekdays: schedule.recurrenceType === 'WEEKLY' ? (schedule.weekdays ?? []) : [],
    endTime: schedule.endTime ?? null,
    inactive: false,
  }
}

/**
 * Image docs → renderable images, dropping any whose `url` didn't resolve.
 *
 * Exported because the endpoint reads these itself (see
 * {@link EventSeoInput.images}). `url` is a virtual field over `filename`, so a
 * read that didn't co-select `filename` yields `null` here — the drop is what
 * keeps a half-resolved image out of `og:image` rather than emitting a broken
 * one.
 */
export function seoImages(docs: readonly unknown[]): AtlasSeoImage[] {
  return docs
    .map((doc): AtlasSeoImage | null => {
      const image = doc as { url?: unknown; alt?: unknown } | null
      return image && typeof image === 'object' && typeof image.url === 'string' && image.url
        ? { url: image.url, alt: typeof image.alt === 'string' ? image.alt : null }
        : null
    })
    .filter((image): image is AtlasSeoImage => image !== null)
}

/**
 * One class as a region's listing shows it. Exported because the endpoint builds
 * a region's cards from a separate read, and a card built two ways is two
 * listings that can disagree.
 */
export function eventCard(
  event: Pick<Event, 'id' | 'title' | 'eventType' | 'address' | 'schedule' | 'inactive'>,
  links: { route: string | null; url: string | null },
): AtlasSeoEventCard {
  const address = addressOf(event)
  return {
    id: event.id,
    route: links.route,
    url: links.url,
    title: event.title,
    schedule: scheduleOf(event).oneLine,
    address: address?.oneLine ?? '',
    online: event.eventType === 'online',
  }
}

/** Everything the endpoint resolved for an event route. */
export interface EventSeoInput {
  event: Event
  /** Normalized atlas route, e.g. `/gb/london/1204`. */
  route: string
  /** The event's own `webUrl`, read — never rebuilt. */
  canonical: string | null
  /** Region ancestry, root first, with the event itself as the last rung. */
  breadcrumbs: AtlasSeoBreadcrumb[]
  /**
   * The class's photos, resolved by the endpoint. Passed in rather than read off
   * `event.images` so the event itself can be fetched at `depth: 0` — a
   * `depth: 1` read populates the event's *region* too, which is a whole extra
   * query for a document reduced to an id moments later.
   */
  images: AtlasSeoImage[]
  locale: string
  /** Enabled atlas locales, for the hreflang cluster. */
  locales: readonly string[]
}

/** Everything the endpoint resolved for a region route. */
export interface RegionSeoInput {
  id: number
  name: string
  subtitle: string | null
  level: string
  /** Normalized atlas route, e.g. `/gb/london`. */
  route: string
  /** The region's own `webUrl`, read — never rebuilt. */
  canonical: string | null
  /** Region ancestry, root first, ending at this region. */
  breadcrumbs: AtlasSeoBreadcrumb[]
  events: AtlasSeoEventCard[]
  eventCount: number
  locale: string
  /** Enabled atlas locales, for the hreflang cluster. */
  locales: readonly string[]
}

/**
 * The schema.org `location` for a class: a `VirtualLocation` for an online one,
 * a `Place` for an offline one, and `undefined` when neither is expressible —
 * an offline class with no address on file says nothing rather than claiming an
 * empty one.
 */
function locationNode(
  eventType: Event['eventType'],
  address: AtlasSeoAddress | null,
  onlineUrl: string | null,
): JsonLdNode | undefined {
  if (eventType === 'online') {
    return compactNode({ '@type': 'VirtualLocation', url: onlineUrl ?? undefined })
  }
  if (!address) return undefined

  return compactNode({
    '@type': 'Place',
    name: address.venueName ?? undefined,
    address: compactNode({
      '@type': 'PostalAddress',
      streetAddress: [address.street, address.room].filter(Boolean).join(', '),
      addressLocality: address.city ?? undefined,
      addressRegion: address.region ?? undefined,
      postalCode: address.postCode ?? undefined,
      addressCountry: address.country ?? undefined,
    }),
    geo:
      address.latitude !== null && address.longitude !== null
        ? { '@type': 'GeoCoordinates', latitude: address.latitude, longitude: address.longitude }
        : undefined,
  })
}

/** The schema.org `Event` node, plus its `Schedule` when the class recurs. */
function eventNode(input: EventSeoInput, content: AtlasSeoEventContent): JsonLdNode {
  const { event, canonical } = input
  const { schedule, address } = content
  const interval = Math.max(event.schedule?.interval ?? 0, 1)
  const unit = schedule.recurrence ? REPEAT_UNIT[schedule.recurrence] : undefined
  const startTime =
    schedule.startDate && schedule.timezone
      ? getLocalTimeHHMM(schedule.startDate, schedule.timezone)
      : null

  return compactNode({
    '@type': 'Event',
    name: content.title,
    url: canonical ?? undefined,
    description: content.paragraphs.join('\n\n') || undefined,
    inLanguage: content.languages,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode:
      event.eventType === 'online'
        ? 'https://schema.org/OnlineEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
    startDate: schedule.startDate ?? undefined,
    endDate: schedule.endDate ?? undefined,
    image: content.images.map((image) => image.url),
    location: locationNode(event.eventType, address, content.onlineUrl),
    eventSchedule: unit
      ? compactNode({
          '@type': 'Schedule',
          repeatFrequency: `P${interval}${unit}`,
          byDay: schedule.weekdays.map((day) => SCHEMA_WEEKDAYS[day]).filter(Boolean),
          startDate: schedule.startDate ?? undefined,
          endDate: schedule.endDate ?? undefined,
          startTime: startTime ?? undefined,
          endTime: schedule.endTime ?? undefined,
          scheduleTimezone: schedule.timezone ?? undefined,
        })
      : undefined,
  })
}

/** The SEO answer for an event route. */
export function buildEventSeo(input: EventSeoInput): AtlasSeoResponse {
  const { event, route, canonical, breadcrumbs, images, locale, locales } = input
  const paragraphs = lexicalToParagraphs(event.description)
  const content: AtlasSeoEventContent = {
    title: event.title,
    languages: event.languages ?? [],
    schedule: scheduleOf(event),
    address: addressOf(event),
    onlineUrl: event.eventType === 'online' ? (event.onlineUrl ?? null) : null,
    website: event.website ?? null,
    paragraphs,
    images,
  }

  // With no description of its own, an event still has facts worth showing in a
  // result snippet — when and where it meets. Both are data, not prose.
  const fallback = [content.schedule.oneLine, content.address?.oneLine]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  const description = truncateAtWord(paragraphs.join(' ') || fallback, META_DESCRIPTION_MAX) || null

  return {
    type: 'event',
    id: event.id,
    route,
    locale,
    title: event.title,
    description,
    canonical,
    alternates: hreflangAlternates(canonical, locales),
    openGraph: openGraph({
      title: event.title,
      description,
      canonical,
      locale,
      image: content.images[0] ?? null,
    }),
    jsonLd: jsonLdEscape(jsonLdGraph([eventNode(input, content), breadcrumbList(breadcrumbs)])),
    breadcrumbs,
    content,
  }
}

/** The SEO answer for a region route. */
export function buildRegionSeo(input: RegionSeoInput): AtlasSeoResponse {
  const {
    id,
    name,
    subtitle,
    level,
    route,
    canonical,
    breadcrumbs,
    events,
    eventCount,
    locale,
    locales,
  } = input

  const content: AtlasSeoRegionContent = {
    name,
    subtitle,
    level: level as AtlasSeoRegionContent['level'],
    events,
    eventCount,
  }

  // Ancestry-qualified, because region names collide across the tree (Georgia
  // the country and Georgia the US state are both in this data) and a `<title>`
  // that can't tell them apart is a `<title>` a search engine can't either. Only
  // the root is added — the whole chain would push the name past what a result
  // page shows.
  const country = breadcrumbs.length > 1 ? breadcrumbs[0].name : null
  const title = country && country !== name ? `${name}, ${country}` : name

  return {
    type: 'region',
    id,
    route,
    locale,
    title,
    // A region carries no description in the CMS. Rather than invent an
    // untranslatable English sentence for somebody else's `<head>`, we say so
    // and let the host write its own — it knows its language, we don't.
    description: null,
    canonical,
    alternates: hreflangAlternates(canonical, locales),
    openGraph: openGraph({ title, description: null, canonical, locale, image: null }),
    jsonLd: jsonLdEscape(
      jsonLdGraph([
        compactNode({
          '@type': SCHEMA_PLACE_TYPE[level] ?? 'Place',
          name,
          url: canonical ?? undefined,
          description: subtitle ?? undefined,
        }),
        breadcrumbList(breadcrumbs),
        events.length > 0
          ? {
              '@type': 'ItemList',
              numberOfItems: eventCount,
              itemListElement: events.map((card, index) =>
                compactNode({
                  '@type': 'ListItem',
                  position: index + 1,
                  url: card.url ?? undefined,
                  name: card.title,
                }),
              ),
            }
          : null,
      ]),
    ),
    breadcrumbs,
    content,
  }
}
