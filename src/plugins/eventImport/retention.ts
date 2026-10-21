import type { Where } from 'payload'

import type { PurgeWindow, RetentionConfig } from '@/lib/retention'

import { IMPORT_RETENTION_DAYS } from './constants'

/**
 * One window for every status, because what sets it is the CSV: the file holds
 * the contact names, addresses and phone numbers a volunteer collected, and a
 * finished import keeps them no more legitimately than a failed one. Payload's
 * own upload delete removes the R2 object with the row.
 *
 * `updatedAt`, not `createdAt`: an import still being read is not swept from
 * under its owner.
 */
export const IMPORT_WINDOWS: PurgeWindow[] = [
  {
    days: IMPORT_RETENTION_DAYS,
    name: 'imports',
    where: (cutoff): Where => ({ updatedAt: { less_than: cutoff } }),
  },
]

export const importsRetention: RetentionConfig = {
  windows: IMPORT_WINDOWS,
}
