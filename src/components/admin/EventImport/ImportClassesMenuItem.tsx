'use client'

import { PopupList } from '@payloadcms/ui'
import React from 'react'

import { useImportClassesTarget } from './useImportClassesTarget'

/**
 * "Import classes" in a region's edit menu. It is the entry point at a level
 * whose Events tab — and so whose tab heading — is hidden, and `targetRegion`
 * accepts a country and a region as readily as a city.
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
