import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { asTrustedReq } from '@/plugins/usage/hooks'
import { applyWriteGuard, DEFAULT_WRITE_GUARD_POLICIES } from '@/plugins/writeGuard'

/**
 * The `users` collection's own field constraints, restated because the insert
 * below goes around them.
 *
 * ⚠ **A Drizzle-level write runs no Payload field validation, and the
 * write-guard is not a substitute** — the guard checks *content* (disposable
 * domains, URLs in free text) and only for a `clients` caller, so on its own it
 * would let a blank `name` or a malformed `email` through from anyone else. The
 * `users` collection is two fields wide (`Users.ts` — `name` required text,
 * `email` required and unique), which is the only reason restating them is
 * proportionate; a third constrained field belongs here too.
 *
 * `event-submissions` is the caller that proves this is not theoretical:
 * `prepareSubmission` forwards `submitterInfo.name` unchecked, and an empty one
 * used to be refused by Payload with `The following field is invalid: Name`.
 */
const registrantSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1),
})

/**
 * The Drizzle handle bound to the caller's transaction, or the pool when there
 * is none.
 *
 * ⚠ **This is what makes the insert below part of the caller's transaction**,
 * and it is the premise sydevs/SahajCloud#673 said to verify first: a
 * Drizzle-level write does not pick a transaction up from `req` on its own.
 * `adapter.sessions[transactionID].db` is the `tx` object Drizzle handed the
 * adapter in `beginTransaction`, so a statement issued on it is inside that
 * transaction and rolls back with it.
 *
 * Mirrors `getTransaction` in `@payloadcms/drizzle/dist/utilities/getTransaction.js`
 * — the adapter's own helper, including its fall back to `adapter.drizzle` when
 * the session is gone. Not imported, because `@payloadcms/drizzle` is a
 * transitive package here; only `@payloadcms/db-postgres` is a direct
 * dependency, and it does not re-export it.
 */
async function transactionalDrizzle(req: PayloadRequest): Promise<PostgresAdapter['drizzle']> {
  const adapter = req.payload.db as unknown as PostgresAdapter
  if (!req.transactionID) return adapter.drizzle
  return adapter.sessions[await req.transactionID]?.db ?? adapter.drizzle
}

/**
 * Find-or-create a `users` (registrant) row by normalized email — the shared
 * identity step behind every public flow that captures a person (event
 * registration, event submission, a contact message).
 *
 * **Race-safe by database guarantee, not by application retry.** The insert is
 * `INSERT … ON CONFLICT (email) DO NOTHING RETURNING id`, so a concurrent
 * request that got there first produces *no failed statement* — just an empty
 * result, after which the row is read back.
 *
 * ⚠ **That is the property the caller's transaction depends on, and it is why
 * the previous `create`-then-catch shape had to go** (sydevs/SahajCloud#673).
 * Inside a Postgres transaction a unique violation aborts the whole
 * transaction, so the old recovery `find` would have failed with *"current
 * transaction is aborted"* — turning a handled race into a 500 on the
 * registration path. Nothing here may reintroduce a statement that is allowed
 * to fail.
 *
 * `users` is a restricted, admin-only collection, so the reads elevate via
 * `overrideAccess`. Going around `payload.create` also goes around its field
 * validation and its hooks, so both are restored here explicitly:
 * `registrantSchema` above for the field constraints, `applyWriteGuard` below
 * for the anti-spam policy. `Users` has no hooks of its own, no localized
 * fields and no versions, so nothing else was riding on that seam.
 *
 * Returns the user id.
 */
export async function upsertUserByEmail(args: {
  email: string
  name: string
  req: PayloadRequest
}): Promise<number> {
  const { req } = args
  const fields = registrantSchema.safeParse({ email: args.email, name: args.name })
  if (!fields.success) {
    throw new APIError(
      `The following field is invalid: ${fields.error.issues[0]?.path.join('.') ?? 'registrant'}`,
      400,
      { code: 'invalid_registrant' },
      true,
    )
  }
  const { name } = fields.data
  const normalizedEmail = fields.data.email.toLowerCase()

  const findByEmail = async () => {
    const { docs } = await req.payload.find({
      collection: 'users',
      where: { email: { equals: normalizedEmail } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: asTrustedReq(req),
    })
    return docs[0]?.id
  }

  const existing = await findByEmail()
  if (existing != null) return existing

  // ⚠ **The guard the collection seam can no longer run.** `payload.create`
  // used to carry the caller's `req` here precisely so the write-guard plugin's
  // `users` policy (email format + disposable list, URL scan on the name)
  // applied to a client-originated create. A Drizzle-level insert runs no
  // Payload hooks, so that policy is applied explicitly — from the same map the
  // plugin installs, not a second copy of the rules.
  await applyWriteGuard({
    data: { email: normalizedEmail, name },
    operation: 'create',
    policy: DEFAULT_WRITE_GUARD_POLICIES.users,
    req,
  })

  const db = await transactionalDrizzle(req)
  const users = (req.payload.db as unknown as PostgresAdapter).tables.users
  const [inserted] = await db
    .insert(users)
    .values({ email: normalizedEmail, name })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id })

  if (typeof inserted?.id === 'number') return inserted.id

  // The conflict path: another transaction owns this email. `DO NOTHING` waited
  // for it and returned no row rather than raising, so this transaction is
  // intact and the read is safe — which is the whole reason for the shape.
  const raced = await findByEmail()
  if (raced == null) {
    throw new Error(`upsertUserByEmail: insert conflicted on ${normalizedEmail} but no row was found`)
  }
  return raced
}
