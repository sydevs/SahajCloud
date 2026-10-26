import type { ProjectSlug } from '@/payload-types'

/**
 * The sidebar's top links. Kept out of the `'use client'` `AdminNavLinks`, whose
 * exports reach a server component only as client references, so the server
 * Atlas homes can read `PUBLIC_MAP_LINK` as a value.
 */
export const NAV_LINKS = {
  dashboard: { href: '/admin', label: 'Dashboard' },
  analytics: { href: '/admin/analytics', label: 'Analytics' },
  map: { href: '/admin/map', label: 'Public Map', project: 'sahaj-atlas' },
} as const satisfies Record<string, { href: string; label: string; project?: ProjectSlug }>

/** The Atlas map's one name and address; both Atlas homes link here too. */
export const PUBLIC_MAP_LINK = NAV_LINKS.map
