import { PROPOSABLE_TARGET_LEVELS } from '@/collections/EventImports/propose/tree'

import { ImportTabLink } from './ImportTabLink'

/**
 * The server half of the Import tab: it owns nothing but the list and the label.
 *
 * ⚠ **A tab component cannot be a client component.** Payload renders it with
 * `serverProps` that carry `payload` and `req`, so `'use client'` here would
 * throw `Functions cannot be passed directly to Client Components` — the same
 * rule custom views follow (`docs/rules/admin-ui.md`). This component takes none
 * of those props and passes only serializable values down.
 */
export default function ImportTab({ path }: { path: string }) {
  return <ImportTabLink label="Import" levels={PROPOSABLE_TARGET_LEVELS} path={path} />
}
