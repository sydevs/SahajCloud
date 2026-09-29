import type { Payload } from 'payload'

import { serverEnv } from '@/lib/env'

import { shouldSeedPreviewAdminHere } from './shouldSeedPreviewAdmin'

/**
 * The one address a preview's admin holds, or `undefined` where there is none.
 *
 * ⚠ **No default, because this address is now the credential.** The sign-in page
 * signs it in without mailing anything (`previewAutoSignIn`), so a fallback
 * anybody could guess would hand every preview's admin to whoever typed it.
 *
 * ⚠ **The auto sign-in resolves it from here too.** Two copies would let the
 * seeder provision one address while the page signed in another — a mailed link
 * nobody can open, reported as "the deploy did not seed".
 */
export const previewAdminEmail = (): string | undefined => serverEnv.PREVIEW_ADMIN_EMAIL

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
 * accepted. How the smoke lane signs in is `src/plugins/previewAdmin/previewAutoSignIn.ts`
 * — the same address, asked for on the sign-in page, gated by the same predicate.
 *
 * **`_verified: true` is not optional.** The Managers collection configures
 * `auth.verify`, so the JWT strategy yields no user while that flag is false — the
 * exchanged session would authenticate nobody.
 *
 * Never throws. A preview that cannot seed its admin should still boot and serve — the
 * smoke lane's sign-in is what reports the problem, and failing the deploy would take
 * the whole preview down over a test account.
 */
export const seedPreviewAdmin = async (payload: Payload): Promise<void> => {
  if (!shouldSeedPreviewAdminHere()) return

  // Non-null: the gate above is `Boolean(PREVIEW_ADMIN_EMAIL)` and nothing else
  // reaches here without it.
  const email = previewAdminEmail()!

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
