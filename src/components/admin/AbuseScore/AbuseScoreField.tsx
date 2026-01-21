'use client'

import { useField } from '@payloadcms/ui'

import type { AbuseScore } from '@/lib/usage/abuse'

import { AbuseScoreDisplay } from './AbuseScoreDisplay'

/**
 * Field component for abuse score in edit views (beforeInput).
 * Uses useField hook to access the virtual field's computed value.
 */
export const AbuseScoreField: React.FC = () => {
  const { value } = useField<AbuseScore | null>()
  return (
    <div style={{ paddingBottom: 'calc(var(--base) * 0.5)' }}>
      <AbuseScoreDisplay abuseScore={value} />
    </div>
  )
}

export default AbuseScoreField
