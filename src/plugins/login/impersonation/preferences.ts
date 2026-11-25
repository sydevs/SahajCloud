import type { SanitizedCollectionConfig } from 'payload'

import { impersonatorOf } from './gate'

/**
 * While support impersonates a manager, their column, nav and locale choices
 * stay in the browser and are never written over the manager's own.
 *
 * ⚠ **Applied to the sanitized config, from `restrictPayloadSystemEntities`**:
 * Payload appends `payload-preferences` after every plugin has run, so
 * `loginPlugin` never sees the collection.
 *
 * Two write paths, each with its own stop. The `/:key` REST handlers write
 * through `payload.db`, which runs no hook, so they answer without writing —
 * the admin's preferences provider ignores the response body. The admin's
 * server-side `upsertPreferences` writes through the Local API, where an
 * update keeps the stored value. ⚠ A first-time create still lands: refusing
 * it would throw inside a page render.
 */
export function keepImpersonatedPreferences(collection: SanitizedCollectionConfig): void {
  collection.endpoints = (collection.endpoints || []).map((endpoint) =>
    endpoint.method === 'get'
      ? endpoint
      : {
          ...endpoint,
          handler: async (req) =>
            impersonatorOf(req.user)
              ? Response.json({ message: 'Not saved while impersonating.' })
              : endpoint.handler(req),
        },
  )
  collection.hooks.beforeChange = [
    ...(collection.hooks.beforeChange ?? []),
    ({ data, operation, originalDoc, req }) =>
      operation === 'update' && impersonatorOf(req.user) && originalDoc
        ? { ...data, value: originalDoc.value }
        : data,
  ]
}
