import type {
  AtlasSeoEventContent,
  AtlasSeoRegionContent,
  AtlasSeoResponse,
} from '../../responseTypes'
import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'

/**
 * The crawlable body, as HTML, for a host that cannot assemble one itself.
 *
 * ⚠ **This is the one place in the atlas SEO surface where we emit markup.**
 * `GET /api/atlas/seo` deliberately sends no HTML at all — the WordPress plugin
 * assembles it from `content.paragraphs` and friends, and its own output never
 * passes through `wp_kses`. A Wix router cannot do that: `getRouterData()` hands
 * its payload to `$w('#…').html`, so the host needs one finished string.
 *
 * ⚠ **So React renders it, rather than a string template and an escaper.**
 * Every value below is operator- or importer-authored CMS text reaching
 * somebody else's document, and the escaping that lives in
 * `SahajAtlasWordpress/includes/seo.php` has to live here instead. A hand-rolled
 * escaper puts that obligation at ~15 interpolations, where one omission is an
 * injection into a client's own page; `renderToStaticMarkup` escapes every text
 * node and attribute value by construction, so there is no call to forget. It is
 * the same reason this PR's warning email dropped its own escaper for React
 * Email, and `react-dom` was already a dependency either way.
 *
 * {@link safeUrl} is what React does **not** do, and is still load-bearing.
 *
 * The structure is a deliberate mirror of `sahaj_atlas_seo_children` and its
 * three renderers, so the two hosts show a crawler the same page —
 * `tests/unit/wix-route-body.spec.ts` pins the element order against that file.
 */

/**
 * A URL safe to put in an `href` or `src`, or `null`.
 *
 * `http` and `https` only. A CMS `website` or `onlineUrl` is free text an
 * importer or a region manager typed, so `javascript:alert(1)` is a value this
 * endpoint can really be handed — and unlike every other value here, **neither
 * escaping nor JSX makes it safe**: React renders a `javascript:` href as
 * written. WordPress gets this from `esc_url`'s own scheme allowlist; nothing in
 * Wix's `html` sink does.
 */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const url = URL.parse(value)
  if (!url) return null
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
}

/** One `<p>` per authored block. The shared half of three renderers. */
function Paragraphs({ content }: { content: { paragraphs?: string[] } }): ReactNode {
  return (content.paragraphs ?? []).map((text, index) => <p key={index}>{text}</p>)
}

/**
 * The root view's body.
 *
 * ⚠ Takes the whole answer, not just `content`: the root names no document, so
 * its heading is the page title the operator wrote, which sits at the top level
 * beside every other route's. A locale nobody has written copy for renders the
 * heading and nothing else — which is why this is decided before the `content`
 * guard in {@link wixBodyHtml} rather than after it.
 */
function RootBody({ seo }: { seo: Extract<AtlasSeoResponse, { type: 'root' }> }): ReactNode {
  return (
    <section>
      <h1>{seo.title}</h1>
      <Paragraphs content={seo.content ?? { paragraphs: [] }} />
    </section>
  )
}

/** An event's body: its facts, its description, its photos, its own link. */
function EventBody({ content }: { content: AtlasSeoEventContent }): ReactNode {
  const website = safeUrl(content.website)
  return (
    <article>
      <h1>{content.title}</h1>
      {content.schedule?.oneLine ? <p>{content.schedule.oneLine}</p> : null}
      {content.address?.oneLine ? <address>{content.address.oneLine}</address> : null}
      <Paragraphs content={content} />
      {(content.images ?? []).map((image) => {
        const src = safeUrl(image.url)
        if (!src) return null
        // This markup is a string handed to another site's `html` sink, so Next
        // never renders it and `next/image` cannot reach it.
        // eslint-disable-next-line @next/next/no-img-element
        return <img alt={image.alt ?? ''} key={src} loading="lazy" src={src} />
      })}
      {website ? (
        <p>
          <a href={website}>{website}</a>
        </p>
      ) : null}
    </article>
  )
}

/** A region's body: its name, its subtitle, and its classes as real links. */
function RegionBody({ content }: { content: AtlasSeoRegionContent }): ReactNode {
  const rows = (content.events ?? []).filter((event) => event.title)
  return (
    <section>
      <h1>{content.name}</h1>
      {content.subtitle ? <p>{content.subtitle}</p> : null}
      {rows.length > 0 ? (
        <ul>
          {rows.map((event) => {
            const href = safeUrl(event.url)
            const facts = [event.schedule, event.address].filter(Boolean).join(' · ')
            return (
              <li key={event.id}>
                {href ? <a href={href}>{event.title}</a> : event.title}
                {facts ? ` — ${facts}` : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * The crawlable body for one answer.
 *
 * A deliberate mirror of `sahaj_atlas_seo_children` in the WordPress plugin, so
 * the two hosts show a crawler the same page.
 */
export function wixBodyHtml(seo: AtlasSeoResponse): string {
  if (seo.type === 'root') return renderToStaticMarkup(<RootBody seo={seo} />)
  if (!seo.content) return ''
  return renderToStaticMarkup(
    seo.type === 'event' ? (
      <EventBody content={seo.content} />
    ) : (
      <RegionBody content={seo.content} />
    ),
  )
}
