'use client'

import type { DefaultCellComponentProps } from 'payload'

import { SelectableCell } from '@/components/admin/helpers/drawerRowSelect'

/**
 * Color Cell Component
 *
 * Displays a color preview square alongside the hex value in list views.
 * The square matches the line height and has a subtle border for visibility.
 */
export const ColorCell: React.FC<DefaultCellComponentProps> = ({
  cellData,
  collectionSlug,
  link,
  rowData,
}) => {
  const color = typeof cellData === 'string' ? cellData : null

  return (
    <SelectableCell collectionSlug={collectionSlug} link={link} rowData={rowData}>
      {color ? (
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
      )}
    </SelectableCell>
  )
}

export default ColorCell
