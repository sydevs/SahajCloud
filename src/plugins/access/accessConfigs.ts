/**
 * Access Configuration Factory
 *
 * This module provides functions for creating access configurations
 * for PayloadCMS collections, globals, and fields.
 *
 * Functions:
 * - createAccessConfig: Create access config for collections/globals
 * - createFieldAccessConfig: Create access config for field-level access
 */

import type { BypassPermissionFunction, ContentSlug, FieldAccessConfig } from './types'
import type {
  Access,
  AccessArgs,
  CollectionConfig,
  CollectionSlug,
  PayloadRequest,
  Where,
} from 'payload'

import { appendVersionToQueryKey, hasWhereAccessResult } from 'payload'

import { isLivePreviewRequest } from '@/lib/utilities/previewSecret'

import { isManager } from './adminOnly'
import { virtualRoles } from './config'
import {
  getDocManagerFields,
  hasDocManagerAccess,
  resolveManagedDocIds,
  userManagesDocument,
} from './documentManagers'
import { isLocaleScopedCollection, scopeLocaleWrite } from './localeScopedWrites'
import { roleScopeFromLocale } from './localizedRoles'
import { hasPermission } from './permissions'
import {
  isRegionSubtreeCollection,
  resolveOwnedRegionIds,
  scopeRegionSubtreeWrite,
} from './regionSubtreeAccess'

/**
 * True when the entity named by `slug` has drafts enabled — collection **or**
 * global. Read from the runtime config, not from a static list, so a new
 * draft-enabled entity is covered the day it is added.
 *
 * ⚠ **Both branches are load-bearing.** This used to read
 * `req.payload.collections[slug]` alone. A global is not in that map, so it
 * answered `false` for every global, the published-only clause below never
 * fired on one, and an ordinary client API key plus `?draft=true` read
 * unpublished copy out of all three translations globals — no preview secret
 * required. `globals-client-reads.int.spec.ts` reproduces that and fails if
 * the globals branch is removed.
 */
function entityHasDrafts(req: PayloadRequest, slug: string): boolean {
  const collection = req.payload.collections[slug as CollectionSlug]
  if (collection) return !!collection.config?.versions?.drafts

  const global = req.payload.config.globals?.find((candidate) => candidate.slug === slug)
  return !!global?.versions?.drafts
}

/**
 * True when this collection carries a top-level `locale` column, which is the
 * document's own language, so a manager's write is scoped to it. Read off the
 * booted config rather than a list of slugs, so a collection that takes the
 * column is covered the day it does — see localeScopedWrites.ts.
 */
function scopesWritesByLocale(req: PayloadRequest, collection: ContentSlug): boolean {
  const fields = req.payload.collections?.[collection as CollectionSlug]?.config?.flattenedFields
  return !!fields && isLocaleScopedCollection(fields)
}

/**
 * Every column a proposal's responsible region can be named in — the target
 * event's own region, then the chain `submissionRoutingRegionId` walks.
 *
 * ⚠ **A region manager owns a subtree, so these are equivalent to that
 * function's `??` chain rather than a loose superset of it.** `country`,
 * `state` and `anchorRegion` are one ancestor line, and an owned subtree is
 * closed downwards: whenever a broader entry is in it, every narrower one is
 * too. So matching any entry answers exactly what matching the first non-null
 * one would.
 *
 * `regionHint` is a JSON column, which only Postgres' `jsonb_path_exists` can
 * reach — fine here, and the reason the hint is not spelled out in a query
 * anywhere else. It is load-bearing: a proposal for a city the atlas does not
 * hold yet has no `region` at all, and `deliverProposal` mails its state or
 * country manager, who would then be unable to read the row.
 *
 * shortcut: the three hint paths cost one inlined `jsonb_path_exists` call per
 * owned region id EACH — `createJSONQuery` expands an `in` into one OR'd
 * sibling per value — so a country manager owning ~1,000 regions sends ~3,000
 * unindexable predicates, and the `or` degrades the whole read to a seq scan of
 * `user_submissions`. Upgrade when a region manager's submissions list is
 * measurably slow, or when `user_submissions` outgrows a scan: write the
 * routing region to a real indexed column from the hook that writes
 * `regionHint`, as `followUpSentAt` already does for the follow-up sweep, and
 * this clause becomes one `IN`.
 */
