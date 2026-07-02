import type { CollectionConfig } from 'payload'

type LivePreviewConfig = NonNullable<NonNullable<CollectionConfig['admin']>['livePreview']>

/**
 * Live preview pointing at the hosted WeMeditate App web host
 * (`WEMEDITATE_APP_URL`). The app parses `?collection|global/id/locale/secret`
 * and renders the real app screen for that entity from the edited draft doc
 * streamed over Payload's native live preview. Shared across the content
 * collections (Lessons, Meditations, Lectures, …) and app-facing globals
 * (Translations, App Config/Status) that have an app screen.
 *
 * Collections stream a single doc keyed by `?collection=<slug>&id=<id>`;
 * globals have no id and are keyed by `?global=<slug>` — the app resolves the
 * builder by slug either way (see lib/preview/preview_registry.dart).
 *
 * `WEMEDITATE_APP_URL` must also be in the CSP `frame-src` (see next.config.mjs)
 * and, on Railway, present at build time.
 */
export function appLivePreview(
  slug: string,
  kind: 'collection' | 'global' = 'collection',
): LivePreviewConfig {
  return {
    url: ({ data, locale }) => {
      const baseURL = process.env.WEMEDITATE_APP_URL
      if (!baseURL) return ''
      const localeCode = locale?.code ?? 'en'
      const secret = process.env.SAHAJCLOUD_PREVIEW_SECRET
      const idParam = kind === 'collection' ? `&id=${data?.id ?? ''}` : ''
      return `${baseURL}/?${kind}=${slug}${idParam}&locale=${localeCode}&secret=${secret}`
    },
    breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
  }
}
