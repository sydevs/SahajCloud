import type { ProjectSlug } from '@/payload-types'

import { getProjectsFromRoles } from './roles'

/**
 * What a project decision reads off a user — `req.user` on the server, or
 * `useAuth().user` in the browser. `managedEvents` is the join `Managers`
 * declares, which both reads carry.
 */
export type ProjectUser = {
  id?: number | string
  type?: string | null
  roles?: Parameters<typeof getProjectsFromRoles>[0]
  currentProject?: ProjectSlug | null
  managedEvents?: { docs?: unknown[] | null } | null
}

/**
 * The projects a manager may work in: their roles' projects, plus Sahaj Atlas
 * for anyone an event is assigned to — an assignee edits that event without
 * holding any role, and the Atlas home is where they find it.
 */
export function getManagerProjects(user: ProjectUser): ProjectSlug[] {
  const projects = getProjectsFromRoles(user.roles)
  if (user.managedEvents?.docs?.length && !projects.includes('sahaj-atlas')) {
    projects.push('sahaj-atlas')
  }
  return projects
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
