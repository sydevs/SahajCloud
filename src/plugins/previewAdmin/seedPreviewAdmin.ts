import type { Payload } from 'payload'

import { serverEnv } from '@/lib/env'

import { shouldSeedPreviewAdminHere } from './shouldSeedPreviewAdmin'

/** Matches the default the smoke lane's `PREVIEW_ADMIN` uses. */
const DEFAULT_PREVIEW_ADMIN_EMAIL = 'contact@sydevelopers.com'

/**
 * Reconcile the Railway preview's admin account from `PREVIEW_ADMIN_PASSWORD`.
 *
 * Runs from `onInit`, so it happens on **every** deploy of a preview environment, after
 * the migrations the Postgres adapter applies on boot. That cadence is the whole point
 * of the ticket (sydevs/SahajCloud#662): a preview's Postgres volume outlives its
 * deploys, so an admin created once by the smoke run kept the password *that run* used
 * and the credential became a property of the database rather than of the current
 * secret. Rotating the secret then orphaned every already-seeded preview — the smoke
 * lane could neither log in nor re-register, because Payload refuses `first-register`
 * as soon as the collection holds anything.
 *
 * **Password writes must go through Payload's local API, never SQL.** The value is
 * salted and hashed by the auth strategy, so a direct `UPDATE` produces a row that
 * cannot authenticate — the same failure this function exists to remove, arrived at
 * from the other direction.
 *
 * **`_verified: true` is not optional.** The Managers collection configures
 * `auth.verify`, so a document created without it cannot log in until somebody clicks a
 * link in an email a preview does not send. `first-register` set it implicitly; a
 * `create` does not.
 *
 * Never throws. A preview that cannot seed its admin should still boot and serve — the
 * smoke lane's login is what reports the problem, and failing the deploy would take the
 * whole preview down over a test credential.
 */
export const seedPreviewAdmin = async (payload: Payload): Promise<void> => {
  if (!shouldSeedPreviewAdminHere()) return

  const email = serverEnv.PREVIEW_ADMIN_EMAIL ?? DEFAULT_PREVIEW_ADMIN_EMAIL
  // Non-null by the gate above, which is the only caller's precondition.
  const password = serverEnv.PREVIEW_ADMIN_PASSWORD as string

  try {
    const existing = await payload.find({
      collection: 'managers',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      // The admin is what login needs, so this read must not be filtered by the
      // access rules of a request that has no user on it.
      overrideAccess: true,
    })

    const current = existing.docs[0]

    if (current) {
      await payload.update({
        collection: 'managers',
        id: current.id,
        data: {
          password,
          type: 'admin',
          _verified: true,
          // A rotated secret means the smoke lane has been failing to log in, and
          // `maxLoginAttempts: 5` locks the account after five of those. Reconciling
          // the password without clearing the lock would fix the credential and leave
          // the account shut for another ten minutes.
          loginAttempts: 0,
          lockUntil: null,
        },
        overrideAccess: true,
      })

      payload.logger.info(`[previewAdmin] reconciled ${email}`)
      return
    }

    await payload.create({
      collection: 'managers',
      data: {
        email,
        password,
        name: 'Preview Admin',
        type: 'admin',
        _verified: true,
      },
      overrideAccess: true,
    })

    payload.logger.info(`[previewAdmin] created ${email}`)
  } catch (error) {
    payload.logger.error(
      { err: error },
      `[previewAdmin] could not provision ${email} — the preview will boot without a ` +
        'usable admin, and the smoke lane will report the login failure.',
    )
  }
}
