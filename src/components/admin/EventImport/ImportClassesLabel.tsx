'use client'

import type { JoinFieldLabelClientComponent } from 'payload'

import { FieldLabel, useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React from 'react'

import { LabelWithAction } from '@/components/admin/helpers/labelWithAction'

/**
 * The Regions "Events" table's heading, with an "Import classes" link beside it
 * that opens a new import aimed at this region. `targetRegion`'s `defaultValue`
 * reads the `?targetRegion=` it carries. A venue has no cities to file under.
 */
export const ImportClassesLabel: JoinFieldLabelClientComponent = ({ field, path }) => {
  const { id } = useDocumentInfo()
  const { permissions } = useAuth()
  const level = useFormFields(([fields]) => fields.level?.value)
  const label = <FieldLabel label={field?.label} path={path} />

  if (!id || level === 'venue' || !permissions?.collections?.imports?.create) return label

  return (
    <LabelWithAction
      action="Import classes"
      to={`/admin/collections/imports/create?targetRegion=${id}`}
    >
      {label}
    </LabelWithAction>
  )
}

export default ImportClassesLabel
