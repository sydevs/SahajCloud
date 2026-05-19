'use client'

import { Link } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'

const AnalyticsNavLink = () => {
  const pathname = usePathname()
  const isActive = pathname === '/admin/analytics'

  const label = (
    <>
      {isActive && <div className="nav__link-indicator" />}
      <span className="nav__link-label">Analytics</span>
    </>
  )

  if (isActive) {
    return <div className="nav__link">{label}</div>
  }

  return (
    <Link className="nav__link" href="/admin/analytics" prefetch={false}>
      {label}
    </Link>
  )
}

export default AnalyticsNavLink
