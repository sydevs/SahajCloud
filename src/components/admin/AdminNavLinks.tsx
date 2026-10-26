'use client'

import { useProject } from '@/contexts/ProjectContext'
import type { ProjectSlug } from '@/payload-types'

import NavLink from './NavLink'

const LINKS = {
  dashboard: { href: '/admin', label: 'Dashboard' },
  analytics: { href: '/admin/analytics', label: 'Analytics' },
  map: { href: '/admin/map', label: 'Public Map', project: 'sahaj-atlas' },
} as const satisfies Record<string, { href: string; label: string; project?: ProjectSlug }>

/** The Atlas map's one name and address; the manager home's header links here too. */
export const PUBLIC_MAP_LINK = LINKS.map

/** Top-of-sidebar links. */
const AdminNavLinks = () => {
  const { currentProject } = useProject()
  const links = Object.entries(LINKS).filter(
    ([, link]) => !('project' in link) || link.project === currentProject,
  )

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 0.5)', width: '100%' }}>
      {links.map(([key, link]) => (
        <NavLink href={link.href} key={key} label={link.label} />
      ))}
    </div>
  )
}

export default AdminNavLinks
