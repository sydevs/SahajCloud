import type { Payload } from 'payload'

import type { ManagerRole } from '@/lib/notifications/managerRoles'
import type { DigestWatermarks, Manager } from '@/payload-types'

/**
 * `Managers.digestWatermarks`, never null: per role, per section key, the start
 * of the last run whose email carried that section.
 *
 * ⚠ **Per role AND per key.** One manager can hold three roles, and each gets
 * its own email at its own pace — a single mark per key would let the region
 * email's send suppress the program email's items.
 */
export function readWatermarks(
  manager: Pick<Manager, 'digestWatermarks'>,
): NonNullable<DigestWatermarks> {
  return manager.digestWatermarks ?? {}
}

export function watermarkFor(
  manager: Pick<Manager, 'digestWatermarks'>,
  role: ManagerRole,
  key: string,
): null | string {
  return readWatermarks(manager)[role]?.[key] ?? null
}

/**
 * Advance one role's marks, after that role's email has gone. Returns the whole
 * column as it now stands.
 *
 * ⚠ **The caller must keep its own copy of the manager in step, which is why
 * this returns the value rather than nothing.** One manager can hold three
 * roles, and the run sends their emails in a loop over one loaded document —
 * so a second role that merged into the document's *stale* column would write
 * its own marks over the first role's, and the first role's whole window would
 * be re-sent on the next run. This function cannot do that for its caller:
 * mutating the argument would persist nothing (`docs/rules/storage.md`), and
 * re-reading the row per role is a query per role for a value the caller is
 * holding.
 *
 * ⚠ **`payload.db.updateOne`, never `payload.update`.** This is bookkeeping on
 * somebody else's document: `update` would run the manager's own hooks and
 * validate the whole stored row, so an imported manager carrying legacy data
 * that fails a newer validator would have the digest run roll back on them —
 * the same reason the invitation queue writes this way
 * (`src/plugins/login/invitations.ts`).
 *
 * It also bypasses `access.update: () => false` on the column, which is
 * deliberate: that rule exists to stop a manager rewinding their own marks,
 * not to stop the job writing them.
 */
export async function advanceWatermarks(args: {
  keys: string[]
  manager: Pick<Manager, 'digestWatermarks' | 'id'>
  payload: Payload
  role: ManagerRole
  runStart: Date
}): Promise<NonNullable<DigestWatermarks>> {
  const { keys, manager, payload, role, runStart } = args
  const current = readWatermarks(manager)
  if (!keys.length) return current
  const at = runStart.toISOString()
  const next: NonNullable<DigestWatermarks> = {
    ...current,
    [role]: { ...(current[role] ?? {}), ...Object.fromEntries(keys.map((key) => [key, at])) },
  }
  await payload.db.updateOne({
    collection: 'managers',
    data: { digestWatermarks: next },
    id: manager.id,
    req: undefined,
  })
  return next
}
