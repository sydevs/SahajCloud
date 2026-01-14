'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * Color Cell Component
 *
 * Displays a color preview square alongside the hex value in list views.
 * The square matches the line height and has a subtle border for visibility.
 */
export const ColorCell: React.FC<DefaultCellComponentProps> = ({ cellData }) => {
  const color = typeof cellData === 'string' ? cellData : null

  if (!color) {
    return <span style={{ color: 'var(--theme-elevation-400)' }}>—</span>
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <div
        style={{
          height: '32px',
          aspectRatio: 1,
          backgroundColor: color,
          borderRadius: '4px',
          border: '1px solid var(--theme-elevation-150)',
          flexShrink: 0,
        }}
      />
      <span>{color}</span>
    </div>
  )
}

export default ColorCell
