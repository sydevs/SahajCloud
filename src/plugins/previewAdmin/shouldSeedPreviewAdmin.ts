import { serverEnv } from '@/lib/env'
import { railwayEnvironmentName } from '@/lib/env/deploymentEnvironment'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

/**
 * Inputs the gate reads. Passed in rather than read from `process.env` here, so the
 * predicate is a pure function the unit lane can drive through every combination.
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
 * Whether this boot should reconcile the preview admin.
 *
 * Three conditions, and each excludes a place this must never run:
 *
 * - **On Railway at all.** `environmentName` is `undefined` for local dev, CI and the
 *   test lanes, so `onInit` there is a no-op no matter what else is set. That matters
 *   because CI *does* hold `PREVIEW_ADMIN_EMAIL` as a secret, and a gate that read
 *   only the password would write an admin into the integration lane's database.
 * - **Not production.** Read from `isProductionDeployment()`, the same Railway
 *   environment-name check the email adapter and the storage guard already make.
 *   Deliberately NOT `NODE_ENV`: Railway previews run `NODE_ENV=production`, which is
 *   precisely the trap that once sent preview mail through Resend to real addresses.
 * - **An address was supplied.** `PREVIEW_ADMIN_EMAIL` is what names the account, and
 *   since #840 it is also the credential that opens it: the sign-in page mints a session
 *   for this one address instead of mailing a link. So an environment without it gets no
 *   account and no auto sign-in, rather than a guessable default anyone could type.
 *   Environments forked before the variable existed are out of scope
 *   (sydevs/SahajCloud#662) and keep whatever admin they were already seeded with.
 *
 * Fail-safe in the direction that matters: an unknown or misnamed environment yields
 * `false` and seeds nothing, so the failure mode is a preview without an admin — loud,
 * and caught by the smoke lane — never a write to production.
 */
export const shouldSeedPreviewAdmin = ({
  email,
  environmentName,
  isProduction,
}: PreviewAdminGateInput): boolean =>
  Boolean(environmentName) && !isProduction && Boolean(email)

/** The same question, asked of the live environment. */
export const shouldSeedPreviewAdminHere = (): boolean =>
  shouldSeedPreviewAdmin({
    email: serverEnv.PREVIEW_ADMIN_EMAIL,
    environmentName: railwayEnvironmentName(),
    isProduction: isProductionDeployment(),
  })
