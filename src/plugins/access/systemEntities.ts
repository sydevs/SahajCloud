import type {
  Access,
  Endpoint,
  PayloadRequest,
  SanitizedCollectionConfig,
  SanitizedConfig,
  SanitizedGlobalConfig,
  Where,
} from 'payload'

import { Forbidden } from 'payload'

import { isAdminManager } from './adminOnly'

/**
 * Access for the collections and globals Payload creates itself.
 *
 * ⚠ **`accessPlugin` never sees them.** `sanitizeConfig` appends `payload-jobs`,
 * `payload-jobs-stats`, `payload-locked-documents`, `payload-preferences`,
 * `payload-migrations` and `payload-kv` after every plugin has run, most with
 * `Boolean(user)` access — which a published client's API key satisfies. Any
 * client key could queue a job with arbitrary input, rewrite a queued job's
 * input, trigger `/api/payload-jobs/run`, overwrite the job-stats global,
 * create document locks, and PATCH another user's preference row into its own.
 * `jobs.access` (`run`/`queue`/`cancel`) had the same default.
 *
 * ⚠ **This runs on the sanitized config, so both `buildConfig` call sites must
 * apply it** — `src/payload.config.ts` and `tests/utils/testHelpers.ts`. Not in
 * `onInit`: Payload's dev hot reload swaps in a freshly sanitized config without
 * re-running `onInit`, so the patch would silently vanish on the first edit.
 *
 * An unlisted `payload-*` entity gets admin-only access, so a Payload upgrade
 * or a newly enabled feature (folders, query presets) fails closed, not open.
 */
export function restrictPayloadSystemEntities(config: SanitizedConfig): SanitizedConfig {
  for (const collection of config.collections) {
    if (!isSystemSlug(collection.slug)) continue
    const policy = SYSTEM_COLLECTIONS[collection.slug] ?? ADMIN_ONLY_COLLECTION
    collection.access = { ...collection.access, ...policy.access }
    if (policy.guardEndpoints && collection.endpoints) {
      collection.endpoints = collection.endpoints.map(managersOnlyEndpoint)
    }
  }

  for (const global of config.globals) {
    if (!isSystemSlug(global.slug)) continue
    global.access = { ...global.access, ...ADMIN_ONLY_GLOBAL }
  }

  // Every in-app caller runs jobs with `overrideAccess` left at its default
  // (`true`) — autoRun, the screening kick — so none of them reaches these.
  config.jobs.access = { cancel: adminOnly, queue: adminOnly, run: adminOnly }

  return config
}

const SYSTEM_SLUG_PREFIX = 'payload-'

function isSystemSlug(slug: string): boolean {
  return slug.startsWith(SYSTEM_SLUG_PREFIX)
}

type CollectionAccess = Partial<SanitizedCollectionConfig['access']>

interface CollectionPolicy {
  access: CollectionAccess
  /** Refuse non-managers on every endpoint, for handlers that skip collection access. */
  guardEndpoints?: boolean
}

const adminOnly = ({ req }: { req: PayloadRequest }): boolean => isAdminManager(req.user)

const activeManagersOnly: Access = ({ req: { user } }) =>
  user?.collection === 'managers' && user.type !== 'inactive'

const managersOnly: Access = ({ req: { user } }) => user?.collection === 'managers'

/** Payload's own `preferenceAccess`, narrowed to managers. */
const ownManagerPreferences: Access = ({ req: { user } }): boolean | Where =>
  user?.collection === 'managers'
    ? {
        and: [
          { 'user.value': { equals: user.id } },
          { 'user.relationTo': { equals: 'managers' } },
        ],
      }
    : false

function everyOperation(access: Access): CollectionAccess {
  return {
    create: access,
    read: access,
    update: access,
    delete: access,
    readVersions: access,
    unlock: access,
  }
}

const ADMIN_ONLY_COLLECTION: CollectionPolicy = { access: everyOperation(adminOnly) }

const ADMIN_ONLY_GLOBAL: Partial<SanitizedGlobalConfig['access']> = {
  read: adminOnly,
  update: adminOnly,
  readVersions: adminOnly,
}

const SYSTEM_COLLECTIONS: Record<string, CollectionPolicy> = {
  'payload-jobs': ADMIN_ONLY_COLLECTION,
  'payload-migrations': ADMIN_ONLY_COLLECTION,
  // The admin UI reads, takes over and releases locks over REST with the
  // manager's own session, so every active manager keeps Payload's default.
  'payload-locked-documents': { access: everyOperation(activeManagersOnly) },
  // `update` was unscoped upstream: a PATCH by id rewrote any user's row, and
  // the `user` field's hook then reassigned it to the caller. `create` needs no
  // scoping for the same reason — that hook always stamps the caller.
  'payload-preferences': {
    access: { ...everyOperation(ownManagerPreferences), create: managersOnly },
    // The `/:key` handlers write through `payload.db` and never consult access.
    guardEndpoints: true,
  },
  // Payload denies its CRUD already; this also closes the `unlock` that
  // sanitize fills with `Boolean(user)`, and keeps admins out as before.
  'payload-kv': { access: everyOperation(() => false) },
}

function managersOnlyEndpoint(endpoint: Endpoint): Endpoint {
  return {
    ...endpoint,
    handler: async (req) => {
      if (req.user?.collection !== 'managers') throw new Forbidden(req.t)
      return endpoint.handler(req)
    },
  }
}
