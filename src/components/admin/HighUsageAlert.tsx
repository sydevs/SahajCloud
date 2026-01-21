'use client'

import { useFormFields } from '@payloadcms/ui'

import { HIGH_USAGE_THRESHOLD } from '@/lib/usage'

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
  const threshold = clientProps?.threshold || HIGH_USAGE_THRESHOLD
  
  // Extract daily requests from form fields
  const usageField = fields?.usage as FormFieldValue | undefined
  const usage = usageField?.value
  const dailyRequests = usage?.dailyRequests || 0
  
  // Only show alert when usage exceeds threshold
  if (dailyRequests <= threshold) {
    return null
  }
  
  // Using PayloadCMS CSS variables for spacing/radius with amber warning colors
  // PayloadCMS theme system doesn't include semantic warning colors
  return (
    <div style={{
      padding: 'calc(var(--base) * 0.6)',
      backgroundColor: 'color-mix(in srgb, var(--theme-elevation-100) 50%, #fef3c7 50%)',
      border: '1px solid var(--theme-elevation-200)',
      borderRadius: 'var(--style-radius-s)',
      marginTop: 'calc(var(--base) * 0.4)'
    }}>
      <strong style={{ color: 'var(--theme-elevation-800)' }}>⚠️ High Usage Alert</strong>
      <p style={{ margin: 'calc(var(--base) * 0.2) 0 0 0', color: 'var(--theme-elevation-600)' }}>
        {dailyRequests.toLocaleString()} requests today (limit: {threshold.toLocaleString()})
      </p>
    </div>
  )
}

export default HighUsageAlert