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
  const urls = checkNoUrls(stringLeaves(proposed))
  return urls.ok ? null : urls.message
}

/**
 * Flatten a proposal into `{ 'address.street': 'see buy-now.example.com' }` —
 * the flat, dotted-path map `checkNoUrls` takes.
 *
 * ⚠ **This is what makes the scan reach a nested field at all, and it is the
 * whole point of the function.** `checkNoUrls` tests `typeof value === 'string'`
 * on the **top level** and looks no further, so handing it `proposed` raw would
 * screen `title` and `description` and wave through a link in `address.street`
 * or `schedule.notes`: `ok` on a patch that must be `content_rejected`. A
 * proposal is an Events field patch, and Events nests. The dotted key is also
 * what names the offending field in the reason the manager reads.
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
    // An empty string can hold no URL, so keeping it would spend the MAX_LEAVES
    // budget on values that cannot trip the scan and could crowd out one that
    // does.
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
