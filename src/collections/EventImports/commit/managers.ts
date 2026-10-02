/**
 * The coordinators a batch names, reduced to one request per account.
 *
 * ⚠ **Keyed on the lowercased address, because Payload is.** An auth collection
 * lowercases `email` on write, so a CSV naming `Anna@x.org` on one line and
 * `anna@x.org` on another is one coordinator — and matching case-sensitively
 * would find neither on the second pass and try to create a duplicate the unique
 * index then refuses, mid-commit.
 *
 * ⚠ **Nothing here decides whether the address is usable.** `Managers` owns the
 * email validator, and the commit reports its refusal against the lines below —
 * a second copy here would answer differently the first time either changes
 * (`resolve/resolveRow.ts` draws the same line).
 */

/** One coordinator the commit has to match or create. */
export interface ManagerRequest {
  /** Lowercased, which is both the lookup key and what gets written. */
  email: string
  /**
   * What a new account is named.
   *
   * ⚠ **The local part is the fallback, not a blank.** `Managers.name` is
   * required, so a row giving an email and no `managerName` would otherwise fail
   * its write and lose the class that named it.
   */
  name: string
  /** The CSV lines that named this coordinator, so a refusal says which. */
  lines: number[]
}

/** A row reduced to what the roster reads. */
export interface RosterRow {
  line: number
  values: { managerEmail?: string; managerName?: string }
}

/**
 * Every coordinator the committable rows name, in first-seen order.
 *
 * ⚠ **The first non-empty `managerName` wins, and a later one is not an error.**
 * Two rows spelling one coordinator's name differently is a typo, not a
 * conflict, and refusing the batch over it would cost a volunteer a re-upload
 * for something no seeker ever sees.
 */
export function managerRoster(rows: readonly RosterRow[]): ManagerRequest[] {
  const byEmail = new Map<string, ManagerRequest>()
  for (const { line, values } of rows) {
    const email = values.managerEmail?.trim().toLowerCase()
    if (!email) continue
    const existing = byEmail.get(email)
    if (existing) {
      existing.lines.push(line)
      continue
    }
    byEmail.set(email, { email, name: managerNameFor(values.managerName, email), lines: [line] })
  }
  return [...byEmail.values()]
}

function managerNameFor(name: string | undefined, email: string): string {
  return name?.trim() || (email.split('@')[0] ?? email)
}

/** The roster key for one row, so the commit can look its coordinator up. */
export function managerKeyOf(values: { managerEmail?: string }): string | null {
  return values.managerEmail?.trim().toLowerCase() || null
}
