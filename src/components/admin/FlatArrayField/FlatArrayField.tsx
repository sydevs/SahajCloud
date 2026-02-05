'use client'

import type { ArrayFieldClientComponent } from 'payload'

import {
  Button,
  Collapsible,
  FieldDescription,
  FieldError,
  FieldLabel,
  RenderFields,
  useField,
  useForm,
} from '@payloadcms/ui'
import { useCallback } from 'react'

/**
 * A flat array field that renders rows without individual Collapsible wrappers.
 * All rows are grouped inside a single Collapsible, with each row displaying
 * its fields inline alongside a remove button.
 *
 * Drop-in replacement for PayloadCMS ArrayField when rows don't need
 * per-row collapse/expand or drag-drop reordering.
 */
const FlatArrayField: ArrayFieldClientComponent = ({
  field,
  path: pathFromProps,
  parentSchemaPath,
  permissions,
  readOnly,
}) => {
  const { fields, label, maxRows, name, admin: { description } = {} } = field
  const schemaPath = parentSchemaPath ? `${parentSchemaPath}.${name}` : name

  const { addFieldRow, removeFieldRow } = useForm()
  const {
    rows = [],
    path,
    showError,
    value: rowCount,
  } = useField<number>({ hasRows: true, path: pathFromProps })

  const addRow = useCallback(
    (rowIndex: number) => {
      addFieldRow({ path, rowIndex, schemaPath })
    },
    [addFieldRow, path, schemaPath],
  )

  const removeRow = useCallback(
    (rowIndex: number) => {
      removeFieldRow({ path, rowIndex })
    },
    [removeFieldRow, path],
  )

  const canAddMore = !maxRows || (rowCount ?? 0) < maxRows

  return (
    <div className="field-type array" id={`field-${path?.replace(/\./g, '__')}`}>
      <FieldLabel label={label} path={path} />
      <FieldError path={path} showError={showError} />

      <Collapsible header={rows.length != 1 ? `${rows.length} breaks` : `${rows.length} break`}>
        {rows.map((row, i) => {
          const rowPath = `${path}.${i}`
          return (
            <div
              key={row.id}
              id={`${path}-row-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(var(--base) * 0.5)',
                marginBottom: 'calc(var(--base) * 0.25)',
              }}
            >
              <div style={{ flex: 1 }}>
                <RenderFields
                  fields={fields}
                  parentIndexPath=""
                  parentPath={rowPath}
                  parentSchemaPath={schemaPath}
                  permissions={permissions === true ? permissions : (permissions?.fields ?? true)}
                  readOnly={readOnly}
                />
              </div>
              {!readOnly && (
                <Button buttonStyle="icon-label" icon="x" onClick={() => removeRow(i)} round />
              )}
            </div>
          )
        })}

        {!readOnly && canAddMore && (
          <Button
            buttonStyle="icon-label"
            icon="plus"
            iconPosition="left"
            iconStyle="with-border"
            onClick={() => addRow(rowCount ?? 0)}
          >
            Add
          </Button>
        )}
      </Collapsible>
      <FieldDescription description={description} path={path} />
    </div>
  )
}

export default FlatArrayField
