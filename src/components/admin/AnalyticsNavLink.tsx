'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const AnalyticsNavLink = () => {
  const pathname = usePathname()
  const isActive = pathname === '/admin/analytics'

  return (
    <div
      style={{
        paddingBottom: 'calc(var(--base) * 0.4)',
        width: '100%',
      }}
    >
      <Link
        href="/admin/analytics"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--base) * 0.6)',
          padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.8)',
          borderRadius: 'var(--style-radius-s)',
          fontSize: 'calc(var(--base-body-size) * 1px)',
          fontWeight: isActive ? '600' : '400',
          color: isActive ? 'var(--theme-elevation-900)' : 'var(--theme-elevation-600)',
          background: isActive ? 'var(--theme-elevation-100)' : 'transparent',
          textDecoration: 'none',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        Analytics
      </Link>
    </div>
  )
}

export default AnalyticsNavLink
