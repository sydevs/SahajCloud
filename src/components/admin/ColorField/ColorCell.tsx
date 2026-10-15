'use client'

import type { DefaultCellComponentProps } from 'payload'

import { CellButton, useDrawerRowSelect } from '@/components/admin/drawerRowSelect'

/**
 * Color Cell Component
 *
 * Displays a color preview square alongside the hex value in list views.
 * The square matches the line height and has a subtle border for visibility.
 */
export const ColorCell: React.FC<DefaultCellComponentProps> = ({
  cellData,
  className,
  collectionSlug,
  link,
  rowData,
}) => {
  const handleClick = useDrawerRowSelect({ cellData, collectionSlug, link, rowData })
  const color = typeof cellData === 'string' ? cellData : null

  const content = color ? (
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
  ) : (
    <span style={{ color: 'var(--theme-elevation-400)' }}>—</span>
  )

  if (handleClick) {
    return (
      <CellButton className={className} onClick={handleClick}>
        {content}
      </CellButton>
    )
  }

  return content
}

export default ColorCell
