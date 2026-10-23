'use client'

import { useProject } from '@/contexts/ProjectContext'

import NavLink from './NavLink'

const LINKS = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard' },
  { key: 'analytics', href: '/admin/analytics', label: 'Analytics' },
  { key: 'map', href: '/admin/map', label: 'Public Map', project: 'sahaj-atlas' },
] as const

/** Top-of-sidebar links. */
const AdminNavLinks = () => {
  const { currentProject } = useProject()
  const links = LINKS.filter((link) => !('project' in link) || link.project === currentProject)

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 0.5)', width: '100%' }}>
      {links.map((link) => (
        <NavLink href={link.href} key={link.key} label={link.label} />
      ))}
    </div>
  )
}

export default AdminNavLinks
