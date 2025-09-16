'use client'

import { useRowLabel } from '@payloadcms/ui'

export const TitleRowLabel = () => {
  const { data, rowNumber } = useRowLabel<{ title: string }>()
  return data.title || `Row ${(rowNumber || 0) + 1}`
}

export default TitleRowLabel
