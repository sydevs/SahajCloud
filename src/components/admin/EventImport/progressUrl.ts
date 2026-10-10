/**
 * The batch read the progress bar polls, and what counts as still running.
 *
 * Pure and apart from the component so both are testable without a DOM, and
 * because the running set is the one fact the bar and `hooks/transitionStatus.ts`
 * have to agree on.
 */

import type { EventImport } from '@/payload-types'

export type ImportStatus = NonNullable<EventImport['status']>

/**
 * The statuses a job is working through.
 *
 * ⚠ **Named rather than derived as a complement.** A status added to the
 * collection would otherwise read as running by default and poll a batch nobody
 * is touching, every three seconds, for as long as the page stays open.
 */
const RUNNING: ReadonlySet<string> = new Set<ImportStatus>(['resolving', 'committing'])

/** Whether a job still owns this batch, so the bar keeps asking. */
export function isRunningStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && RUNNING.has(status)
}

/**
 * Where the bar reads the batch's own progress.
 *
 * ⚠ **`locale` is in the URL rather than left to the default.** A manager's
 * roles are per-locale, so a read naming no locale resolves to the default one
 * and is refused for anyone whose roles live elsewhere (#701,
 * `docs/rules/access.md`).
 *
 * Two columns, because the document carries up to 500 rows plus its proposed
 * tree and this is asked every three seconds.
 */
export function progressUrl(apiRoute: string, id: number | string, locale: string): string {
  const params = new URLSearchParams({
    depth: '0',
    'select[status]': 'true',
    'select[progress]': 'true',
    locale,
  })
  return `${apiRoute}/event-imports/${id}?${params.toString()}`
}
