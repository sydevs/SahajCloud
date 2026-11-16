'use client'

import { PopupList } from '@payloadcms/ui'
import React from 'react'

import { useImportClassesTarget } from './useImportClassesTarget'

/**
 * "Import classes" in a region's edit menu, so the link is one click away from
 * every tab, not only from the Events tab's heading.
 */
export const ImportClassesMenuItem: React.FC = () => {
  const target = useImportClassesTarget()

  if (!target) return null

  return (
    <PopupList.Button href={target} id="action-import-classes">
      Import classes
    </PopupList.Button>
  )
}

export default ImportClassesMenuItem
