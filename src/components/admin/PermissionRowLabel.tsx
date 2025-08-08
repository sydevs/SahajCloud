'use client'

import { useRowLabel } from '@payloadcms/ui'

export const PermissionRowLabel = () => {
  const { data, rowNumber } = useRowLabel<{ allowedCollection?: string, level: string, locales: string[] }>()

  if (data.locales && data.allowedCollection && data.level) {
    const title = data.allowedCollection.charAt(0).toUpperCase() + data.allowedCollection.slice(1)
    return <>Can<b>{data.level.toLowerCase()}</b>{title} for<b>{data.locales?.join(", ").toUpperCase()}</b></>
  } else {
    return <>Permission {(rowNumber || 0) + 1} <b>(Missing Configuration)</b></>
  }
}

export default PermissionRowLabel