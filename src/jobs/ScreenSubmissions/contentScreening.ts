import type { FlattenedField } from 'payload'

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
 * `eventFields` is Events' own `flattenedFields`, which is what decides the
 * exemption below. Returns `null` when the content is acceptable, or the reason
 * it was not.
 */
export function screenProposalContent(
  proposed: unknown,
  eventFields: FlattenedField[],
): string | null {
  const urls = checkNoUrls(stringLeaves(proposed, urlExemptProposalPaths(eventFields)))
  return urls.ok ? null : urls.message
}

/**
 * The dotted paths inside `proposed` whose Events column exists to hold an
 * address or a link, so a URL in one is the field working rather than spam.
 *
 * ⚠ **Derived from the live Events config, never restated** (#920). `type:
 * 'email'` is Payload's own declaration and `urlField` marks what it builds
 * `custom.holdsUrl`, so an Events URL column added tomorrow is exempt tomorrow.
 * A list here would instead bin every proposal that named the new field, and
 * bin it terminally: the row becomes `status: 'spam'`, nothing re-screens it,
 * and the submitter is told nothing. The write guard states this same exemption
 * by omitting `contactEmail`, `website` and `onlineUrl` from `urlScanFields`,
 * and this walk contradicted the policy it mirrors.
 */
export function urlExemptProposalPaths(fields: FlattenedField[], prefix = ''): Set<string> {
  const paths = new Set<string>()

  for (const field of fields) {
    if (!('name' in field) || typeof field.name !== 'string') continue
    const path = prefix ? `${prefix}.${field.name}` : field.name

    if (field.type === 'email' || field.custom?.holdsUrl === true) {
      paths.add(path)
      continue
    }

    if ('flattenedFields' in field) {
      for (const nested of urlExemptProposalPaths(field.flattenedFields, path)) paths.add(nested)
    }
  }

  return paths
}

/**
 * Flatten a proposal into `{ 'address.street': 'see buy-now.example.com' }` —
 * the flat, dotted-path map `checkNoUrls` takes — leaving out the `exempt`
 * paths entirely.
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
function stringLeaves(
  value: unknown,
  exempt: Set<string>,
  prefix = '',
  depth = 0,
): Record<string, string> {
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
      Object.assign(leaves, stringLeaves(item, exempt, `${prefix}[${index}]`, depth + 1))
    })
    return leaves
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (Object.keys(leaves).length >= MAX_LEAVES) break
      const path = prefix ? `${prefix}.${key}` : key
      // An exempt path names a column, so an array leaf's row index comes off
      // first: `exclusions[0].start` is the `exclusions.start` column.
      if (exempt.has(path.replace(/\[\d+\]/g, ''))) continue
      Object.assign(leaves, stringLeaves(item, exempt, path, depth + 1))
    }
  }

  return leaves
}

const MAX_DEPTH = 6
const MAX_LEAVES = 200
