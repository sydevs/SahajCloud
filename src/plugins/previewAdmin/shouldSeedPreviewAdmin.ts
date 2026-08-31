import { serverEnv } from '@/lib/env'
import { isProductionDeployment, railwayEnvironmentName } from '@/plugins/storage/previewIsolation'

/**
 * Inputs the gate reads. Passed in rather than read from `process.env` here, so the
 * predicate is a pure function the unit lane can drive through every combination.
 */
export type PreviewAdminGateInput = {
  /** Railway's environment name, or `undefined` off-Railway (local, CI, test). */
  environmentName: string | undefined
  /** True only on the canonical production environment. */
  isProduction: boolean
  /** `PREVIEW_ADMIN_PASSWORD`, absent everywhere it is not deliberately supplied. */
  password: string | undefined
}

/**
 * Whether this boot should reconcile the preview admin.
 *
 * Three conditions, and each excludes a place this must never run:
 *
 * - **On Railway at all.** `environmentName` is `undefined` for local dev, CI and the
 *   test lanes, so `onInit` there is a no-op no matter what else is set. That matters
 *   because CI *does* hold `PREVIEW_ADMIN_PASSWORD` as a secret, and a gate that read
 *   only the password would write an admin into the integration lane's database.
 * - **Not production.** Read from `isProductionDeployment()`, the same Railway
 *   environment-name check the email adapter and the storage guard already make.
 *   Deliberately NOT `NODE_ENV`: Railway previews run `NODE_ENV=production`, which is
 *   precisely the trap that once sent preview mail through Resend to real addresses.
 * - **A password was supplied.** Environments forked before 2026-08-27 do not receive
 *   `PREVIEW_ADMIN_PASSWORD` and are explicitly out of scope (sydevs/SahajCloud#662);
 *   they keep whatever admin they were already seeded with rather than being reconciled
 *   against a value that isn't there.
 *
 * Fail-safe in the direction that matters: an unknown or misnamed environment yields
 * `false` and seeds nothing, so the failure mode is a preview without an admin — loud,
 * and caught by the smoke lane — never a write to production.
 */
export const shouldSeedPreviewAdmin = ({
  environmentName,
  isProduction,
  password,
}: PreviewAdminGateInput): boolean =>
  Boolean(environmentName) && !isProduction && Boolean(password)

/** The same question, asked of the live environment. */
export const shouldSeedPreviewAdminHere = (): boolean =>
  shouldSeedPreviewAdmin({
    environmentName: railwayEnvironmentName(),
    isProduction: isProductionDeployment(),
    password: serverEnv.PREVIEW_ADMIN_PASSWORD,
  })
