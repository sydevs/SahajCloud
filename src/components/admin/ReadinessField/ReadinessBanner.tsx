'use client'

import { Banner, useAllFormFields } from '@payloadcms/ui'
import React from 'react'

import type { ReadinessReport } from '@/lib/status'

import { ProgressBar } from './ProgressBar'

function isReadinessReport(value: unknown): value is ReadinessReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    'summary' in value &&
    typeof (value as ReadinessReport).summary?.total === 'number'
  )
}

const ReadinessBanner: React.FC = () => {
  const [fields] = useAllFormFields()

  let totalSections = 0
  let passingSections = 0
  let hasData = false

  for (const field of Object.values(fields)) {
    if (isReadinessReport(field.value)) {
      hasData = true
      totalSections++
      if (field.value.passing) passingSections++
    }
  }

  const percent = totalSections === 0 ? 0 : Math.round((passingSections / totalSections) * 100)
  const bannerType = hasData && passingSections === totalSections ? 'success' : 'default'

  return (
    <Banner type={bannerType}>
      {hasData ? (
        <div style={{ padding: 'calc(var(--base) * 0.5) calc(var(--base) * 0.75)' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '1.5em',
              marginBottom: 'calc(var(--base) * 0.25)',
            }}
          >
            {percent}% Launch Ready
          </div>
          <ProgressBar passing={passingSections} total={totalSections} unit="sections ready" />
        </div>
      ) : (
        'Select a locale above to compute launch readiness.'
      )}
    </Banner>
  )
}

export default ReadinessBanner
