import { checkNoUrls } from '@/lib/antiSpam/antiSpamGuard'

/**
 * The extra content check a **proposal** gets, beyond the base every type runs.
 *
 * A proposal is the one intake that carries a structured patch of real Events
 * fields rather than an answer to a question somebody authored. The create-time
 * URL scan does not see inside it: `prepareUserSubmission` scans
 * `submissionData`, and `proposed` is a separate column with its own validator.
 * So a submitter refused a link in their note can still put one in the title,
 * description or address of the event they are proposing — and that text is
 * what a manager reads in the review email and what Phase 3 would copy onto a
 * published listing.
 *
 * ⚠ **This runs at screening, not at create, on purpose.** Refusing the create
 * would tell a spammer which field tripped, one field at a time. Refusing after
 * the fact records the attempt with the offending value intact, which is what
 * makes a sender's history worth counting.
 *
 * Returns `null` when the content is acceptable, or the reason it was not.
 */
export function screenProposalContent(proposed: unknown): string | null {
  const leaves = stringLeaves(proposed)
  if (Object.keys(leaves).length === 0) return null

  const urls = checkNoUrls(leaves)
  return urls.ok ? null : urls.message
}

/**
 * Every string in a nested structure, keyed by its dotted path — the shape
 * `checkNoUrls` takes, so the reason it gives names the offending field.
 *
 * Bounded by depth and by count: `proposed` is public input, and a walker with
 * neither bound is a stack overflow and an unbounded allocation waiting for
 * somebody to post a deeply nested object. Both limits sit far above what a
 * real proposal reaches — the column's own schema caps it at 60 properties.
 */
function stringLeaves(value: unknown, prefix = '', depth = 0): Record<string, string> {
  const leaves: Record<string, string> = {}
  if (depth > MAX_DEPTH || value == null) return leaves

  if (typeof value === 'string') {
    if (value.trim() !== '') leaves[prefix || 'proposed'] = value
    return leaves
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      Object.assign(leaves, stringLeaves(item, `${prefix}[${index}]`, depth + 1))
    })
    return leaves
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (Object.keys(leaves).length >= MAX_LEAVES) break
      Object.assign(leaves, stringLeaves(item, prefix ? `${prefix}.${key}` : key, depth + 1))
    }
  }

  return leaves
}

const MAX_DEPTH = 6
const MAX_LEAVES = 200
