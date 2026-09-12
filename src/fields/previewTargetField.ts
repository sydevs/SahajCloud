import type { UIField } from 'payload'

/**
 * Where the Live Preview panel should point while one tab is open.
 *
 * **This is data, never a function.** `admin.custom` is serialized into the
 * client field config, so a callback cannot cross (see
 * `AddressSearchField.tsx:196`). Everything here is JSON.
 *
 * **It carries no origin and no preview secret.** The declaration ships to the
 * browser, and `SAHAJCLOUD_PREVIEW_SECRET` is server-only
 * (`@/lib/utilities/previewSecret`). So a target never composes a URL from
 * scratch: `composeTargetUrl` rewrites the server-resolved default the global
 * already supplies, keeping its origin and its existing query — the secret and
 * the locale included.
 */
export interface PreviewTarget {
  /**
   * The view to show, resolved against the global's own live-preview URL.
   *
   * A leading `/` replaces that URL's whole path (`/search` on an Atlas base of
   * `…/preview` gives `…/search`). Anything else resolves relatively, which is
   * how a locale-prefixed site keeps its prefix (`map` on a base of `…/fr/`
   * gives `…/fr/map`). An absolute URL is refused: it would change the origin.
   *
   * Omit it to leave the panel pointing at the default, which is what
   * `autoOpen` alone wants.
   */
  path?: string
  /** Query parameters merged over the default URL's own. */
  params?: Record<string, string>
  /** Open the Live Preview panel when this tab mounts. */
  autoOpen?: boolean
}

/**
 * A zero-height `ui` field that applies one {@link PreviewTarget}.
 *
 * Payload's `TabsField` renders only the **active** tab's content
 * (`@payloadcms/ui/dist/fields/Tabs/index.js:268-270`), so a field placed
 * inside a tab mounts exactly while that tab is open. That mount is the only
 * signal the client has: `admin.livePreview.url` runs on the server
 * (`payload/dist/config/types.d.ts:158`) and can never see which tab a
 * translator opened.
 *
 * ⚠ **Tab level only.** A sub-group renders as a collapsible, and a collapsed
 * collapsible still mounts its fields
 * (`@payloadcms/ui/dist/fields/Collapsible/index.js:138`), so the same trick
 * inside one would fire for every sub-group at once.
 *
 * `name` must be unique among its siblings, like any field.
 */
export function previewTargetField(target: PreviewTarget, name: string): UIField {
  return {
    name,
    type: 'ui',
    admin: {
      components: { Field: '@/components/admin/PreviewTarget' },
      // `admin.custom` and not top-level `custom`: Payload strips the latter
      // from the client field config (`payload/dist/fields/config/client.js:7-19`)
      // and keeps the former (`:20-23`).
      custom: { previewTarget: target },
    },
  }
}
