'use client'

import type { GroupFieldLabelClientComponent } from 'payload'

import { FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import { LabelWithAction } from '@/components/admin/helpers/labelWithAction'
import { BRAND_COLOR_LABELS, isBrandColor, type BrandColorColumn } from '@/lib/clients/appearance'

const COLUMNS = Object.keys(BRAND_COLOR_LABELS) as BrandColorColumn[]

/**
 * The Branding Colors group's title, with Reset colors beside it while any
 * colour is the service's own.
 *
 * It clears the columns rather than writing the defaults: an unset colour
 * follows a later change to the defaults, and a copied one would not.
 */
export const BrandingColorsLabel: GroupFieldLabelClientComponent = ({ field }) => {
  const fields = {
    color1: useField<null | string>({ path: 'color1' }),
    color2: useField<null | string>({ path: 'color2' }),
    color3: useField<null | string>({ path: 'color3' }),
  }
  // Payload's own group title markup, so the heading matches every other group's.
  const label = (
    <h3 className="group-field__title">
      <FieldLabel as="span" label={field?.label} />
    </h3>
  )

  if (!COLUMNS.some((column) => isBrandColor(fields[column].value))) return label

  return (
    <LabelWithAction
      action="Reset colors"
      onClick={() => COLUMNS.forEach((column) => fields[column].setValue(null))}
    >
      {label}
    </LabelWithAction>
  )
}

export default BrandingColorsLabel
