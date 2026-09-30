import type { Payload } from 'payload'

import { serverEnv } from '@/lib/env'
import { railwayEnvironmentName } from '@/lib/env/deploymentEnvironment'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

/**
 * The Railway preview's admin account: one address, provisioned on every boot
 * and signed in on request without a mail (#662, #840).
 *
 * ⚠ **The address is the credential**, so both halves resolve it from
 * {@link previewAdminEmail} and nowhere else. Two copies would let the seeder
 * provision one address while the sign-in page signed in another — a mailed
 * link nobody can open, reported as "the deploy did not seed".
 */

/**
 * What the gate reads. Passed in rather than read from `process.env`, so the
 * unit lane can drive every combination.
 */
export type PreviewAdminGateInput = {
  /** Railway's environment name, or `undefined` off-Railway (local, CI, test). */
  environmentName: string | undefined
  /** True only on the canonical production environment. */
  isProduction: boolean
  /** `PREVIEW_ADMIN_EMAIL`, absent everywhere it is not deliberately supplied. */
  email: string | undefined
}

/**
 * The preview admin's address, or `undefined` wherever there must be none.
 *
 * Three conditions, and each excludes a place the admin must never exist:
 *
 * - **On Railway at all.** `environmentName` is `undefined` for local dev, CI and
 *   the test lanes. That matters because CI *does* hold `PREVIEW_ADMIN_EMAIL` as
 *   a secret, and a gate reading only the address would write an admin into the
 *   integration lane's database.
 * - **Not production.** Read from `isProductionDeployment()`, the Railway
 *   environment-name check the email adapter and the storage guard make.
 *   Deliberately NOT `NODE_ENV`: previews run `NODE_ENV=production`, the trap
 *   that once sent preview mail through Resend to real addresses.
 * - **An address was supplied.** There is no default, because anyone who opens a
 *   preview and types the address becomes its admin — so it must not be
 *   guessable, and an environment without it gets no admin at all.
 *
 * Normalised to the stored spelling: Payload's `email` field lowercases and trims
 * on every write, so a capital in the variable would match no row.
 *
 * Fail-safe in the direction that matters: an unknown environment yields
 * `undefined`, so the failure mode is a preview without an admin — loud, and
 * caught by the smoke lane — never a write to production.
 */
export function resolvePreviewAdminEmail({
  email,
  environmentName,
  isProduction,
}: PreviewAdminGateInput): string | undefined {
  const address = email?.trim().toLowerCase()
  return environmentName && !isProduction && address ? address : undefined
}

/**
 * The same answer, for the live environment. Read once, by the composition root
 * (`src/payload.config.ts` and the test harness), when it builds `loginPlugin` —
 * which itself knows nothing about Railway.
 */
export const previewAdminEmail = (): string | undefined =>
  resolvePreviewAdminEmail({
    email: serverEnv.PREVIEW_ADMIN_EMAIL,
    environmentName: railwayEnvironmentName(),
    isProduction: isProductionDeployment(),
  })

/**
 * Reconcile the preview's admin account: present, an admin, and accepted.
 *
 * Runs from `onInit`, so on **every** deploy of a preview, after the boot
 * migrations. A preview's Postgres volume outlives its deploys, so an account
 * created once would otherwise keep whatever state that first boot gave it.
 *
 * **`_verified: true` is not optional.** `Managers` configures `auth.verify`, and
 * the JWT strategy yields no user while that flag is false — the session the
 * sign-in page mints would authenticate nobody.
 *
 * Never throws. A preview that cannot seed its admin should still boot and serve;
 * the smoke lane's sign-in is what reports the problem.
 */
export async function seedPreviewAdmin(payload: Payload): Promise<void> {
  const email = previewAdminEmail()
  if (!email) return

  try {
    const { docs } = await payload.find({
      collection: 'managers',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      // Nothing is signed in during `onInit`, so access would filter this out.
      overrideAccess: true,
    })
    const existing = docs[0]

    if (existing) {
      await payload.update({
        collection: 'managers',
        id: existing.id,
        data: { type: 'admin', _verified: true },
        overrideAccess: true,
      })
    } else {
      await payload.create({
        collection: 'managers',
        data: { email, name: 'Preview Admin', type: 'admin', _verified: true },
        overrideAccess: true,
      })
    }
    payload.logger.info(`[previewAdmin] ${existing ? 'reconciled' : 'created'} ${email}`)
  } catch (error) {
    payload.logger.error(
      { err: error },
      `[previewAdmin] could not provision ${email} — the preview will boot without a ` +
        'usable admin, and the smoke lane will report the sign-in failure.',
    )
  }
}
