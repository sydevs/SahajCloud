'use client'

import { Button } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

/**
 * The waiting view's one control, and the folder's one client component —
 * a server component cannot carry the handler.
 *
 * ⚠ Inside a document drawer nothing re-reads the stage, this call included:
 * `DocumentDrawerContent` keeps the render in React state. See
 * `docs/rules/admin-ui.md` § `JobStageView`.
 */
export function CheckAgain() {
  const router = useRouter()

  return (
    <Button buttonStyle="secondary" onClick={() => router.refresh()}>
      Check again
    </Button>
  )
}
