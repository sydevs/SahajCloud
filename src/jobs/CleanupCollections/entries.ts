import type { CollectionSlug } from 'payload'

import type { RetentionConfig } from '@/types/retention'

/** The one `custom` key retention reads. */
const RETENTION_KEY = 'retention'

/** One collection the nightly sweep visits, as discovery reports it. */
export interface RetentionEntry extends RetentionConfig {
  collection: CollectionSlug
}

/**
 * ⚠ **`custom` is typed `Record<string, any>`**, so nothing the compiler does
 * stops a collection declaring `windows: 7`. The shape is checked here instead,
 * and a malformed declaration reads as no retention at all — which the entry
 * count in the task's own output then shows.
 */
const isRetentionConfig = (value: unknown): value is RetentionConfig =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { windows?: unknown }).windows)

/** What one collection declares on `custom.retention`, or nothing. */
export const retentionConfigOf = (collection: {
  custom?: Record<string, unknown>
}): RetentionConfig | undefined => {
  const declared = collection.custom?.[RETENTION_KEY]

  return isRetentionConfig(declared) ? declared : undefined
}

/**
 * Every collection whose own config declares retention windows (#987).
 *
 * The sweep's list of collections is the config, read at run time, rather than
 * a registry naming them a second time: a collection's windows live beside the
 * fields they age, and `payload-jobs` reaches `custom` through
 * `jobs.jobsCollectionOverrides`.
 *
 * ⚠ **`custom` is a server-only collection property**, which is what makes a
 * `where` closure and a hooks factory safe to put there — Payload strips it
 * before the config reaches the browser (`serverOnlyCollectionProperties` in
 * `payload/dist/collections/config/client.js`).
 *
 * ⚠ **The order is the config's order**, so it is the order the task reports
 * in, and the order `tests/int/retention-jobs.int.spec.ts` reads back.
 */
export const retentionEntries = (
  collections: readonly { custom?: Record<string, unknown>; slug: string }[],
): RetentionEntry[] =>
  collections.flatMap((collection) => {
    const config = retentionConfigOf(collection)

    return config ? [{ ...config, collection: collection.slug as CollectionSlug }] : []
  })
