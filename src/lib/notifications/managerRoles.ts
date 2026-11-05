import type { Manager } from '@/payload-types'
import { virtualRoles } from '@/plugins/access/config'
import type { VirtualRoleUser } from '@/plugins/access/types'

/**
 * The three hats an Atlas manager can wear, in the order a reader meets them.
 *
 * Distinct from the role slugs the access layer grants, and deliberately so:
 * `admin` is a manager `type` rather than a role, and the two Atlas roles are
 * derived from listings. One manager can wear all three, and then gets three of
 * everything — three home sections, three digest emails — because each is a
 * different job done on a different day.
 */
export const MANAGER_ROLES = ['program', 'region', 'admin'] as const

export type ManagerRole = (typeof MANAGER_ROLES)[number]

/** What each role is called in a digest subject line. */
export const MANAGER_ROLE_LABELS: Record<ManagerRole, string> = {
  program: 'Your programs',
  region: 'Your regions',
  admin: 'Sahaj Atlas',
}

/** The shape every reader of {@link managerRoles} can supply. */
export type ManagerRoleUser = Partial<Pick<Manager, 'type'>> & VirtualRoleUser

/**
 * Which roles a manager holds.
 *
 * ⚠ **Read off the same joins `virtualRoles` reads**, never off a stored list:
 * being named on a region or an event *is* the role (`docs/rules/access.md`),
 * so anything keeping its own copy could disagree with the access layer about
 * what a manager is. `admin` comes from `type`, which no join carries.
 *
 * An admin also listed on a region holds both, in {@link MANAGER_ROLES} order.
 */
export function managerRoles(user: ManagerRoleUser | null | undefined): ManagerRole[] {
  if (!user) return []
  const derived = virtualRoles(user)
  const roles: ManagerRole[] = []
  if (derived.includes('atlas-event-manager')) roles.push('program')
  if (derived.includes('atlas-region-manager')) roles.push('region')
  if (user.type === 'admin') roles.push('admin')
  return roles
}
