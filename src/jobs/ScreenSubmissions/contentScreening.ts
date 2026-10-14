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

  const urls = checkNoUrls(stringLeaves(proposed, eventFields))
  return urls.ok ? null : urls.message
}

/**
 * Whether the Events column a leaf sits in exists to hold an address or a link,
 * so a URL there is the field working rather than spam.
 *
 * ⚠ **Read off the live Events config, never listed here** (#920). `type:
 * 'email'` is Payload's own declaration, and `urlField` marks what it builds
 * `custom.holdsUrl` because a built URL column is indistinguishable from free
 * text. So a URL column added to Events is exempt the day it is added, where a
 * list would bin every proposal naming the new one — and bin it terminally: the
 * row becomes `status: 'spam'`, nothing re-screens it, and neither the submitter
 * nor the manager learns which field refused. The write guard states the same
 * exemption by omitting the dedicated email and URL columns from its
 * `urlScanFields` (`@/plugins/writeGuard/policies`).
 */
function holdsAddressOrLink(field: FlattenedField | undefined): boolean {
  return field?.type === 'email' || field?.custom?.holdsUrl === true
}

/**
 * Flatten a proposal into `{ 'address.street': 'see buy-now.example.com' }` —
 * the flat, dotted-path map `checkNoUrls` takes — skipping the columns above.
 *
 * ⚠ **This is what makes the scan reach a nested field at all, and it is the
 * whole point of the function.** `checkNoUrls` tests `typeof value === 'string'`
 * on the **top level** and looks no further, so handing it `proposed` raw would
 * screen `title` and `description` and wave through a link in `address.street`
 * or `schedule.notes`: `ok` on a patch that must be `content_rejected`. A
 * proposal is an Events field patch, and Events nests. The dotted key is also
 * what names the offending field in the reason the manager reads.
 *
 * ⚠ **`fields` descends with the data, and only a string leaf is ever exempt.**
 * `proposed` is submitter-controlled, so both halves are load-bearing. Resolving
 * a dotted path instead reaches a column the patch never nested under — payload's
 * `getFieldByPath` keeps the parent's field list past a segment that holds no
 * subfields, so `{ title: { website: 'visit cheap.shop' } }` resolved to the
 * exempt top-level `website`. Exempting a key rather than its string value hid
 * every leaf beneath it the same way. An unrecognised key therefore descends
 * into nothing, which exempts nothing.
 *
 * Bounded by depth and by count: `proposed` is public input, and a walker with
 * neither bound is a stack overflow and an unbounded allocation waiting for
 * somebody to post a deeply nested object. Both limits sit far above what a
 * real proposal reaches — the column's own schema caps it at 60 properties.
 */
function stringLeaves(
  value: unknown,
  fields: FlattenedField[],
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
    // An array field's own `flattenedFields` describe its rows, so the level
    // does not change here.
    value.forEach((item, index) => {
      Object.assign(leaves, stringLeaves(item, fields, `${prefix}[${index}]`, depth + 1))
    })
    return leaves
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (Object.keys(leaves).length >= MAX_LEAVES) break
      const field = fields.find((candidate) => candidate.name === key)
      if (typeof item === 'string' && holdsAddressOrLink(field)) continue
      const path = prefix ? `${prefix}.${key}` : key
      const nested = field && 'flattenedFields' in field ? field.flattenedFields : []
      Object.assign(leaves, stringLeaves(item, nested, path, depth + 1))
    }
  }

  return leaves
}

const MAX_DEPTH = 6
const MAX_LEAVES = 200
