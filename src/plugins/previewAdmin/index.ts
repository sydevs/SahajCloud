import type { Payload } from 'payload'

import { managersLogin } from '@/collections/Managers/login'
import { railwayEnvironmentName } from '@/lib/env/deploymentEnvironment'
import type { LoginCollectionConfig } from '@/plugins/login'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

/**
 * The Railway preview's own admin account, and the environments that sign a
 * manager in without a mail (#662, #840).
 *
 * ⚠ **The address is no longer a credential**, and that is the whole of what
 * changed: a preview is reachable only through Cloudflare Access and the
 * shared-secret gate (`src/middleware.ts`), so who may ask is settled before a
 * request arrives. It is a committed constant for that reason — one spelling
 * for the account the seeder provisions and the one CI's fill signs in as, and
 * nothing to set per environment.
 */

/**
 * The provisioned admin, spelled once.
 *
 * Lowercase and untrimmed on purpose: Payload's `email` field lowercases and
 * trims on every write, so any other spelling here would match no row.
 */
export const PREVIEW_ADMIN_ADDRESS = 'preview-admin@sydevelopers.com'

/**
 * What the gate reads. Passed in rather than read from `process.env`, so the
 * unit lane can drive every combination.
 */
export type PreviewAdminGateInput = {
  /** Railway's environment name, or `undefined` off-Railway (local, CI, test). */
  environmentName: string | undefined
  /** True only on the canonical production environment. */
  isProduction: boolean
}

/**
 * Whether this environment signs its managers in directly.
 *
 * Two conditions, and each excludes a place it must never happen:
 *
 * - **On Railway at all.** `environmentName` is `undefined` for local dev, CI
 *   and the test lanes, none of which is reachable only through Access — so
 *   there the sign-in surface would be an open account-enumeration oracle.
 * - **Not production.** Read from `isProductionDeployment()`, the Railway
 *   environment-name check the email adapter and the storage guard make.
 *   Deliberately NOT `NODE_ENV`: previews run `NODE_ENV=production`, the trap
 *   that once sent preview mail through Resend to real addresses.
 *
 * Fail-safe in the direction that matters: an unknown environment answers
 * `false`, so the failure mode is a preview nobody can sign in to — loud, and
 * caught by the smoke lane — never an oracle on the live site.
 */
export function managersSignInDirectly({
  environmentName,
  isProduction,
}: PreviewAdminGateInput): boolean {
  return !!environmentName && !isProduction
}

/**
 * The same answer, for the live environment. Read through
 * {@link managersLoginHere} and {@link previewSignInHere}, never spread by hand
 * — `loginPlugin` itself knows nothing about Railway.
 */
export const previewSignInHere = (): boolean =>
  managersSignInDirectly({
    environmentName: railwayEnvironmentName(),
    isProduction: isProductionDeployment(),
  })

/**
 * `managersLogin` as this environment serves it: with `previewAutoSignIn` on a
 * Railway preview, without it everywhere else.
 *
 * ⚠ **Every caller of `issueMagicLink` for managers takes its config from here**
 * — the plugin (`src/payload.config.ts`, the test harness) and the sign-in page's
 * Server Action. The page once passed the bare `managersLogin`, so the request
 * endpoint signed the preview admin in while the form an actual person uses
 * mailed them a link instead.
 */
export const managersLoginHere = (): LoginCollectionConfig => ({
  ...managersLogin,
  previewAutoSignIn: previewSignInHere(),
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
  if (!previewSignInHere()) return
  const email = PREVIEW_ADMIN_ADDRESS

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
