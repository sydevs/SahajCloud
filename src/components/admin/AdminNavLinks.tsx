'use client'

import NavLink from './NavLink'

const LINKS = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard' },
  { key: 'analytics', href: '/admin/analytics', label: 'Analytics' },
] as const

export type AdminNavLinkKey = (typeof LINKS)[number]['key']

/** Top-of-sidebar links. Pass `disabled` to hide specific links (e.g. the Atlas sidebar hides the dashboard). */
const AdminNavLinks = ({ disabled = [] }: { disabled?: AdminNavLinkKey[] }) => (
  <div style={{ marginBottom: 'calc(var(--base) * 0.5)', width: '100%' }}>
    {LINKS.filter((link) => !disabled.includes(link.key)).map((link) => (
      <NavLink href={link.href} key={link.key} label={link.label} />
    ))}
  </div>
)

export default AdminNavLinks
