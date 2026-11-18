import { PANEL_URL_BASE } from './unavailable'

/**
 * Every `scope` a panel URL of ours carries, and which of them has a frontend
 * listening on the other side.
 *
 * A consumer that subscribes answers Payload's handshake, so silence from one
 * is a frame nobody can see into. The scoped globals are the exception: both
 * consumers mount their subscriber only for an **unscoped** session
 * (SahajAtlasWeb `documentPreviewActive`, WeMeditateWeb `LivePreviewDocument`),
 * and the atlas's `startClientsPreview` returns early unless the scope is
 * `clients`. A watchdog over those would call a working preview blocked.
 */
export const PREVIEW_SCOPES = {
  atlasTranslations: 'sy-atlas-translations',
  clients: 'clients',
  wmWebConfig: 'wm-web-config',
  wmWebTranslations: 'wm-web-translations',
} as const

export type LivePreviewScope = (typeof PREVIEW_SCOPES)[keyof typeof PREVIEW_SCOPES]

const SUBSCRIBING: readonly string[] = [PREVIEW_SCOPES.clients]

/**
 * Whether a panel address belongs to a preview that answers the handshake.
 *
 * Reads back the `scope` this repo writes itself, so it adds no contract with
 * either consumer. A document preview carries none and is watched; a scope
 * whose consumer subscribes is listed above.
 */
export function panelUrlSubscribes(url: string): boolean {
  const panel = URL.parse(url, PANEL_URL_BASE)
  // An address nothing can read is one nothing can vouch for.
  if (!panel) return false

  const scope = panel.searchParams.get('scope')
  return scope === null || SUBSCRIBING.includes(scope)
}
