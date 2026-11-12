'use client'

import type { UIFieldClientComponent } from 'payload'

import { Banner, Button, useField } from '@payloadcms/ui'
import React from 'react'

import { BRAND_COLOR_LABELS, type BrandColorColumn } from '@/lib/clients/appearance'

import { readSwatch, type Swatch } from './paletteReport'
import { usePreviewMessage } from './usePreviewMessage'

import './AtlasPreview.scss'

const COLUMNS = Object.keys(BRAND_COLOR_LABELS) as BrandColorColumn[]

/**
 * What the atlas preview reports it rendered for the three colours, shown once
 * it adjusted any of them: each colour's light and dark swatch, why it moved,
 * and one action that takes every suggestion.
 */
export const AdjustedColors: UIFieldClientComponent = () => {
  const report = usePreviewMessage()
  const fields = {
    color1: useField<null | string>({ path: 'color1' }),
    color2: useField<null | string>({ path: 'color2' }),
    color3: useField<null | string>({ path: 'color3' }),
  }

  const swatches = COLUMNS.map((column) => {
    const swatch = readSwatch(report, column, fields[column].value)

    return swatch ? { column, ...swatch } : null
  })

  // All three or none: a colour the report has not caught up with yet would
  // leave a gap that reads as a colour visitors do not see.
  if (!swatches.every((swatch) => swatch !== null)) return null
  if (!swatches.some((swatch) => swatch.adjusted)) return null

  const suggestions = swatches.filter((swatch) => swatch.suggested)

  return (
    <Banner className="atlas-preview__banner" type="info">
      <strong>Colors are being adjusted for visibility</strong>
      <table className="atlas-preview__table">
        <tbody>
          {swatches.map((item) => (
            <tr key={item.column}>
              <td>
                <SwatchTile adjusted={item.adjusted} color={item.light} />
              </td>
              <td>
                <SwatchTile adjusted={item.adjusted} color={item.dark} />
              </td>
              <td>
                <strong>{BRAND_COLOR_LABELS[item.column]}</strong> —{' '}
                {item.adjusted ? reasonText(item) : 'This color is safe to use.'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {suggestions.length > 0 ? (
        <div className="atlas-preview__banner-actions">
          <Button
            buttonStyle="secondary"
            margin={false}
            onClick={() =>
              suggestions.forEach((item) => fields[item.column].setValue(item.suggested))
            }
            size="small"
          >
            Use adjusted colors
          </Button>
        </div>
      ) : null}
    </Banner>
  )
}

const reasonText = ({ reasons }: Swatch) =>
  reasons.length > 0 ? `${reasons.join(' and ')}.` : 'adjusted by the atlas.'

function SwatchTile({ adjusted, color }: { adjusted: boolean; color: string }) {
  return (
    <span className="atlas-preview__swatch" style={{ backgroundColor: color }} title={color}>
      <span aria-hidden className="atlas-preview__mark">
        {adjusted ? '!' : '✓'}
      </span>
    </span>
  )
}

export default AdjustedColors
