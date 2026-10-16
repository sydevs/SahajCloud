import type { FlattenedField } from 'payload'

/** The string leaves of a client-authored field patch, split by the check each owes. */
export interface ProposalLeaves {
  /** Free text that must hold no URL, keyed by dotted path. */
  urlScan: Record<string, string>
  /** Values sitting in a `type: 'email'` column, to judge as addresses. */
  emails: Record<string, string>
  /**
   * A bound stopped the walk, so these maps are a PREFIX of the patch's leaves
   * and a clean verdict on them says nothing about the rest.
   *
   * ⚠ **A caller must refuse a truncated patch, never accept it.** The bounds
   * exist against hostile input, so the input that trips one is the input most
   * likely to be hiding a link past it — 210 text nodes in `description` and a
   * link in `title` spends the leaf budget before `title` is reached. Silently
   * scanning a prefix is the same fail-open #948 closes, re-armed one layer
   * down.
   */
  truncated: boolean
}

/**
 * Flatten a client-authored field patch into `{ 'address.street': 'see buy-now.example.com' }`
 * — the flat, dotted-path maps `checkNoUrls` and `checkEmailAllowed` take — classifying
 * each leaf by the column it sits in, read off `fields`.
 *
 * ⚠ **Both anti-spam layers derive their scanned set from here, and that is the
 * whole point** (#948). The write guard refuses a link at create; the screening
 * job bins one it finds afterwards. A hand-listed path set in either place covers
 * a column added to the target collection only once somebody widens the list, so
 * a new free-text column was scanned by neither — a spam link in it earned a clean
 * 201 and then a terminal `spam` bin an hour later, with nothing told to the sender.
 *
 * ⚠ **Read the exemptions off the live config, never a list** (#920). `type:
 * 'email'` is Payload's own declaration, and `urlField` marks what it builds
 * `custom.holdsUrl` because a built URL column is indistinguishable from free
 * text. So a URL column added to the target collection is exempt the day it is added.
 *
 * ⚠ **This is what makes the scan reach a nested field at all.** `checkNoUrls`
 * tests `typeof value === 'string'` on the **top level** and looks no further, so
 * handing it the patch raw would screen `title` and `description` and wave through
 * a link in `address.street` or `schedule.notes`. A proposal is an Events field
 * patch, and Events nests. The dotted key is also what names the offending column
 * in the refusal a sender reads.
 *
 * ⚠ **`fields` descends with the data, and only a string leaf is ever exempt.**
 * The patch is submitter-controlled, so both halves are load-bearing. Resolving a
 * dotted path instead reaches a column the patch never nested under — payload's
 * `getFieldByPath` keeps the parent's field list past a segment that holds no
 * subfields, so `{ title: { website: 'visit cheap.shop' } }` resolved to the exempt
 * top-level `website`. Exempting a key rather than its string value hid every leaf
 * beneath it the same way. An unrecognised key therefore descends into nothing,
 * which exempts nothing.
 *
 * Bounded by depth and by count: the patch is public input, and a walker with
 * neither bound is a stack overflow and an unbounded allocation waiting for
 * somebody to post a deeply nested object. Both limits sit far above what a real
 * proposal reaches — the column's own schema caps it at 60 properties.
 *
 * `prefix` names the patch's own column, so a refusal names a path the sender
 * posted. It is required because this module knows no column of its own.
 */
export function proposalLeaves(
  value: unknown,
  fields: FlattenedField[],
  prefix: string,
): ProposalLeaves {
  const leaves: ProposalLeaves = { urlScan: {}, emails: {}, truncated: false }
  collect(value, fields, prefix, 0, leaves)
  return leaves
}

function collect(
  value: unknown,
  fields: FlattenedField[],
  prefix: string,
  depth: number,
  into: ProposalLeaves,
): void {
  if (value == null) return
  if (depth > MAX_DEPTH || count(into) >= MAX_LEAVES) {
    into.truncated = true
    return
  }

  if (typeof value === 'string') {
    // An empty string can hold no URL and is no address, so keeping it would
    // spend the MAX_LEAVES budget on values that cannot trip either check and
    // could crowd out one that does.
    if (value.trim() !== '') place(into, 'urlScan', prefix, value)
    return
  }

  if (Array.isArray(value)) {
    // An array field's own `flattenedFields` describe its rows, so the level
    // does not change here.
    value.forEach((item, index) => collect(item, fields, `${prefix}[${index}]`, depth + 1, into))
    return
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (count(into) >= MAX_LEAVES) {
        into.truncated = true
        break
      }
      const field = fields.find((candidate) => candidate.name === key)
      const path = prefix ? `${prefix}.${key}` : key

      if (typeof item === 'string') {
        if (field?.type === 'email') {
          if (item.trim() !== '') place(into, 'emails', path, item)
          continue
        }
        if (field?.custom?.holdsUrl === true) continue
      }

      const nested = field && 'flattenedFields' in field ? field.flattenedFields : []
      collect(item, nested, path, depth + 1, into)
    }
  }
}

/**
 * Record a leaf under a key nothing else holds.
 *
 * ⚠ **A dotted path is not unique, because a key may contain a dot.** The patch
 * is submitter-controlled, so `{ address: { 'street.note': <link>, street: {
 * note: 'ok' } } }` composes one path twice — and the later write discarded the
 * link outright. The walk this replaced suffixed a position instead and could
 * not collide.
 */
function place(
  into: ProposalLeaves,
  bucket: 'urlScan' | 'emails',
  key: string,
  value: string,
): void {
  let unique = key
  for (let index = 1; unique in into.urlScan || unique in into.emails; index += 1) {
    unique = `${key}#${index}`
  }
  into[bucket][unique] = value
}

function count(leaves: ProposalLeaves): number {
  return Object.keys(leaves.urlScan).length + Object.keys(leaves.emails).length
}

/**
 * ⚠ **Both bounds are sized for a Lexical tree, because tripping either is now
 * a refusal** — a bound a real proposal reaches refuses a real sender.
 * `description` nests `root → children → paragraph → children → text` before
 * any formatting, and a list or a quote adds two levels each. One formatted
 * paragraph banks about 11 string leaves, mostly Lexical's own `type`, `mode`
 * and `direction` keys: 200 refused a 20-paragraph description, 2000 clears
 * about 180.
 *
 * Exported so a spec sizes its fixtures off the bound instead of restating it.
 */
export const MAX_DEPTH = 20
export const MAX_LEAVES = 2000
