/**
 * The managers an import names in `managerEmail`, matched to `managers` by
 * email or created.
 *
 * A created account has `type: manager` and no roles; the login plugin's
 * `queueOnManagerField` invites them the moment a class names them as its
 * manager, so nothing here sends mail.
 *
 * ⚠ **Keyed on the lowercased address, because Payload is.** An auth collection
 * lowercases `email` on write, so a CSV naming `Anna@x.org` on one row and
 * `anna@x.org` on another is one manager — and matching case-sensitively would
 * find neither on the second pass and try to create a duplicate the unique
 * index then refuses, mid-import.
 *
 * ⚠ **Nothing here decides whether the address is usable.** `Managers` owns the
 * email validator, and the import reports its refusal against the rows that
 * named the address — a second copy here would answer differently the first
 * time either changes.
 */

import type { PayloadRequest } from 'payload'

import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { Manager } from '@/payload-types'

/** One manager the import has to match or create. */
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
  /** The CSV rows that named this manager, so a refusal says which. */
  lines: number[]
}

/** A row reduced to what the roster reads. */
export interface RosterRow {
  line: number
  values: { managerEmail?: string; managerName?: string }
}

/**
 * Every manager the rows name, in first-seen order.
 *
 * ⚠ **The first non-empty `managerName` wins, and a later one is not an error.**
 * Two rows spelling one manager's name differently is a typo, not a conflict,
 * and refusing the import over it would cost a volunteer a re-upload for
 * something no seeker ever sees.
 */
export function managerRoster(rows: readonly RosterRow[]): ManagerRequest[] {
  const byEmail = new Map<string, ManagerRequest>()
  for (const { line, values } of rows) {
    const email = managerKeyOf(values)
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

/** The roster key for one row, so the import can look its manager up. */
export function managerKeyOf(values: { managerEmail?: string }): string | null {
  return values.managerEmail?.trim().toLowerCase() || null
}

export interface ImportManagers {
  /** Manager id by lower-cased email. */
  ids: Map<string, number>
  /** Why an email got no account, by lower-cased email. */
  failures: Map<string, string>
}

/** Find each requested manager by email, creating the ones that do not exist. */
export async function ensureManagers(
  req: PayloadRequest,
  roster: readonly ManagerRequest[],
): Promise<ImportManagers> {
  const ids = new Map<string, number>()
  const failures = new Map<string, string>()
  if (!roster.length) return { ids, failures }

  const existing = await managersByEmail(
    req,
    roster.map((request) => request.email),
  )

  for (const request of roster) {
    const match = existing.get(request.email)
    if (match !== undefined) {
      ids.set(request.email, match)
      continue
    }
    try {
      const manager = await req.payload.create({
        collection: 'managers',
        data: { name: request.name, email: request.email, type: 'manager', roles: null } as never,
        overrideAccess: true,
        depth: 0,
        select: { email: true },
        req,
      })
      ids.set(request.email, manager.id)
    } catch (error) {
      const fields = validationFieldErrors(error)
      if (!fields) throw error
      failures.set(
        request.email,
        `no account could be opened for ${request.email} (${describeValidationErrors(fields).join('; ')})`,
      )
    }
  }
  return { ids, failures }
}

async function managersByEmail(
  req: PayloadRequest,
  emails: readonly string[],
): Promise<Map<string, number>> {
  const { docs } = await req.payload.find({
    collection: 'managers',
    where: { email: { in: [...emails] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { email: true },
    req,
  })
  return new Map(
    (docs as Manager[]).flatMap((manager) =>
      manager.email ? [[manager.email.toLowerCase(), manager.id] as const] : [],
    ),
  )
}
