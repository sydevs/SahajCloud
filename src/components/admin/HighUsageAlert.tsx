'use client'

import { useFormFields } from '@payloadcms/ui'

interface HighUsageAlertProps {
  path: string
  clientProps?: {
    threshold?: number
  }
}

interface UsageValue {
  dailyRequests?: number | null
  peakDailyRequests?: number | null
  lastRequestAt?: string | null
}

interface FormFieldValue {
  value?: UsageValue
}

export const HighUsageAlert = ({ clientProps }: HighUsageAlertProps) => {
  const fields = useFormFields(([fields]) => fields)
  const threshold = clientProps?.threshold || 1000
  
  // Extract daily requests from form fields
  const usageField = fields?.usage as FormFieldValue | undefined
  const usage = usageField?.value
  const dailyRequests = usage?.dailyRequests || 0
  
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