export const PROPOSAL_REGION_PATHS = [
  'event.region',
  'region',
  'regionHint.anchorRegion',
  'regionHint.state',
  'regionHint.country',
] as const

/**
 * What of `user-submissions` a manager may see.
 *
 * The role grant that reaches this restricted collection is collection-wide,
 * and the collection now holds four different things in one table — so without
 * this narrowing, granting a manager the proposals they review would also hand
 * them every registrant's address and every stranger's message. The grant says
 * *whether*; this says *which rows*.
 *
 * - **contact** rows, only where the form names them as its recipient. The
 *   recipient lives on the form rather than the submission (one author's
 *   decision, not four hundred rows'), so the clause reaches through the
 *   relationship.
 * - **proposal** rows they are the reviewer of, which is the job. Reviewing is
 *   what the two derived roles differ over, so each contributes its own clause:
 *   a region manager reads the proposals landing in their subtree, an event
 *   assignee the update proposals on their own events, and someone who is both
 *   reads the union.
 *
 * `registration` and `subscribe` rows appear for nobody but an admin. They are
 * consent and attendance records, and no manager task reads them.
 */
async function managerSubmissionScope(req: PayloadRequest): Promise<Where> {
  const user = req.user!
  // The same predicate the caller gated on, repeated so the narrowing reaches
  // the joins: a `Client` shares none of their keys.
  const roles = isManager(user) ? virtualRoles(user) : []

  const or: Where[] = [
    { and: [{ type: { equals: 'contact' } }, { 'form.recipient': { equals: user.id } }] },
  ]

  if (roles.includes('atlas-event-manager')) {
    or.push({ and: [{ type: { equals: 'proposal' } }, { 'event.manager': { equals: user.id } }] })
  }

  if (roles.includes('atlas-region-manager')) {
    const ownedRegionIds = await resolveOwnedRegionIds(req, Number(user.id))
    if (ownedRegionIds.length) {
      or.push({
        and: [
          { type: { equals: 'proposal' } },
          { or: PROPOSAL_REGION_PATHS.map((path) => ({ [path]: { in: ownedRegionIds } })) },
        ],
      })
    }
  }

  return { or }
}

/**
 * A client read of a child row, narrowed to the state of the document it hangs
 * off.
 *
 * The published-only clause above and Payload's own trash filter are both
 * **per collection**, so a child carrying neither answers for a parent that
 * refuses to be read at all. A `meditation-transcripts` row is the full spoken
 * word of a recording plus the R2 key it plays from, and a draft or trashed
 * meditation handed both to any client key (#968). A client reads a transcript
 * because it may read the recording, so the row's own reach has to end where
 * the recording's does.
 *
 * Spelled against the parent relationship rather than a resolved id list: this
 * clause is combined into the join query too (`sanitizeJoinQuery`), where a
 * second round trip per read would be paid on every meditation.
 *
 * ⚠ A row whose `meditation` a hard delete has nulled matches neither key, so
 * no client reads an orphan.
 *
 * Exempt for a live-preview request, for the same reason the published-only
 * clause above is: a preview is a credentialed read of unpublished work.
 */
const CLIENT_PARENT_STATE_SCOPES: Partial<Record<ContentSlug, Where>> = {
  'meditation-transcripts': {
    'meditation._status': { equals: 'published' },
    'meditation.deletedAt': { exists: false },
  },
}

/**
 * Create unified access config for collections and globals
 *
 * @param collection - Collection slug
 * @param operations - Operations to create access handlers for
 * @param bypassFn - Optional bypass function
 * @returns Access config object with specified operations
 */
