import type { FlattenedField } from 'payload'

import { checkNoUrls } from '@/lib/antiSpam/antiSpamGuard'
import { proposalLeaves } from '@/lib/antiSpam/proposalLeaves'

/**
 * The extra content check a **proposal** gets, beyond the base every type runs.
 *
 * A proposal is the one intake that carries a structured patch of real Events
 * fields rather than an answer to a question somebody authored.
 *
 * ⚠ **This is the second reader of the same derivation, not a second rule.**
 * The write guard runs `proposalLeaves` over the same patch at create and
 * refuses a link there (#948), so this job sees one only in a row written before
 * the guard could judge it — a column whose exemption changed, or a write that
 * skipped the guard. Refusing after the fact records the attempt with the
 * offending value intact, which is what makes a sender's history worth counting.
 *
 * Returns `null` when the content is acceptable, or the reason it was not.
 */
export function screenProposalContent(
  proposed: unknown,
  eventFields: FlattenedField[],
): string | null {
  // No Events config to read the exemption off — a bare test harness. Pass, the
  // way `validateProposal` does, rather than refusing every submission: without
  // the config the only verdict this scan can reach is the destructive one.
  if (eventFields.length === 0) return null

  const urls = checkNoUrls(proposalLeaves(proposed, eventFields, 'proposed').urlScan)
  return urls.ok ? null : urls.message
}
