import type { AtlasSeoResponse } from '../../src/endpoints/responseTypes'

import { describe, expect, it } from 'vitest'

import { wixBodyHtml } from '../../src/endpoints/atlas/wix/wixDocument'
import { escapeHtml, safeUrl } from '../../src/endpoints/atlas/wix/wixHtml'

/**
 * The crawlable body — the one place the atlas SEO surface emits markup.
 *
 * ⚠ **Fixture pre-mortem.** These answers assume `AtlasSeoResponse`'s content
 * shape: a root carries `paragraphs` only and takes its heading from the
 * top-level `title`, a region carries `name` / `subtitle` / `events`, and an
 * event carries `schedule.oneLine`, `address.oneLine`, `paragraphs`, `images`
 * and `website`. Verified against `src/endpoints/responseTypes.ts`, which is the
 * type these objects are declared as, so a drift is a compile error here rather
 * than a passing test about a shape nothing returns.
 *
 * The element order is a deliberate mirror of `sahaj_atlas_seo_children` in
 * `SahajAtlasWordpress/includes/seo.php`, so the two hosts show a crawler the
 * same page. Change one and change the other.
 */

const root = (paragraphs: string[], title = 'Free meditation classes'): AtlasSeoResponse =>
  ({
    type: 'root',
    id: null,
    route: '/',
    locale: 'en',
    title,
    description: null,
    canonical: null,
    alternates: [],
    openGraph: {},
    jsonLd: '{}',
    breadcrumbs: [],
    content: { paragraphs },
  }) as AtlasSeoResponse

const region = (content: Record<string, unknown>): AtlasSeoResponse =>
  ({
    type: 'region',
    id: 7,
    route: '/ca/ontario',
    locale: 'en',
    title: 'Ontario',
    description: null,
    canonical: null,
    alternates: [],
    openGraph: {},
    jsonLd: '{}',
    breadcrumbs: [],
    content: { name: 'Ontario', subtitle: null, events: [], eventCount: 0, ...content },
  }) as AtlasSeoResponse

const event = (content: Record<string, unknown>): AtlasSeoResponse =>
  ({
    type: 'event',
    id: 1204,
    route: '/ca/ontario/1204',
    locale: 'en',
    title: 'Thursday class',
    description: null,
    canonical: null,
    alternates: [],
    openGraph: {},
    jsonLd: '{}',
    breadcrumbs: [],
    content: {
      title: 'Thursday class',
      languages: ['en'],
      schedule: {
        oneLine: '',
        startDate: null,
        endDate: null,
        timezone: null,
        recurrence: null,
        weekdays: [],
        endTime: null,
        inactive: false,
      },
      address: null,
      onlineUrl: null,
      website: null,
      paragraphs: [],
      images: [],
      ...content,
    },
  }) as AtlasSeoResponse

describe('escapeHtml', () => {
  it('closes both the text-node and the attribute sinks', () => {
    expect(escapeHtml(`<a href="x" title='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;',
    )
  })

  it('escapes the ampersand first, so an escape is not escaped twice', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('safeUrl', () => {
  it('admits http and https', () => {
    expect(safeUrl('https://example.org/a')).toBe('https://example.org/a')
    expect(safeUrl('http://example.org/a')).toBe('http://example.org/a')
  })

  it('refuses a scheme escaping makes no safer', () => {
    // CMS free text really can hold this, and Wix's `html` sink sanitizes nothing.
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
    expect(safeUrl(null)).toBeNull()
  })
})

describe('wixBodyHtml — the root', () => {
  it('takes its heading from the top-level title, which no other type does', () => {
    expect(wixBodyHtml(root(['Come and sit.']))).toBe(
      '<section><h1>Free meditation classes</h1><p>Come and sit.</p></section>',
    )
  })

  it('renders the heading alone in a locale nobody wrote copy for', () => {
    expect(wixBodyHtml(root([]))).toBe('<section><h1>Free meditation classes</h1></section>')
  })

  it('escapes operator-authored copy', () => {
    expect(wixBodyHtml(root(['<script>x</script>'], 'A & B'))).toBe(
      '<section><h1>A &amp; B</h1><p>&lt;script&gt;x&lt;/script&gt;</p></section>',
    )
  })
})

describe('wixBodyHtml — a region', () => {
  it('lists its classes as real links a crawler follows', () => {
    const html = wixBodyHtml(
      region({
        subtitle: 'Twelve classes',
        events: [
          {
            id: 1,
            route: '/ca/ontario/1',
            url: 'https://sahajayoga.ca/classes/ca/ontario/1',
            title: 'Thursday class',
            schedule: 'Every Thursday at 7 PM',
            address: 'Community Hall, Toronto',
            online: false,
          },
        ],
      }),
    )
    expect(html).toBe(
      '<section><h1>Ontario</h1><p>Twelve classes</p><ul>' +
        '<li><a href="https://sahajayoga.ca/classes/ca/ontario/1">Thursday class</a>' +
        ' — Every Thursday at 7 PM · Community Hall, Toronto</li>' +
        '</ul></section>',
    )
  })

  it('renders a class with no publishable canonical as plain text, not a dead link', () => {
    const html = wixBodyHtml(
      region({
        events: [
          {
            id: 1,
            route: null,
            url: null,
            title: 'Thursday class',
            schedule: '',
            address: '',
            online: false,
          },
        ],
      }),
    )
    expect(html).toContain('<li>Thursday class</li>')
    expect(html).not.toContain('<a')
  })

  it('omits the list entirely when there is nothing to list', () => {
    expect(wixBodyHtml(region({}))).toBe('<section><h1>Ontario</h1></section>')
  })
})

describe('wixBodyHtml — an event', () => {
  it('renders its facts, description, photos and own link, in that order', () => {
    const html = wixBodyHtml(
      event({
        schedule: {
          oneLine: 'Every Thursday at 7 PM',
          startDate: null,
          endDate: null,
          timezone: null,
          recurrence: null,
          weekdays: [],
          endTime: null,
          inactive: false,
        },
        address: {
          venueName: null,
          street: null,
          room: null,
          city: null,
          region: null,
          postCode: null,
          country: null,
          latitude: null,
          longitude: null,
          oneLine: 'Community Hall, Toronto',
        },
        paragraphs: ['All welcome.'],
        images: [{ url: 'https://img.example.org/a.jpg', alt: 'The hall' }],
        website: 'https://example.org/class',
      }),
    )
    expect(html).toBe(
      '<article><h1>Thursday class</h1>' +
        '<p>Every Thursday at 7 PM</p>' +
        '<address>Community Hall, Toronto</address>' +
        '<p>All welcome.</p>' +
        '<img src="https://img.example.org/a.jpg" alt="The hall" loading="lazy" />' +
        '<p><a href="https://example.org/class">https://example.org/class</a></p>' +
        '</article>',
    )
  })

  it('drops an unsafe website rather than rendering it', () => {
    const html = wixBodyHtml(event({ website: 'javascript:alert(1)' }))
    expect(html).not.toContain('javascript')
    expect(html).toBe('<article><h1>Thursday class</h1></article>')
  })

  it('escapes an image alt into its attribute', () => {
    const html = wixBodyHtml(
      event({ images: [{ url: 'https://img.example.org/a.jpg', alt: 'A "hall" & more' }] }),
    )
    expect(html).toContain('alt="A &quot;hall&quot; &amp; more"')
  })
})
