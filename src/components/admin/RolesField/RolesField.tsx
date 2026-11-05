'use client'

import type { SelectFieldClientComponent } from 'payload'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  ReactSelect,
  type ReactSelectOption,
  RenderCustomComponent,
  useDocumentInfo,
  useField,
  withCondition,
} from '@payloadcms/ui'
import React, { useCallback, useMemo } from 'react'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import type { RoleSlug } from '@/payload-types'
import { getRoleLabel, virtualRoles } from '@/plugins/access/config'

import styles from './RolesField.module.css'
import { derivedRolesNote, type RoleChip, roleChips, storedRoles } from './utils'

// react-select's own per-chip class hook. Payload's `ReactSelect` forwards it
// with every other prop but leaves it out of its prop type, hence the spread.
// Payload's remove button is not reachable any other way: `@payloadcms/ui` is
// prebundled, so a deep import would load a second copy of its contexts.
const derivedChipClassNames = {
  classNames: {
    multiValue: ({ data }: { data: unknown }) => ((data as RoleChip).derived ? styles.derived : ''),
  },
}

/**
 * The Managers `roles` select, with the derived Atlas roles shown among the
 * stored ones as chips that cannot be removed.
 *
 * Custom because Payload's `SelectInput` passes no react-select props
 * through, so it cannot mark one chip apart from another. This composes the
 * same exported `ReactSelect` and field primitives instead, and `withCondition`,
 * which a custom field owes itself or its `admin.condition` is ignored.
 *
 * The derived roles are read off the saved document's page, region and event
 * joins —
 * the source `virtualRoles` reads on the server — and never enter the field's
 * value: `storedRoles` strips them from every change.
 */
const RolesFieldComponent: SelectFieldClientComponent = ({ field, readOnly }) => {
  const {
    admin,
    admin: { className, description } = {},
    label,
    localized,
    options: fieldOptions = [],
    required,
  } = field

  const {
    customComponents: { AfterInput, BeforeInput, Description, Error, Label } = {},
    disabled,
    path,
    setValue,
    showError,
    value,
  } = useField<RoleSlug[] | null>()
  const { savedDocumentData } = useDocumentInfo()

  const derived = useMemo(() => virtualRoles(savedDocumentData ?? {}), [savedDocumentData])

  const options = useMemo(
    () =>
      fieldOptions.map((option) => {
        const role = (typeof option === 'string' ? option : option.value) as RoleSlug
        return { label: getRoleLabel(role), value: role }
      }),
    [fieldOptions],
  )

  const chips = useMemo(
    () => roleChips({ derived, labelOf: getRoleLabel, stored: value ?? [] }),
    [derived, value],
  )

  const isReadOnly = Boolean(readOnly || disabled)

  const onChange = useCallback(
    (selection: ReactSelectOption | ReactSelectOption[]) => {
      if (isReadOnly) return
      setValue(storedRoles(Array.isArray(selection) ? selection : []))
    },
    [isReadOnly, setValue],
  )

  const note = derivedRolesNote(chips.filter((chip) => chip.derived).map((chip) => chip.label))

  const fieldClasses = [
    'field-type',
    'select',
    className,
    showError && 'error',
    isReadOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  const fieldStyles = useMemo(() => mergeFieldStyles(admin), [admin])

  return (
    <div className={fieldClasses} id={`field-${path.replace(/\./g, '__')}`} style={fieldStyles}>
      <RenderCustomComponent
        CustomComponent={Label}
        Fallback={
          <FieldLabel label={label} localized={localized} path={path} required={required} />
        }
      />
      <div className="field-type__wrap">
        <RenderCustomComponent
          CustomComponent={Error}
          Fallback={<FieldError path={path} showError={showError} />}
        />
        {BeforeInput}
        <ReactSelect
          {...derivedChipClassNames}
          disabled={isReadOnly}
          // Clearing removes the stored roles alone, so with none there is nothing to clear.
          isClearable={(value?.length ?? 0) > 0}
          isMulti
          onChange={onChange}
          options={options}
          showError={showError}
          value={chips}
        />
        {note && <div className={styles.note}>{note}</div>}
        {AfterInput}
      </div>
      <RenderCustomComponent
        CustomComponent={Description}
        Fallback={<FieldDescription description={description} path={path} />}
      />
    </div>
  )
}

export const RolesField = withCondition(RolesFieldComponent)

export default RolesField
