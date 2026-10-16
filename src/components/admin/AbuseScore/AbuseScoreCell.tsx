'use client'

import type { DefaultCellComponentProps } from 'payload'

import { SelectableCell } from '@/components/admin/helpers/drawerRowSelect'
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
}) => (
  <SelectableCell collectionSlug={collectionSlug} link={link} rowData={rowData}>
    <AbuseScoreDisplay abuseScore={cellData as ClientAbuseScore | null} />
  </SelectableCell>
)

export default AbuseScoreCell
