import type { UIField } from 'payload'

import type { PanelComposedReason } from '@/lib/livePreview/unavailable'

/**
 * Where the Live Preview panel should point while one tab is open.
 *
 * **This is data, never a function**, because `admin.custom` is serialized into
 * the client field config.
 *
 * **It carries no origin and no credential**, since the declaration ships to
 * the browser. A target never composes a URL from scratch: `composeTargetUrl`
 * rewrites the server-resolved default the global already supplies, keeping its
 * origin and its existing query, the edited locale included.
 */
export interface PreviewTarget {
  /**
   * The view to show, resolved against the global's own live-preview URL.
   *
   * A leading `/` replaces that URL's whole path. Anything else resolves
   * relatively, which is how a locale-prefixed site keeps its prefix (`map` on
   * a base of `…/fr/` gives `…/fr/map`). An absolute URL is refused: it would
   * change the origin.
   */
  path?: string
  /** Query parameters merged over the default URL's own. */
  params?: Record<string, string>
  /** Open the Live Preview panel when this tab mounts. */
  autoOpen?: boolean
  /**
   * Close it instead — for a document the preview has nothing to show for.
   * Payload keeps one open/closed preference per collection, so closing it here
   * is what stops a panel opened on one document greeting the next.
   */
  autoClose?: boolean
  /**
   * Point the panel at the explanation page instead of the consumer site, so an
   * editor who reopens it on the wrong tab is told why it is empty.
   *
   * ⚠ **The one target that changes the origin.** Safe only because the
   * declaration is a reason CODE rather than a URL, and lands on the admin's
   * own origin. `composeTargetUrl` still refuses every cross-origin path.
   */
  unavailable?: PanelComposedReason
}

/**
 * A zero-height `ui` field that applies one {@link PreviewTarget}.
 *
 * Payload's `TabsField` renders only the **active** tab's content
 * (`@payloadcms/ui/dist/fields/Tabs/index.js`), so a field inside a tab mounts
 * exactly while that tab is open. That mount is the only signal the client has:
 * `admin.livePreview.url` runs on the server (`payload/dist/config/types.d.ts`)
 * and can never see which tab a translator opened.
 *
 * ⚠ **Tab level only.** A sub-group renders as a collapsible, and a collapsed
 * collapsible still mounts its fields
 * (`@payloadcms/ui/dist/fields/Collapsible/index.js`), so the same trick inside
 * one would fire for every sub-group at once.
 */
export function previewTargetField(target: PreviewTarget, name: string): UIField {
  return {
    name,
    type: 'ui',
    admin: {
      components: { Field: '@/components/admin/PreviewTarget' },
      // `admin.custom` and not top-level `custom`: Payload strips the latter
      // from the client field config and keeps the former
      // (`payload/dist/fields/config/client.js`).
      custom: { previewTarget: target },
    },
  }
}
