'use client'

import type { DefaultCellComponentProps } from 'payload'

import { CellButton, useDrawerRowSelect } from '@/components/admin/drawerRowSelect'
import type { ClientAbuseScore } from '@/payload-types'

import { AbuseScoreDisplay } from './AbuseScoreDisplay'

/**
 * Cell component for abuse score in list views.
 * Receives pre-computed value via cellData from the virtual field's afterRead hook.
 */
export const AbuseScoreCell: React.FC<DefaultCellComponentProps> = ({
  cellData,
  collectionSlug,
  link,
  rowData,
}) => {
  const handleClick = useDrawerRowSelect({ collectionSlug, link, rowData })
  const content = <AbuseScoreDisplay abuseScore={cellData as ClientAbuseScore | null} />

  if (handleClick) {
    return <CellButton onClick={handleClick}>{content}</CellButton>
  }

  return content
}

export default AbuseScoreCell
