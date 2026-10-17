'use client'

import { Button } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

/**
 * The waiting view's one control.
 *
 * `router.refresh()` is what re-reads the stage: it refetches this route's
 * server render and bypasses the client router cache, which a `next/link`
 * navigation can otherwise be answered from, redrawing the same stale banner.
 * It is Payload's own idiom for the same job — `useRouteCache`'s
 * `clearRouteCache` is this call, and `DefaultEditView` reloads stale document
 * data with it.
 *
 * ⚠ Inside a document drawer nothing re-reads the stage, this call included:
 * `DocumentDrawerContent` renders the document through the `renderDocument`
 * server function and keeps the result in React state, which no route refresh
 * re-runs. The alternative re-reads it only by leaving the host document and
 * discarding its unsaved edits, so the refresh stands in both surfaces.
 *
 * A client component, which the rest of the view is deliberately not: a server
 * component cannot carry the handler.
 */
export function CheckAgain() {
  const router = useRouter()

  return (
    <Button buttonStyle="secondary" onClick={() => router.refresh()}>
      Check again
    </Button>
  )
}
