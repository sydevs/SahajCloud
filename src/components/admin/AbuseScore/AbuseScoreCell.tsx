'use client'

import type { DefaultCellComponentProps } from 'payload'

import type { ClientAbuseScore } from '@/payload-types'

import { AbuseScoreDisplay } from './AbuseScoreDisplay'

/**
 * Cell component for abuse score in list views.
 * Receives pre-computed value via cellData from the virtual field's afterRead hook.
 */
export const AbuseScoreCell: React.FC<DefaultCellComponentProps> = ({ cellData }) => {
  const abuseScore = cellData as ClientAbuseScore | null
  return <AbuseScoreDisplay abuseScore={abuseScore} />
}

export default AbuseScoreCell
