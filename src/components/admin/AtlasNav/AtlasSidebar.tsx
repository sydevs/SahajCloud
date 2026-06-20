import type { ServerProps, TypedLocale } from 'payload'

import { Logout } from '@payloadcms/ui'
import React from 'react'


import AdminNavLinks from '@/components/admin/AdminNavLinks'
import ProjectSelector from '@/components/admin/ProjectSelector'
import { getAtlasSidebarData } from '@/lib/atlasSidebar/getAtlasSidebarData'
import type { Manager } from '@/payload-types'

import { AtlasNavShell } from './AtlasNavShell'
import { EventList } from './EventList'
import { RegionTree } from './RegionTree'

/**
 * The Atlas manager's sidebar: their events (bucketed by verification stage)
 * and their owned-region tree (with subtree counts), in place of Payload's
 * default collection nav. A server component with direct cached Payload access
 * — no internal HTTP from the client. Reuses Payload's nav chrome classes plus
 * the project selector and logout so it stays consistent with the default nav.
 */
export async function AtlasSidebar(props: ServerProps) {
  const user = props.user as Manager
  const localeCode = (props.locale?.code ?? 'en') as TypedLocale
  const { events, regions } = await getAtlasSidebarData(user.id, localeCode)

  return (
    <AtlasNavShell>
      <nav className="nav__wrap">
        <ProjectSelector />
        <AdminNavLinks />
        <EventList events={events} />
        <RegionTree regions={regions} />
        <div className="nav__controls">
          <Logout />
        </div>
      </nav>
    </AtlasNavShell>
  )
}
