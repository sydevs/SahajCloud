import type { Manager } from '@/payload-types'
import { virtualRoles } from '@/plugins/access/config'
import type { VirtualRoleUser } from '@/plugins/access/types'

/**
 * The three hats an Atlas manager can wear — not access role slugs: `admin` is
 * a manager `type`, and the other two derive from listings.
 */
export type ManagerRole = 'admin' | 'program' | 'region'

/**
 * Which roles a manager holds, in the order a reader meets them.
 *
 * ⚠ **Read off the same joins `virtualRoles` reads**, never a stored list, so
 * this cannot disagree with the access layer (`docs/rules/access.md`).
 */
export function managerRoles(
  user: (Partial<Pick<Manager, 'type'>> & VirtualRoleUser) | null | undefined,
): ManagerRole[] {
  if (!user) return []
  const derived = virtualRoles(user)
  const roles: ManagerRole[] = []
  if (derived.includes('atlas-event-manager')) roles.push('program')
  if (derived.includes('atlas-region-manager')) roles.push('region')
  if (user.type === 'admin') roles.push('admin')
  return roles
}
