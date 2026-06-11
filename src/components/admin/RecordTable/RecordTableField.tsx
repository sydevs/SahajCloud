'use client'

import type { RecordColumn, RecordRow } from './format'
import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import { RecordTable } from './RecordTable'

/**
 * PayloadCMS field wrapper rendering a json-array field as a read-only
 * {@link RecordTable}. Columns come from `field.admin.custom.columns`
 * (`[{ key, label, format? }]`); when absent they're inferred from the
 * records' keys. Generic — any json-array log field can register it via
 * `admin.components.Field`.
 */
export const RecordTableField: FieldClientComponent = ({ field }) => {
  const { name, label, admin } = field as JSONFieldClient
  const columns = admin?.custom?.columns as RecordColumn[] | undefined

  const { value } = useField<RecordRow[]>()
  const records = Array.isArray(value) ? value : []

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        <RecordTable records={records} columns={columns} />
      </div>
      <FieldDescription description={admin?.description} path={name} />
    </div>
  )
}

export default RecordTableField
