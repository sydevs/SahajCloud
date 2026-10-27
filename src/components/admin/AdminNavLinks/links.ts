import type { ProjectSlug } from '@/payload-types'

/**
 * The sidebar's top links, and the one name and address of each — the Atlas
 * dashboards link to `NAV_LINKS.map` too. Not in the `'use client'` index: a
 * server component would read that module's exports only as client references.
 */
export const NAV_LINKS = {
  dashboard: { href: '/admin', label: 'Dashboard' },
  analytics: { href: '/admin/analytics', label: 'Analytics' },
  map: { href: '/admin/map', label: 'Public Map', project: 'sahaj-atlas' },
} as const satisfies Record<string, { href: string; label: string; project?: ProjectSlug }>