export function createAccessConfig(
  collection: ContentSlug,
  operations: Array<'read' | 'create' | 'update' | 'delete'>,
  bypassFn?: BypassPermissionFunction,
): CollectionConfig['access'] {
  const accessConfig: CollectionConfig['access'] = {}

  for (const operation of operations) {
    accessConfig[operation] = async ({ req, id, data }: AccessArgs): Promise<boolean | Where> => {
      const args = {
        user: req.user,
        collection,
        operation,
        locale: roleScopeFromLocale(req.locale),
        ...(id && { docId: id }),
      }

      const hasAccess = hasPermission(args, bypassFn)

      if (hasAccess) {
        if (
          operation === 'read' &&
          req.user?.collection === 'clients' &&
          entityHasDrafts(req, collection) &&
          !isLivePreviewRequest(req)
        ) {
          // Restrict to published only unless all requirements are met.
          //
          // ⚠ On `pages` and `app-cards` this clause is now **per locale**:
          // `versions.drafts.localizeStatus` moved `_status` into their
          // `_locales` tables, and Drizzle scopes the same `Where` to the
          // requested locale. The clause is unchanged and load-bearing — with
          // it removed, a read at `?locale=de` returns the German text of a
          // locale the editor unpublished (measured, #718). It also means a
          // page published in English alone returns nothing at `?locale=de`,
          // which is the point rather than a regression.
          return { _status: { equals: 'published' } }
        }

        if (
          operation === 'read' &&
          req.user?.collection === 'clients' &&
          !isLivePreviewRequest(req)
        ) {
          const parentScope = CLIENT_PARENT_STATE_SCOPES[collection]
          if (parentScope) return parentScope
        }

        // The Atlas roles grant create/update/delete on regions/events, but
        // only within the region subtree a region manager owns, or on the
        // events an assignee is named on — narrow the collection-wide grant to
        // a scoped Where (or boolean). See regionSubtreeAccess.ts.
        if (operation !== 'read' && isManager(req.user) && isRegionSubtreeCollection(collection)) {
          return scopeRegionSubtreeWrite({ req, collection, operation, id, data })
        }

        // Narrow a manager's write to the language their role was read in, on
        // a collection carrying a top-level `locale` — the document's own
        // language. See localeScopedWrites.ts.
        if (operation !== 'read' && scopesWritesByLocale(req, collection) && isManager(req.user)) {
          return scopeLocaleWrite(operation, args.locale, data)
        }

        // A manager's `user-submissions` grant is collection-wide, but the
        // collection holds four different things — so narrow it to the rows
        // their job actually needs. See `managerSubmissionScope`.
        if (collection === 'user-submissions' && isManager(req.user)) {
          return managerSubmissionScope(req)
        }

        return true
      }

      // Role-based access denied. An active non-admin manager may still reach
      // read/update on documents that list them (or an ancestor) via a manager
      // field — see documentManagers.ts. This DB-touching path runs only after
      // the query-free permission check has already failed.
      if ((operation === 'read' || operation === 'update') && isManager(req.user)) {
        const fields = getDocManagerFields(req.payload, collection)
        if (hasDocManagerAccess(fields)) {
          const userId = req.user!.id
          // Single-document update → boolean; read or bulk update → constrain
          // the query to the managed set (or deny outright when it's empty).
          if (operation === 'update' && id !== undefined) {
            return userManagesDocument(req, collection, userId, id, fields)
          }
          const ids = await resolveManagedDocIds(req, collection, userId, fields)
          return ids.length ? { id: { in: ids } } : false
        }
      }

      return false
    }
  }

  return accessConfig
}

/**
 * The access keys this plugin DERIVES from `update` rather than computes from
 * the role tables — the operations that are EDIT authority wearing another
 * name: version history (#719) and clearing a login lockout (#748).
 *
 * They share one failure. Left unwritten, Payload answers each from a
 * permissive default — `Boolean(user)` for `unlock`, from its collection
 * defaults, and the same `defaultAccess` fallback in `executeAccess` for an
 * unset `readVersions` — which a published client's API key satisfies. So
 * they share one derivation, and the differences between them fit in this
 * table.
 *
 * `admin` is the one collection access key left unwritten, and it does NOT
 * belong here: it gates the admin panel for `config.admin.user` alone, so no
 * client key reaches it, and `update` is not its authority. See "The one key
 * still unwritten" in `docs/rules/access.md`.
 */
