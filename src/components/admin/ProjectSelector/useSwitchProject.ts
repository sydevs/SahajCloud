'use client'

import { useRouteTransition } from '@payloadcms/ui'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'

import type { ProjectSlug } from '@/payload-types'

import { shouldRedirectToAdmin } from './utils'

/**
 * Save the user's current project, then re-render the route under it — the nav,
 * sidebar and dashboard are server-rendered from the stored value. Leaves for
 * `/admin` only when the open collection is hidden in the new project. Throws
 * when the save fails, so each caller reports it its own way.
 */
export function useSwitchProject(): (project: ProjectSlug | null) => Promise<void> {
  const { startRouteTransition } = useRouteTransition()
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(
    async (project) => {
      // Self-only endpoint, gated on no per-locale role, so it needs no `locale`.
      const response = await fetch('/api/managers/set-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentProject: project }),
      })
      if (!response.ok) throw new Error(`Failed to change project: ${response.statusText}`)
      startRouteTransition(() =>
        shouldRedirectToAdmin(pathname, project) ? router.push('/admin') : router.refresh(),
      )
    },
    [pathname, router, startRouteTransition],
  )
}
