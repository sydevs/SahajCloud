/**
 * The `communityFeedback` namespace inside an Event's `systemMeta` JSON —
 * registrant confirm/deny vote tallies for an unverified listing. Written by
 * the Registrations vote-sync hook (alongside the indexed `confidenceScore`
 * column, which stays a real column because the feeds sort on it); read by the
 * admin verification notice.
 */
export interface CommunityFeedback {
  /** Registrants who confirmed the event exists. */
  confirmations: number
  /** Registrants who denied it. */
  denials: number
  /** ISO timestamp of the last vote applied. */
  updatedAt: string
}

/**
 * Safely read `communityFeedback` off a raw `systemMeta` value (a JSON field —
 * anything at runtime). Returns null when absent or malformed.
 */
export function readCommunityFeedback(systemMeta: unknown): CommunityFeedback | null {
  if (!systemMeta || typeof systemMeta !== 'object') return null
  const feedback = (systemMeta as { communityFeedback?: unknown }).communityFeedback
  if (!feedback || typeof feedback !== 'object') return null
  const { confirmations, denials, updatedAt } = feedback as Record<string, unknown>
  if (typeof confirmations !== 'number' || typeof denials !== 'number') return null
  return {
    confirmations,
    denials,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
  }
}
