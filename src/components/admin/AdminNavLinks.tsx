'use client'

import { useProject } from '@/contexts/ProjectContext'

import { NAV_LINKS } from './helpers/navLinks'
import NavLink from './NavLink'

/** Top-of-sidebar links. */
const AdminNavLinks = () => {
  const { currentProject } = useProject()
  const links = Object.entries(NAV_LINKS).filter(
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
