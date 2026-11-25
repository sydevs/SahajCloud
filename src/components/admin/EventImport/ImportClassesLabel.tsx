'use client'

import type { JoinFieldLabelClientComponent } from 'payload'

import { FieldLabel } from '@payloadcms/ui'
import React from 'react'

import { LabelWithAction } from '@/components/admin/helpers/labelWithAction'

import { useImportClassesTarget } from './useImportClassesTarget'

/**
 * The Regions "Events" table's heading, with an "Import classes" link beside it
 * that opens a new import aimed at this region. `targetRegion`'s `defaultValue`
 * reads the `?targetRegion=` it carries.
 */
export const ImportClassesLabel: JoinFieldLabelClientComponent = ({ field }) => {
  const target = useImportClassesTarget()
  // No `path`: a join table is a composite with no control to name, and its
  // own root is what carries `field-<path>`.
  const label = <FieldLabel label={field?.label} />

  if (!target) return label

  return (
    <LabelWithAction action="Import classes" to={target}>
      {label}
    </LabelWithAction>
  )
}

export default ImportClassesLabel
