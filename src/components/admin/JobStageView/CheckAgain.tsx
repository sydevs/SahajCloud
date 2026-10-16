'use client'

import { Button, useDocumentDrawerContext } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

/**
 * The waiting view's one control, in the two surfaces that render it.
 *
 * Inside a document drawer the view sits over another document's form, so a
 * full load would leave that document and discard its unsaved edits — there
 * the refresh happens in place. Elsewhere the anchor stands, because only a
 * full load re-reads the stage on the server.
 *
 * `router.refresh()` is the in-place half rather than a `next/link`: it
 * refetches this route's server render and bypasses the client router cache,
 * which a navigation can otherwise be answered from, redrawing the same stale
 * banner.
 *
 * A client component, which the rest of the view is deliberately not: whether
 * a drawer is open is knowable in the browser alone. `drawerSlug` reaches
 * neither of the prop sets Payload hands a view.
 */
export function CheckAgain({ url }: { url: string }) {
  // Payload defaults this context to `{}`, so `drawerSlug` is absent outside a
  // drawer even though the published type declares it required.
  const { drawerSlug } = useDocumentDrawerContext()
  const router = useRouter()

  if (drawerSlug) {
    return (
      <Button buttonStyle="secondary" onClick={() => router.refresh()}>
        Check again
      </Button>
    )
  }

  return (
    <Button buttonStyle="secondary" el="anchor" url={url}>
      Check again
    </Button>
  )
}