type DerivedGrantKey = 'readVersions' | 'unlock'

type DerivedGrant = {
  /**
   * Rewrite a `Where` from `update` — which queries DOCUMENTS — onto the
   * collection this operation actually runs over. Absent means the operation
   * queries the same documents `update` already answers about.
   */
  translateWhere?: (where: Where) => Where
}

const DERIVED_GRANTS: Record<DerivedGrantKey, DerivedGrant> = {
  // ⚠ A versions query runs over VERSION ROWS, where a document's fields sit
  // under `version.` and its id is `parent`. Skip the translation and
  // `{ id: { in: [7] } }` matches version rows by their own primary key — a
  // wrong answer that still returns documents.
  readVersions: { translateWhere: appendVersionToQueryKey },
  // `unlock` queries the auth collection itself, which is what `update`
  // already answers about. No translation.
  unlock: {},
}

/**
 * Derive each named grant from the config's own `update`, unless it is already
 * set. Whoever may edit an entity reads its version history and clears its
 * login lockout. Nobody else.
 *
 * Why `update` is the authority, and what each key exposed before: "Version
 * history is edit authority" and "Unlocking an account is edit authority" in
 * `docs/rules/access.md`.
 *
 * ⚠ Wrap the MERGED access config, after any per-entity override. Deriving
 * inside `createAccessConfig` binds the grant to an `update` the override has
 * already replaced — which is the drift the delegation exists to prevent.
 */
export function withDerivedGrants<
  T extends Partial<Record<DerivedGrantKey, Access>> & { update?: Access },
>(access: T, keys: readonly DerivedGrantKey[]): T {
  const { update } = access
  const derived: Partial<Record<DerivedGrantKey, Access>> = {}

  for (const key of keys) {
    if (access[key]) continue
    const { translateWhere } = DERIVED_GRANTS[key]

    // ⚠ Fail CLOSED when there is no `update` to delegate to. Returning the
    // config untouched instead leaves the key unset, and Payload refills an
    // unset key with the permissive default this function exists to remove.
    // Unreachable today — `createAccessConfig` always assigns `update` — but
    // that silence is exactly how #719 and #748 shipped.
    derived[key] = update
      ? // ⚠ Drop the id. `findVersionByID` passes the VERSION ROW's primary
        // key, not the document's, so every id-sensitive branch of `update`
        // would answer about the wrong document. `unlockOperation` passes no
        // id at all, and dropping it keeps that true if a future Payload
        // passes one, rather than letting the self-access bypass
        // (`user.id === docId`) hand an account its own unlock. Dropped,
        // `update` answers at the list level, and `findVersionByID` ANDs the
        // row id back on itself.
        async ({ id: _id, ...args }) => {
          const result = await update(args)
          return translateWhere && hasWhereAccessResult(result) ? translateWhere(result) : result
        }
      : () => false
  }

  return { ...access, ...derived }
}

/**
 * Create access config for field-level access control
 * Used for non-localized fields in translatable collections
 *
 * @param collection - Collection slug
 * @param operations - Operations to create access handlers for
 * @param bypassFn - Optional bypass function
 * @param fieldContext - Field context (e.g., { localized: false })
 * @returns Field access config object with specified operations
 */
export function createFieldAccessConfig(
  collection: ContentSlug,
  operations: Array<'read' | 'create' | 'update'>,
  bypassFn?: BypassPermissionFunction,
  fieldContext?: { localized: boolean },
): FieldAccessConfig {
  const accessConfig: FieldAccessConfig = {}

  for (const operation of operations) {
    accessConfig[operation] = ({ req }: { req: PayloadRequest }) => {
      const args = {
        user: req.user,
        collection,
        operation,
        locale: roleScopeFromLocale(req.locale),
        ...(fieldContext && { field: fieldContext }),
      }
      return hasPermission(args, bypassFn)
    }
  }

  return accessConfig
}
