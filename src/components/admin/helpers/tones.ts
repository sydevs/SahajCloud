/**
 * The one tone vocabulary the admin panel's status indicators share — the
 * readiness pills and bars, the event quality panel, the Install tab's
 * progress — each a Payload theme colour, so every one theme-switches.
 */
export type Tone = 'success' | 'warning' | 'danger' | 'neutral'

/** A tone's solid colour: a bar's fill, a badge, an icon. */
export const TONE_COLORS: Record<Tone, string> = {
  success: 'var(--theme-success-500)',
  warning: 'var(--theme-warning-500)',
  danger: 'var(--theme-error-500)',
  neutral: 'var(--theme-elevation-400)',
}

/** A tone as a tinted surface: a pill's background, text and border. */
export const TONE_SURFACES: Record<Tone, { bg: string; fg: string; border: string }> = {
  success: {
    bg: 'var(--theme-success-50, rgba(16, 185, 129, 0.08))',
    fg: 'var(--theme-success-700, #047857)',
    border: 'var(--theme-success-200, rgba(16, 185, 129, 0.3))',
  },
  warning: {
    bg: 'var(--theme-warning-50, rgba(217, 119, 6, 0.08))',
    fg: 'var(--theme-warning-700, #b45309)',
    border: 'var(--theme-warning-200, rgba(217, 119, 6, 0.3))',
  },
  danger: {
    bg: 'var(--theme-error-50, rgba(220, 38, 38, 0.08))',
    fg: 'var(--theme-error-700, #b91c1c)',
    border: 'var(--theme-error-200, rgba(220, 38, 38, 0.3))',
  },
  neutral: {
    bg: 'var(--theme-elevation-100)',
    fg: 'var(--theme-elevation-600)',
    border: 'var(--theme-elevation-200)',
  },
}

/** The tone of a count of passing out of a total: none yet, some, or all. */
export function ratioTone(passing: number, total: number): Tone {
  if (total === 0) return 'neutral'
  if (passing === total) return 'success'
  if (passing === 0) return 'danger'
  return 'warning'
}
