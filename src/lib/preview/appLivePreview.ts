import type { CollectionConfig } from 'payload'

type LivePreviewConfig = NonNullable<NonNullable<CollectionConfig['admin']>['livePreview']>

/**
 * Live preview pointing at the hosted WeMeditate App web host
 * (`WEMEDITATE_APP_URL`). The app parses `?collection/id/locale/secret` and
 * renders the real app screen for that collection from the edited draft doc
 * streamed over Payload's native live preview. Shared across the content
 * collections that have an app screen (Lessons, Meditations, Lectures, …).
 *
 * `WEMEDITATE_APP_URL` must also be in the CSP `frame-src` (see next.config.mjs)
 * and, on Railway, present at build time.
 */
export function appLivePreview(collectionSlug: string): LivePreviewConfig {
  return {
    url: ({ data, locale }) => {
      const baseURL = process.env.WEMEDITATE_APP_URL
      if (!baseURL) return ''
      const id = data?.id ?? ''
      const localeCode = locale?.code ?? 'en'
      return `${baseURL}/?collection=${collectionSlug}&id=${id}&locale=${localeCode}&secret=${process.env.SAHAJCLOUD_PREVIEW_SECRET}`
    },
    breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
  }
}
