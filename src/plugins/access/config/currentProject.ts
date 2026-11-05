import type { VirtualRoleUser } from '../types'

import type { ProjectSlug } from '@/payload-types'

import { getProjectsFromRoles, virtualRoles } from './roles'

/**
 * What a project decision reads off a user — `req.user` on the server, or
 * `useAuth().user` in the browser. The joins come from {@link VirtualRoleUser},
 * since the projects they reach are the ones their derived roles name.
 */
export type ProjectUser = VirtualRoleUser & {
  id?: number | string
  type?: string | null
  roles?: Parameters<typeof getProjectsFromRoles>[0]
  currentProject?: ProjectSlug | null
}

/**
 * The projects a manager may work in: the projects of their stored roles, plus
 * the projects of the roles their listings derive — Sahaj Atlas for anyone a
 * region or an event is assigned to, and We Meditate Web for anyone listed on
 * a page, neither of whom needs a stored role to edit it.
 */
export function getManagerProjects(user: ProjectUser): ProjectSlug[] {
  return [
    ...new Set([...getProjectsFromRoles(user.roles), ...getProjectsFromRoles(virtualRoles(user))]),
  ]
}

/**
 * The project a user works in, and whether it must be saved first.
 *
 * An admin keeps any project, or `null` for All Content. A manager keeps a
 * stored project only while they can still reach it; with exactly one
 * reachable project they are moved into it, which `persist` marks — the page
 * was rendered under the stored value, so the browser saves the project and
 * re-renders. Otherwise `null` asks them to choose. The server reads the same
 * answer, so it never renders a project the browser would refuse.
 */
export function resolveProject(user: ProjectUser): {
  project: ProjectSlug | null
  persist: boolean
} {
  const current = user.currentProject ?? null
  if (user.type === 'admin') return { project: current, persist: false }

  const allowed = getManagerProjects(user)
  if (current && allowed.includes(current)) return { project: current, persist: false }
  if (allowed.length === 1) return { project: allowed[0]!, persist: true }
  return { project: null, persist: false }
}
