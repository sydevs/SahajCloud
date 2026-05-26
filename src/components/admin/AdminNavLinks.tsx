'use client'

import NavLink from './NavLink'

const AdminNavLinks = () => (
  <div style={{ marginBottom: 'calc(var(--base) * 0.5)', width: '100%' }}>
    <NavLink href="/admin" label="Dashboard" />
    <NavLink href="/admin/analytics" label="Analytics" />
  </div>
)

export default AdminNavLinks
