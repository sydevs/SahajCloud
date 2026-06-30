'use client'

import { Hamburger, useNav } from '@payloadcms/ui'
import React from 'react'

const baseClass = 'nav'

/**
 * Reproduces Payload's nav chrome — the `<aside>` that slides open/closed with
 * nav state plus the mobile close button — since those pieces (`NavWrapper`,
 * `NavHamburger`) are internal to `@payloadcms/next` and not exported. The
 * Atlas sidebar content is passed as `children`; the logo header and account
 * footer live in the surrounding `AppHeader`, which the Nav override leaves
 * untouched.
 */
export function AtlasNavShell({ children }: { children: React.ReactNode }) {
  const { hydrated, navOpen, navRef, setNavOpen, shouldAnimate } = useNav()
  const classes = [
    baseClass,
    navOpen && `${baseClass}--nav-open`,
    shouldAnimate && `${baseClass}--nav-animate`,
    hydrated && `${baseClass}--nav-hydrated`,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <aside className={classes} inert={!navOpen ? true : undefined}>
      <div className={`${baseClass}__scroll`} ref={navRef}>
        {children}
        <div className={`${baseClass}__header`}>
          <div className={`${baseClass}__header-content`}>
            <button
              className={`${baseClass}__mobile-close`}
              onClick={() => setNavOpen(false)}
              tabIndex={!navOpen ? -1 : undefined}
              type="button"
            >
              <Hamburger isActive />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
