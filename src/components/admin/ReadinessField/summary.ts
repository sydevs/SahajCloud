/**
 * Map a summary ratio (passing / total) to a Payload-themed color bucket.
 * Returns CSS variable strings so the result theme-switches with the rest of
 * the admin UI.
 */
export type SummaryTone = 'success' | 'warning' | 'danger' | 'neutral'

export function summaryTone(passing: number, total: number): SummaryTone {
  if (total === 0) return 'neutral'
  if (passing === total) return 'success'
  if (passing === 0) return 'danger'
  return 'warning'
}

export function toneToColor(tone: SummaryTone): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'success':
      return {
        bg: 'var(--theme-success-50, rgba(16, 185, 129, 0.08))',
        fg: 'var(--theme-success-700, #047857)',
        border: 'var(--theme-success-200, rgba(16, 185, 129, 0.3))',
      }
    case 'warning':
      return {
        bg: 'var(--theme-warning-50, rgba(217, 119, 6, 0.08))',
        fg: 'var(--theme-warning-700, #b45309)',
        border: 'var(--theme-warning-200, rgba(217, 119, 6, 0.3))',
      }
    case 'danger':
      return {
        bg: 'var(--theme-error-50, rgba(220, 38, 38, 0.08))',
        fg: 'var(--theme-error-700, #b91c1c)',
        border: 'var(--theme-error-200, rgba(220, 38, 38, 0.3))',
      }
    case 'neutral':
    default:
      return {
        bg: 'var(--theme-elevation-100)',
        fg: 'var(--theme-elevation-600)',
        border: 'var(--theme-elevation-200)',
      }
  }
}
