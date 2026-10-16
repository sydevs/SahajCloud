import type { FlattenedField } from 'payload'

import { checkNoUrls } from '@/lib/antiSpam/antiSpamGuard'
import { proposalLeaves } from '@/lib/antiSpam/proposalLeaves'

/**
 * The extra content check a **proposal** gets, beyond the base every type runs.
 *
 * A proposal is the one intake that carries a structured patch of real Events
 * fields rather than an answer to a question somebody authored.
 *
 * ⚠ **This is the second reader of the same derivation, not a second rule**
 * (#948). The write guard refuses a link at create, so a row reaching here is
 * one it could not judge — a column whose exemption changed, or a write that
 * skipped the guard. Refusing after the fact keeps the attempt with its value
 * intact, which is what makes a sender's history worth counting.
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
