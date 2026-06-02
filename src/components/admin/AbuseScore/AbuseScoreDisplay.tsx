'use client'

import { Pill } from '@payloadcms/ui'

import type { AbuseLevel, AbuseScore } from '@/plugins/usage/abuse'

/**
 * Get Pill style for abuse level.
 * Visualization logic kept in component, not in abuse.ts utility.
 */
function getPillStyle(level: AbuseLevel): 'error' | 'warning' | 'success' | undefined {
  const styles: Record<AbuseLevel, 'error' | 'warning' | 'success' | undefined> = {
    critical: 'error',
    high: 'warning',
    elevated: 'warning',
    normal: undefined,
  }
  return styles[level]
}

interface AbuseScoreDisplayProps {
  abuseScore: AbuseScore | null
}

/**
 * Shared display component for abuse score with Pill styling.
 * Used by both AbuseScoreCell (list view) and AbuseScoreField (edit view).
 */
export function AbuseScoreDisplay({ abuseScore }: AbuseScoreDisplayProps) {
  // Don't show anything for clients with no computed score
  if (!abuseScore?.score && abuseScore?.score !== 0) {
    return <span style={{ color: 'var(--theme-elevation-500)' }}>No usage data</span>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Pill pillStyle={getPillStyle(abuseScore.level)}>{abuseScore.score}</Pill>
      <span style={{ textTransform: 'capitalize' }}>{abuseScore.level}</span>
    </div>
  )
}
