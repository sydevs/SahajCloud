import type { Payload } from 'payload'

import { cancelStaleJobs } from '@/collections/PayloadJobs/PayloadJobs'
import { failLostImports } from '@/plugins/eventImport'

/**
 * Cancel the rows a lost run left `processing`, then settle the documents those
 * runs owned, and answer how many rows were swept.
 *
 * Cancelling alone frees the queue and tells nobody. A document whose status
 * the run writes still reads as in progress, because the write that would have
 * settled it died with the container — so the two steps are one routine.
 */
export async function recoverLostJobs(payload: Payload): Promise<number> {
  const cancelled = await cancelStaleJobs(payload)
  await failLostImports(payload, cancelled)
  return cancelled.length
}
