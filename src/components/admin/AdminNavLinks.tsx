'use client'

import { useProject } from '@/contexts/ProjectContext'

import NavLink from './NavLink'

const LINKS = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard' },
  { key: 'analytics', href: '/admin/analytics', label: 'Analytics' },
  // `project`-scoped links only show while that project is selected.
  { key: 'atlasMap', href: '/admin/atlas-map', label: 'Atlas Map', project: 'sahaj-atlas' },
] as const

export type AdminNavLinkKey = (typeof LINKS)[number]['key']

/** Top-of-sidebar links. Pass `disabled` to hide specific links (e.g. the Atlas sidebar hides the dashboard). */
const AdminNavLinks = ({ disabled = [] }: { disabled?: AdminNavLinkKey[] }) => {
  const { currentProject } = useProject()
  const links = LINKS.filter((link) => {
    if (disabled.includes(link.key)) return false
    if ('project' in link && link.project !== currentProject) return false
    return true
  })

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 0.5)', width: '100%' }}>
      {links.map((link) => (
        <NavLink href={link.href} key={link.key} label={link.label} />
      ))}
    </div>
  )
}

export default AdminNavLinks
