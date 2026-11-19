import type { PendingInvitation } from './grantSummary'
import type { LoginCollectionConfig, LoginDocument } from './types'
import type { CollectionAfterChangeHook, Field, PayloadRequest, TaskConfig } from 'payload'

import { runClock } from '@/lib/jobs/runClock'
import { DEFAULT_LOCALE } from '@/lib/locales'
import { NEVER_FREQUENCY, notificationFrequency } from '@/lib/notifications/preferences'
import { relationId } from '@/lib/utilities/relationId'
import { managesThroughAncestor, selfOrAdminFieldAccess } from '@/plugins/access'
import { capture } from '@/plugins/sentry/capture'

import { MANAGERS_COLLECTION } from './grantSummary'
import { composeInvitations } from './invite'

/**
 * The invitation queue: a manager is invited when they are **assigned
 * something** — a role, or a region, event or page that names them — never
 * when their account is created.
 *
 * Only what is new to them. Nothing is queued for their own change, for a
 * document they already hold through a region or parent above it, or for one
 * they were taken off and put back on within the same window (`released`).
 *
 * Assignments collect on the manager (`pendingInvitation`) and the send waits
 * until {@link INVITATION_DELAY_MS} after the last one (`invitationDueAt`), so
 * an admin who assigns a region and then twelve events sends one email, not
 * thirteen. `sendInvitations` sends whatever is due, every five minutes.
 *
 * ⚠ **Both fields are written with `payload.db.updateOne`, never `update`.**
 * They are bookkeeping on someone else's save: `update` would run the
 * manager's hooks and validate the whole stored document, so an imported
 * manager with legacy data that fails a newer validator would roll back the
 * region save that named them.
 */

/** How long after the last assignment the invitation waits for more. */
export const INVITATION_DELAY_MS = 10 * 60 * 1000

/** The job queue `sendInvitations` runs on, and the cadence it runs at. */
export const INVITATIONS_QUEUE = 'invitations'
export const INVITATIONS_CRON = '*/5 * * * *'

/** How many due invitations one run sends. The rest wait five minutes. */
const BATCH = 50

/**
 * The queue's two fields. Hidden, and `update: () => false` for the same reason
 * as `magicLinkIssuedAt`: self-access would otherwise let a manager rewrite
 * their own queue. The queue's own writes bypass access entirely.
 *
 * ⚠ `read` is locked here because `Managers/access.ts` runs before the plugin
 * appends these (#908). `selfOrAdminFieldAccess` admits managers alone, so a
 * second collection the plugin serves would be denied its own value.
 */
export const invitationFields: Field[] = [
  {
    name: 'pendingInvitation',
    type: 'json',
    admin: { hidden: true },
    access: { read: selfOrAdminFieldAccess, update: () => false },
  },
  {
    name: 'invitationDueAt',
    type: 'date',
    index: true,
    admin: { hidden: true },
    access: { read: selfOrAdminFieldAccess, update: () => false },
  },
]

/** Every id a relationship value holds, whichever shape it arrived in. */
const idsOf = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [value]).map(relationId).filter((id) => id !== null)

/** `a ∪ b`, keeping `a`'s order. */
const union = <T>(a: T[] = [], b: T[] = []) => [...new Set([...a, ...b])]

/** `list` without any of `drop`, comparing ids as strings. */
const without = <T>(list: T[] = [], drop: unknown[] = []) => {
  const dropped = new Set(drop.map(String))
  return list.filter((id) => !dropped.has(String(id)))
}

/**
 * A change nobody needs telling about: the manager's own — creating an event
 * they manage, or a sub-region they look after — or a seed import's
 * (`LoginPluginOptions.invitations`), or the preview fixture's.
 */
const isUnannounced = (req: PayloadRequest, managerId: number | string): boolean =>
  (req.user?.collection === MANAGERS_COLLECTION && String(req.user.id) === String(managerId)) ||
  Boolean(req.context?.seed || req.context?.fixture)

