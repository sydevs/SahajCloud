import type { ProjectSlug } from '@/payload-types'
import { getProjectsFromRoles } from '@/plugins/access/config'

type ProjectUser = {
  type?: string | null
  roles?: Parameters<typeof getProjectsFromRoles>[0]
  currentProject?: ProjectSlug | null
}

/**
 * The project a user works in, and whether it must be persisted first.
 *
 * An admin keeps any project, or `null` for All Content. A manager keeps one
 * their roles reach; with exactly one reachable project they are moved into it,
 * which `persist` marks — the server rendered this page under the stored value,
 * so the caller saves the project and re-renders. Otherwise `null` asks them to
 * choose.
 */
export function resolveProject(user: ProjectUser): {
  project: ProjectSlug | null
  persist: boolean
} {
  const current = user.currentProject ?? null
  if (user.type === 'admin') return { project: current, persist: false }

  const allowed = getProjectsFromRoles(user.roles)
  if (current && allowed.includes(current)) return { project: current, persist: false }
  if (allowed.length === 1) return { project: allowed[0]!, persist: true }
  return { project: null, persist: false }
}
