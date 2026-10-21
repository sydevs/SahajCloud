'use client'

import { PopupList, useAuth } from '@payloadcms/ui'
import React from 'react'

/** "Import classes" in the Events list's menu, for anyone who may start an import. */
export const ImportListMenuItem: React.FC = () => {
  const { permissions } = useAuth()
  if (!permissions?.collections?.imports?.create) return null
  return (
    <PopupList.Button href="/admin/collections/imports/create">Import classes</PopupList.Button>
  )
}

export default ImportListMenuItem
