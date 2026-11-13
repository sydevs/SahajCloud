'use client'

import type { UIFieldClientComponent } from 'payload'

import { Banner, Button, useField } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

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

  const read = COLUMNS.map((column) => {
    const swatch = readSwatch(report, column, fields[column].value)

    return swatch ? { column, ...swatch } : null
  })
  // All three or none: a colour the report has not caught up with yet would
  // leave a gap that reads as a colour visitors do not see.
  const current = read.every((swatch) => swatch !== null) ? read : null
  const answer = current && current.some((swatch) => swatch.adjusted) ? current : null

  // ⚠ Between a colour change and the atlas's report on it, the last answer stays
  // up. Hiding the banner for that round trip made it flicker on every pick.
  const [kept, setKept] = useState<typeof answer>(null)
  const key = current ? JSON.stringify(answer) : null

  useEffect(() => {
    if (key !== null) setKept(key === 'null' ? null : (JSON.parse(key) as typeof answer))
  }, [key])

  const swatches = current ? answer : kept

  if (!swatches) return null

  const suggestions = swatches.filter((swatch) => swatch.suggested)

  return (
    <div className="field-type">
      <Banner className="atlas-preview__banner" type="info">
        <strong>Colors are being adjusted for visibility</strong>
        <table className="atlas-preview__table">
          <tbody>
            {swatches.map((item) => (
              <tr key={item.column}>
                <td>
                  <SwatchTile adjusted={item.lightAdjusted} color={item.light} mode="light" />
                </td>
                <td>
                  <SwatchTile adjusted={item.darkAdjusted} color={item.dark} mode="dark" />
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
              // ⚠ Never disabled while a report is pending: toggling it flickered on every
              // pick. A kept answer describes colours the fields no longer hold, so a press
              // in that window applies nothing rather than a stale suggestion.
              onClick={() => {
                if (current) {
                  suggestions.forEach((item) => fields[item.column].setValue(item.suggested))
                }
              }}
              size="small"
            >
              Use adjusted colors
            </Button>
          </div>
        ) : null}
      </Banner>
    </div>
  )
}

const reasonText = ({ reasons }: Swatch) =>
  reasons.length > 0 ? `${reasons.join('; ')}.` : 'adjusted by the atlas.'

function SwatchTile({
  adjusted,
  color,
  mode,
}: {
  adjusted: boolean
  color: string
  mode: 'dark' | 'light'
}) {
  return (
    <span className="atlas-preview__swatch" style={{ backgroundColor: color }} title={color}>
      <span aria-hidden className={`atlas-preview__mark atlas-preview__mark--${mode}`}>
        {adjusted ? '!' : '✓'}
      </span>
    </span>
  )
}

export default AdjustedColors
