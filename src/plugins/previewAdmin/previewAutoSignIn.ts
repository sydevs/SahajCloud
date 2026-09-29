import { previewAdminEmail } from './seedPreviewAdmin'
import { shouldSeedPreviewAdminHere } from './shouldSeedPreviewAdmin'

/**
 * The one address `loginPlugin` should sign in without mailing, or `undefined`
 * where no address may do that.
 *
 * ⚠ **The same gate that provisions the account.** `PREVIEW_ADMIN_EMAIL` is set
 * only on a Railway preview, so anywhere the gate says no — production, CI,
 * local dev, a preview without the variable — no address is auto-signed-in and
 * every caller is mailed a link.
 *
 * ⚠ **The address is the credential now, so it must not be guessable.** Anyone
 * who opens a preview and types it becomes its admin, and preview hosts are
 * enumerable. Set it to a non-guessable local part.
 *
 * ⚠ **Read once, by the composition root.** `src/payload.config.ts` and the test
 * harness both call this when they construct the plugin. `loginPlugin` itself
 * knows nothing about Railway, and a per-request read would turn the gate into a
 * branch inside the handler.
 */
export const previewAutoSignInEmail = (): string | undefined => {
  const email = previewAdminEmail()
  if (!shouldSeedPreviewAdminHere() || !email) return undefined
  // Normalised to the STORED spelling: Payload's `email` base field lowercases
  // and trims on every write, so a capital in the variable would match no row.
  return email.trim().toLowerCase()
}