/**
 * Fold one save's change into what is queued for `managerId`, and push the
 * send out to {@link INVITATION_DELAY_MS} from now.
 *
 * `managed` is what the save named them on and `released` what it took them
 * off. Each cancels the other within a window: a document put back after
 * being released was theirs all along, and one released after being newly
 * named was never theirs. A release still pushes the send out, so the queue
 * — and what it remembers — is cleared within the window either way.
 *
 * ⚠ **A read-modify-write, and not atomic.** Two saves naming the same manager
 * in the same instant can drop one of the two ids. The admin assigns one thing
 * at a time, and a dropped id only goes unannounced — access is unaffected.
 */
async function enqueue(
  req: PayloadRequest,
  managerId: number | string,
  change: Omit<PendingInvitation, 'by'>,
): Promise<void> {
  if (isUnannounced(req, managerId)) return

  const { payload } = req
  const manager = await payload
    .findByID({
      collection: MANAGERS_COLLECTION,
      id: managerId,
      depth: 0,
      overrideAccess: true,
      req,
      select: { pendingInvitation: true, type: true },
    })
    // A dangling relationship names no one to invite.
    .catch(() => null)
  if (!manager || manager.type === 'inactive') return

  const queued = (manager.pendingInvitation ?? {}) as PendingInvitation
  const managed = { ...queued.managed }
  const released = { ...queued.released }
  for (const [collection, ids] of Object.entries(change.managed ?? {})) {
    const putBack = (released[collection] ?? []).map(String)
    released[collection] = without(released[collection], ids)
    managed[collection] = union(managed[collection], without(ids, putBack))
  }
  for (const [collection, ids] of Object.entries(change.released ?? {})) {
    const newlyNamed = (managed[collection] ?? []).map(String)
    managed[collection] = without(managed[collection], ids)
    released[collection] = union(released[collection], without(ids, newlyNamed))
  }
  const roles = { ...queued.roles }
  for (const [locale, slugs] of Object.entries(change.roles ?? {})) {
    roles[locale] = union(roles[locale], slugs)
  }
  // A release names nobody as the one who asked.
  const assigns = Boolean(change.managed || change.roles)
  const actor = req.user?.collection === MANAGERS_COLLECTION ? req.user.id : null
  const by = assigns ? actor : (queued.by ?? null)

  await payload.db.updateOne({
    collection: MANAGERS_COLLECTION,
    id: managerId,
    data: {
      pendingInvitation: { managed, released, roles, by } satisfies PendingInvitation,
      invitationDueAt: new Date(Date.now() + INVITATION_DELAY_MS).toISOString(),
    },
    req,
    returning: false,
  })
}

/**
 * `afterChange` for a collection whose `on` field names managers: queue an
 * invitation for each manager the save newly names, unless a region or parent
 * above the document already makes it theirs, and remember each one it takes
 * off.
 */
export function queueOnManagerField(collection: string, on: string): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, req }) => {
    const before = idsOf(previousDoc?.[on])
    const after = idsOf(doc[on])
    for (const managerId of without(after, before)) {
      if (isUnannounced(req, managerId)) continue
      if (await managesThroughAncestor(req, collection, doc, managerId)) continue
      await enqueue(req, managerId, { managed: { [collection]: [doc.id] } })
    }
    for (const managerId of without(before, after)) {
      await enqueue(req, managerId, { released: { [collection]: [doc.id] } })
    }
    return doc
  }
}

/** A localized `roles` value as `{ locale: slugs }`, whichever shape the write had. */
function rolesByLocale(value: unknown, locale: string | undefined): Record<string, string[]> {
  if (Array.isArray(value)) return { [locale && locale !== 'all' ? locale : DEFAULT_LOCALE]: value }
  return value && typeof value === 'object' ? (value as Record<string, string[]>) : {}
}

/**
 * `afterChange` for `managers`: queue the roles a save added.
 *
 * Only for a `manager`: an admin holds every role already, and an inactive
 * account is told nothing.
 */
