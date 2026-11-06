/** The four tones an admin indicator takes, each one of Payload's theme colours. */
export type Tone = 'success' | 'warning' | 'danger' | 'neutral'

export const TONE_COLORS: Record<Tone, string> = {
  success: 'var(--theme-success-500)',
  warning: 'var(--theme-warning-500)',
  danger: 'var(--theme-error-500)',
  neutral: 'var(--theme-elevation-400)',
}
