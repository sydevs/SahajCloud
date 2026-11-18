/**
 * Which live-preview panels have a frontend listening on the other side.
 *
 * Every consumer that subscribes answers Payload's handshake, so silence from
 * one is a frame nobody can see into. The three scoped globals are the
 * exception: both consumers mount their subscriber only for an **unscoped**
 * session (SahajAtlasWeb `documentPreviewActive`, WeMeditateWeb
 * `LivePreviewDocument`), and the atlas's `startClientsPreview` returns early
 * unless the scope is {@link CLIENTS_PREVIEW_SCOPE}. A watchdog over those
 * would call a working preview blocked.
 */

/** The scope the Clients Atlas tab previews under, read back by the watchdog. */
export const CLIENTS_PREVIEW_SCOPE = 'clients'

/**
 * Whether a panel address belongs to a preview that answers the handshake.
 *
 * Reads the `scope` parameter this repo writes itself (`livePreviewUrl`), so it
 * adds no contract with either consumer. An unrecognised scope is left
 * unwatched: a preview nobody explains is better than a working one called
 * blocked.
 */
export function panelUrlSubscribes(url: string): boolean {
  const scope = URL.parse(url, 'http://relative.invalid')?.searchParams.get('scope')
  return scope === null || scope === CLIENTS_PREVIEW_SCOPE
}
