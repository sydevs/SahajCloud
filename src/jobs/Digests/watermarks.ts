import type { Payload } from 'payload'

import type { ManagerRole } from '@/lib/notifications/managerRoles'
import type { Manager } from '@/payload-types'

/**
 * `Managers.digestWatermarks`: per role, per section key, the start of the last
 * run whose email carried that section.
 *
 * ⚠ **Per role AND per key.** One manager can hold three roles, and each gets
 * its own email at its own pace — a single mark per key would let the region
 * email's send suppress the program email's items.
 */
export type DigestWatermarks = Partial<Record<ManagerRole, Record<string, string>>>

export function readWatermarks(manager: Pick<Manager, 'digestWatermarks'>): DigestWatermarks {
  const value = manager.digestWatermarks
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as DigestWatermarks
}

export function watermarkFor(
  manager: Pick<Manager, 'digestWatermarks'>,
  role: ManagerRole,
  key: string,
): null | string {
  const mark = readWatermarks(manager)[role]?.[key]
  return typeof mark === 'string' ? mark : null
}

/**
 * Advance one role's marks, after that role's email has gone.
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
}): Promise<void> {
  const { keys, manager, payload, role, runStart } = args
  if (!keys.length) return
  const current = readWatermarks(manager)
  const at = runStart.toISOString()
  await payload.db.updateOne({
    collection: 'managers',
    data: {
      digestWatermarks: {
        ...current,
        [role]: { ...(current[role] ?? {}), ...Object.fromEntries(keys.map((key) => [key, at])) },
      },
    },
    id: manager.id,
    req: undefined,
  })
}
