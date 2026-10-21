import type { CollectionConfig } from 'payload'

import { payloadJobsRetention } from './retention'

/**
 * The only place `payload-jobs` is configured by this app.
 *
 * Payload builds that collection itself, so retention cannot be declared on a
 * schema file the way every other swept collection declares it. `@experimental`
 * `jobs.jobsCollectionOverrides` hands the built collection over to be
 * replaced, which is the one seam that reaches its `custom` (#987).
 *
 * ⚠ **Spread the collection rather than rebuilding it.** Payload sanitizes
 * whatever comes back as the whole jobs collection, so a missing field is a
 * missing column. Adding a hook here would also need `jobs.runHooks`, which the
 * app does not set — Payload warns and the hook never runs.
 */
export const payloadJobsOverrides = ({
  defaultJobsCollection,
}: {
  defaultJobsCollection: CollectionConfig
}): CollectionConfig => ({
  ...defaultJobsCollection,
  custom: { ...defaultJobsCollection.custom, retention: payloadJobsRetention },
})
