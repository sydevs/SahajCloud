import type { CollectionConfig } from 'payload'

import { serverEnv } from '@/lib/env'

/** Payload doesn't re-export `LivePreviewConfig`; derive it from the collection admin config. */
type LivePreviewConfig = NonNullable<NonNullable<CollectionConfig['admin']>['livePreview']>

/**
 * Admin Live Preview config for the Sahaj Atlas collections (Regions, Events).
 *
 * The preview iframe loads the Atlas widget's `/preview` route with the shared
 * `SAHAJCLOUD_PREVIEW_SECRET`. Unlike WeMeditate's server-side preview, the
 * widget fetches the document back from this CMS **client-side**, forwarding
 * the secret in the `x-sahajcloud-preview-secret` header — which unlocks
 * drafts (see `@/lib/utilities/previewSecret`) and must therefore clear CORS
 * preflight (see `cors` in `payload.config.ts`). `locale` rides along so
 * localized fields (e.g. the event title) preview in the edited locale.
 */
export function atlasLivePreview(collection: 'events' | 'regions'): LivePreviewConfig {
  return {
    url: ({ data, locale }) =>
      `${serverEnv.SAHAJATLAS_URL}/preview?collection=${collection}&id=${data.id}&secret=${serverEnv.SAHAJCLOUD_PREVIEW_SECRET}&locale=${locale.code}`,
    // The widget's event drawer switches between bottom-sheet (phone) and
    // side-panel (desktop) layout at its responsive boundary — preview both.
    breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
  }
}
