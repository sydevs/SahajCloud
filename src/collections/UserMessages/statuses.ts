/**
 * The user-message workflow's vocabulary, in a leaf module.
 *
 * `screening` → the async ScreenUserMessages job is (or will be) checking the
 * sender's address and their recent history; the rest are terminal and double
 * as the outcome record: `delivered` (the admin email went out — purged after a
 * short window), `spam` (kept for abuse tracking, never delivered), `failed`
 * (screening passed but the mail transport refused it; kept until somebody
 * looks, because an undelivered message is the one state nobody else will
 * notice).
 *
 * Separate from `UserMessages.ts` because the admin status banner needs these
 * too, and that file imports the hooks and `serverEnv` — importing it from a
 * client component would pull all of that into the admin bundle (the hazard
 * `src/AGENTS.md` warns about). This module imports
 * nothing, so both sides share one definition instead of restating the union as
 * string literals.
 */

export const USER_MESSAGE_STATUSES = ['screening', 'delivered', 'spam', 'failed'] as const

export type MessageStatus = (typeof USER_MESSAGE_STATUSES)[number]

/**
 * Statuses the screening job may still act on. `failed` is in here deliberately:
 * a retry re-enters the handler and re-attempts the send, so the row is not
 * terminal in the way `spam` and `delivered` are — it is "not delivered yet, and
 * we know why".
 */
export const SCREENABLE_STATUSES: readonly MessageStatus[] = ['screening', 'failed']

/**
 * What each status is *called*, everywhere an admin meets it: the list column,
 * the `status` select, and the heading of the banner
 * (`UserMessageStatus`), which adds the sentence saying what to do about it). One definition, because
 * a row reading "Delivered" that opens onto a banner headed "Sent" makes a
 * reader stop and wonder whether they are two different things.
 */
export const STATUS_LABELS: Record<MessageStatus, string> = {
  screening: 'Checking',
  delivered: 'Delivered',
  spam: 'Marked Spam',
  failed: 'Delivery Failed',
}
