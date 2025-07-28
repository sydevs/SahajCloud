'use client'

import React from 'react'
import { useFormFields } from '@payloadcms/ui'

interface HighUsageAlertProps {
  path: string
  clientProps?: {
    threshold?: number
  }
}

interface UsageStatsValue {
  totalRequests?: number | null
  dailyRequests?: number | null
  lastRequestAt?: string | null
  lastResetAt?: string | null
}

interface FormFieldValue {
  value?: UsageStatsValue
}

export const HighUsageAlert: React.FC<HighUsageAlertProps> = ({ clientProps }) => {
  const fields = useFormFields(([fields]) => fields)
  const threshold = clientProps?.threshold || 1000
  
  // Extract daily requests from form fields
  const usageStatsField = fields?.usageStats as FormFieldValue | undefined
  const usageStats = usageStatsField?.value
  const dailyRequests = usageStats?.dailyRequests || 0
  
  // Only show alert when usage exceeds threshold
  if (dailyRequests <= threshold) {
    return null
  }
  
  return (
    <div style={{ 
      padding: '12px',
      backgroundColor: '#fef3c7',
      border: '1px solid #f59e0b',
      borderRadius: '4px',
      marginTop: '8px'
    }}>
      <strong style={{ color: '#d97706' }}>⚠️ High Usage Alert</strong>
      <p style={{ margin: '4px 0 0 0', color: '#92400e' }}>
        {dailyRequests.toLocaleString()} requests today (limit: {threshold.toLocaleString()})
      </p>
    </div>
  )
}

export default HighUsageAlert