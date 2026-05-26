'use client'

import { Link } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'

interface NavLinkProps {
  href: string
  label: string
}

const NavLink = ({ href, label }: NavLinkProps) => {
  const pathname = usePathname()
  const isActive = pathname === href

  const content = (
    <>
      {isActive && <div className="nav__link-indicator" />}
      <span className="nav__link-label">{label}</span>
    </>
  )

  if (isActive) {
    return <div className="nav__link">{content}</div>
  }

  return (
    <Link className="nav__link" href={href} prefetch={false}>
      {content}
    </Link>
  )
}

export default NavLink
