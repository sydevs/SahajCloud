import type { Payload } from 'payload'

import { serverEnv } from '@/lib/env'

import { shouldSeedPreviewAdminHere } from './shouldSeedPreviewAdmin'

/** Matches the default the smoke lane's `PREVIEW_ADMIN` uses. */
const DEFAULT_PREVIEW_ADMIN_EMAIL = 'contact@sydevelopers.com'

/**
 * The one address a preview's admin holds.
 *
 * ⚠ **The exchange route resolves it from here too.** Two copies would let the
 * seeder provision one address while the route traded for another — a 403 on
 * the preview, reported as "the deploy did not seed".
 */
export const previewAdminEmail = (): string =>
  serverEnv.PREVIEW_ADMIN_EMAIL ?? DEFAULT_PREVIEW_ADMIN_EMAIL

/**
 * Reconcile the Railway preview's admin account.
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
 * **It writes no password, because a manager no longer has one** (sydevs/SahajCloud#840).
 * Its job is narrower than it was: make sure the account exists, is an admin, and is
 * accepted. What the smoke lane signs in with is
 * `src/plugins/login/endpoints/exchangePreviewSecret.ts`, wired by the gate below.
 *
 * **`_verified: true` is not optional.** The Managers collection configures
 * `auth.verify`, so the JWT strategy yields no user while that flag is false — the
 * exchanged session would authenticate nobody.
 *
 * Never throws. A preview that cannot seed its admin should still boot and serve — the
 * smoke lane's exchange is what reports the problem, and failing the deploy would take
 * the whole preview down over a test account.
 */
export const seedPreviewAdmin = async (payload: Payload): Promise<void> => {
  if (!shouldSeedPreviewAdminHere()) return

  const email = previewAdminEmail()

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
          type: 'admin',
          _verified: true,
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