export const queueOnRoles: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (doc.type !== 'manager') return doc

  const before = rolesByLocale(previousDoc?.roles, req.locale)
  const added = Object.fromEntries(
    Object.entries(rolesByLocale(doc.roles, req.locale))
      .map(([locale, slugs]) => [locale, slugs.filter((slug) => !before[locale]?.includes(slug))])
      .filter(([, slugs]) => slugs.length > 0),
  )
  if (Object.keys(added).length > 0) await enqueue(req, doc.id, { roles: added })
  return doc
}

/**
 * Send every invitation that is due.
 *
 * ⚠ **Each queue is claimed — cleared — before its send, not after.** An
 * assignment saved while the email renders then starts a fresh queue instead
 * of being wiped with the one just sent. The cost is that a failed send is not
 * retried: it is counted `failed` and reported, and the next assignment
 * queues a fresh one.
 */
export function sendInvitationsTask(config: LoginCollectionConfig): TaskConfig<'sendInvitations'> {
  return {
    slug: 'sendInvitations',
    label: 'Send Invitations',
    concurrency: {
      key: () => 'sendInvitations',
      exclusive: true,
    },
    outputSchema: [
      { name: 'sent', type: 'number', required: true },
      { name: 'skipped', type: 'number', required: true },
      { name: 'failed', type: 'number', required: true },
    ],
    schedule: [{ cron: INVITATIONS_CRON, queue: INVITATIONS_QUEUE }],
    handler: async ({ req }) => {
      const { payload } = req
      const now = runClock(req)
      const output = { sent: 0, skipped: 0, failed: 0 }

      const { docs } = await payload.find({
        collection: config.slug,
        where: { invitationDueAt: { less_than_equal: now.toISOString() } },
        limit: BATCH,
        sort: 'invitationDueAt',
        depth: 0,
        overrideAccess: true,
        req,
      })

      for (const manager of docs) {
        const doc = manager as unknown as QueuedAccount

        await payload.db.updateOne({
          collection: config.slug,
          id: doc.id,
          data: { pendingInvitation: null, invitationDueAt: null },
          req,
          returning: false,
        })

        try {
          const sent = await sendOne({ config, doc, now, req })
          if (sent) output.sent++
          else output.skipped++
        } catch (error) {
          output.failed++
          capture({
            error,
            message: 'sendInvitations: invitation failed',
            extra: { managerId: doc.id },
            logger: payload.logger,
          })
        }
      }

      return { output }
    },
  }
}

/** A manager as the send reads it: the queue, and whether they want it. */
type QueuedAccount = LoginDocument & {
  notificationPreferences?: Record<string, { frequency?: string }> | null
  pendingInvitation?: PendingInvitation | null
}

/** Send one manager's due invitation. Returns whether anything was sent. */
async function sendOne({
  config,
  doc,
  now,
  req,
}: {
  config: LoginCollectionConfig
  doc: QueuedAccount
  now: Date
  req: PayloadRequest
}): Promise<boolean> {
  const { payload } = req
  if (!doc.email || !doc.pendingInvitation) return false
  if (config.isEligible && !config.isEligible(doc)) return false
  if (notificationFrequency(doc.notificationPreferences, 'invitation') === NEVER_FREQUENCY) {
    return false
  }

  const { by } = doc.pendingInvitation
  const assigner =
    by === null || by === undefined
      ? null
      : await payload
          .findByID({
            // `enqueue` records an id here only when the actor is a manager.
            collection: MANAGERS_COLLECTION,
            id: by,
            depth: 0,
            overrideAccess: true,
            req,
            select: { name: true },
          })
          .catch(() => null)

  const invitations = await composeInvitations({
    assignedBy: assigner?.name || undefined,
    config,
    doc,
    now,
    only: doc.pendingInvitation,
    payload,
    req,
  })
  // One per project — the queue may hold an Atlas event and a We Meditate page.
  for (const invitation of invitations) await payload.sendEmail({ to: doc.email, ...invitation })
  return invitations.length > 0
}
