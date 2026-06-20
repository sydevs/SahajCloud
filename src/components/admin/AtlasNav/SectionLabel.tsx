import React from 'react'

/** Small uppercase heading for a sidebar section (Events / Regions). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--theme-elevation-450)',
        padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.4) calc(var(--base) * 0.2)',
      }}
    >
      {children}
    </div>
  )
}
