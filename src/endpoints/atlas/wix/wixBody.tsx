import type { AtlasSeoEventContent, AtlasSeoRegionContent } from '../../responseTypes'
import type { AtlasSeoDocument } from '../seo/seoDocument'
import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server.edge'

/**
 * The crawlable body, as HTML, for a Wix page's `$w('#…').html` sink.
 *
 * ⚠ **This is the one place in the atlas SEO surface where we emit markup.**
 *
 * ⚠ **So React renders it, rather than a string template and an escaper.**
 * Every value is CMS text reaching somebody else's document, and
 * `renderToStaticMarkup` escapes every text node and attribute by construction
 * — the escaping `SahajAtlasWordpress/includes/seo.php` does has no call to
 * forget here. {@link safeUrl} is what React does **not** do.
 *
 * ⚠ **`.edge`, never the `react-dom/server` barrel**, which Turbopack refuses
 * anywhere in an app graph, and this module is in `payload.config.ts`'s.
 * `tests/unit/server-render-import.spec.ts` holds the graph.
 *
 * The structure mirrors `sahaj_atlas_seo_children` in the WordPress plugin, so
 * the two hosts show a crawler the same page — `tests/unit/wix-route-body.spec.ts`
 * pins the element order against that file.
 */

/**
 * An `http(s)` URL safe for an `href` or `src`, or `null`.
 *
 * A CMS `website` is free text, so `javascript:alert(1)` can really arrive, and
 * **neither escaping nor JSX makes it safe**: React renders a `javascript:`
 * href as written. WordPress gets this from `esc_url`; Wix's sink has nothing.
 */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const url = URL.parse(value)
  if (!url) return null
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
}

/** One `<p>` per authored block. */
function Paragraphs({ content }: { content: { paragraphs: string[] } }): ReactNode {
  return content.paragraphs.map((text, index) => <p key={index}>{text}</p>)
}

/** Takes the whole answer: the root names no document, so its heading is the top-level title. */
function RootBody({ seo }: { seo: Extract<AtlasSeoDocument, { type: 'root' }> }): ReactNode {
  return (
    <section>
      <h1>{seo.title}</h1>
      <Paragraphs content={seo.content} />
    </section>
  )
}

function EventBody({ content }: { content: AtlasSeoEventContent }): ReactNode {
  const website = safeUrl(content.website)
  return (
    <article>
      <h1>{content.title}</h1>
      {content.schedule?.oneLine ? <p>{content.schedule.oneLine}</p> : null}
      {content.address?.oneLine ? <address>{content.address.oneLine}</address> : null}
      <Paragraphs content={content} />
      {content.images.map((image) => {
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

function RegionBody({ content }: { content: AtlasSeoRegionContent }): ReactNode {
  const rows = content.events.filter((event) => event.title)
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

export function wixBodyHtml(seo: AtlasSeoDocument): string {
  return renderToStaticMarkup(
    seo.type === 'root' ? (
      <RootBody seo={seo} />
    ) : seo.type === 'event' ? (
      <EventBody content={seo.content} />
    ) : (
      <RegionBody content={seo.content} />
    ),
  )
}
