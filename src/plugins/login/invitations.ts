import type { PendingInvitation } from './grantSummary'
import type { LoginCollectionConfig, LoginDocument } from './types'
import type { CollectionAfterChangeHook, Field, PayloadRequest, TaskConfig } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { DEFAULT_LOCALE } from '@/lib/locales'
import { relationId } from '@/lib/utilities/relationId'

import { MANAGERS_COLLECTION } from './grantSummary'
import { composeInvitations } from './invite'

/**
 * The invitation queue: a manager is invited when they are **assigned
 * something** — a role, or a region, event or page that names them — never
 * when their account is created.
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

/** The notification preference that turns invitations off. */
const PREFERENCE_KEY = 'invitation'

/** How many due invitations one run sends. The rest wait five minutes. */
const BATCH = 50

/**
 * The queue's two fields. Hidden, and `update: () => false` for the same reason
 * as `magicLinkIssuedAt`: self-access would otherwise let a manager rewrite
 * their own queue. The queue's own writes bypass access entirely.
 */
export const invitationFields: Field[] = [
  {
    name: 'pendingInvitation',
    type: 'json',
    admin: { hidden: true },
    access: { update: () => false },
  },
  {
    name: 'invitationDueAt',
    type: 'date',
    index: true,
    admin: { hidden: true },
    access: { update: () => false },
  },
]

/** Every id a relationship value holds, whichever shape it arrived in. */
const idsOf = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [value]).map(relationId).filter((id) => id !== null)

/** `a ∪ b`, keeping `a`'s order. */
const union = <T>(a: T[] = [], b: T[] = []) => [...new Set([...a, ...b])]

/**
 * Add `added` to what is already queued for `managerId`, and push the send out
 * to {@link INVITATION_DELAY_MS} from now.
 *
 * ⚠ **A read-modify-write, and not atomic.** Two saves naming the same manager
 * in the same instant can drop one of the two ids. The admin assigns one thing
 * at a time, and a dropped id only goes unannounced — access is unaffected.
 */
async function enqueue(
  req: PayloadRequest,
  managerId: number | string,
  added: Omit<PendingInvitation, 'by'>,
): Promise<void> {
  // A manager's own change is not news to them — creating an event they
  // manage, or a sub-region they look after.
  const self =
    req.user?.collection === MANAGERS_COLLECTION && String(req.user.id) === String(managerId)
  if (self) return

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
  for (const [collection, ids] of Object.entries(added.managed ?? {})) {
    managed[collection] = union(managed[collection], ids)
  }
  const roles = { ...queued.roles }
  for (const [locale, slugs] of Object.entries(added.roles ?? {})) {
    roles[locale] = union(roles[locale], slugs)
  }
  const by = req.user?.collection === MANAGERS_COLLECTION ? req.user.id : null

  await payload.db.updateOne({
    collection: MANAGERS_COLLECTION,
    id: managerId,
    data: {
      pendingInvitation: { managed, roles, by } satisfies PendingInvitation,
      invitationDueAt: new Date(Date.now() + INVITATION_DELAY_MS).toISOString(),
    },
    req,
    returning: false,
  })
}

/**
 * `afterChange` for a collection whose `on` field names managers: queue an
 * invitation for each manager the save newly names. Removing one queues
 * nothing.
 */
export function queueOnManagerField(collection: string, on: string): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, req }) => {
    const before = new Set(idsOf(previousDoc?.[on]).map(String))
    for (const managerId of idsOf(doc[on])) {
      if (before.has(String(managerId))) continue
      await enqueue(req, managerId, { managed: { [collection]: [doc.id] } })
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
 * retried; Payload's email adapters log rather than throw, so a failure here is
 * a render bug, and retrying one every five minutes would mail nothing.
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
      // `req.context.now` overrides the clock for deterministic tests.
      const contextNow = (req.context as { now?: unknown } | undefined)?.now
      const now = contextNow instanceof Date ? contextNow : new Date()
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
        const doc = manager as unknown as LoginDocument & {
          notificationPreferences?: Record<string, { frequency?: string }> | null
          pendingInvitation?: PendingInvitation | null
        }

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
          Sentry.captureException(error, { extra: { managerId: doc.id } })
          payload.logger.error({
            msg: 'sendInvitations: invitation failed',
            err: error,
            managerId: doc.id,
          })
        }
      }

      return { output }
    },
  }
}

/** Send one manager's due invitation. Returns whether anything was sent. */
async function sendOne({
  config,
  doc,
  now,
  req,
}: {
  config: LoginCollectionConfig
  doc: LoginDocument & {
    notificationPreferences?: Record<string, { frequency?: string }> | null
    pendingInvitation?: PendingInvitation | null
  }
  now: Date
  req: PayloadRequest
}): Promise<boolean> {
  const { payload } = req
  if (!doc.email || !doc.pendingInvitation) return false
  if (config.isEligible && !config.isEligible(doc)) return false
  if (doc.notificationPreferences?.[PREFERENCE_KEY]?.frequency === 'Never') return false

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
