'use client'

import type { NotificationKey } from '@/lib/notifications/preferences'
import type { FieldClientComponent, FormState, JSONFieldClient } from 'payload'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  ReactSelect,
  type ReactSelectOption,
  useAllFormFields,
  useDocumentInfo,
  useField,
} from '@payloadcms/ui'
import React, { useMemo } from 'react'

import { managerRoles } from '@/lib/notifications/managerRoles'
import type { NotificationPreferences } from '@/payload-types'

import {
  DEFAULT_NOTIFICATION_METHOD,
  NEVER_FREQUENCY,
  notificationFrequency,
  notificationMethodLabel,
  notificationTypesFor,
} from '@/lib/notifications/preferences'

/**
 * NotificationPreferences Field
 *
 * Config-driven table for the Managers `notificationPreferences` json field.
 * Renders one row per `NOTIFICATION_TYPES` entry the manager's roles reach; per
 * row the manager picks a delivery Method (single-select: `email` + the
 * platforms from their `contactDetails`, read reactively from form state) and
 * a Frequency (the type's options). Selecting "Never" hides Method and
 * disables the row. Stored as `{ [key]: { frequency, method } }`.
 *
 * ⚠ **Rows are filtered by the roles the SAVED document derives**, read the
 * same way `RolesField` reads them: `virtualRoles` resolves both Atlas roles
 * from the page/region/event joins, which only a saved row carries. So a
 * manager assigned their first region sees the region rows after that save, not
 * while making it.
 *
 * ⚠ **A row the manager never saved shows its own default, not blank.** The
 * column's DEFAULT reaches new rows only, so every manager predating a row has
 * no value for it — and a blank select beside a job that sends daily is how
 * someone concludes the digest is off.
 */

/**
 * Collect the platforms configured in the manager's `contactDetails` array,
 * read reactively from form state. Array rows are flat paths:
 * `contactDetails.{index}.platform`.
 */
function collectContactPlatforms(formState: FormState): string[] {
  const platforms: string[] = []
  for (const [path, state] of Object.entries(formState)) {
    if (/^contactDetails\.\d+\.platform$/.test(path)) {
      const platform = state?.value
      if (typeof platform === 'string' && platform) platforms.push(platform)
    }
  }
  return [...new Set(platforms)]
}

const cellStyle: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.35) calc(var(--base) * 0.5)',
  color: 'var(--theme-elevation-800)',
  verticalAlign: 'middle',
}

/** Method and Frequency line up in columns of their own, whatever they hold. */
const CHOICE_COLUMN_WIDTH = '180px'

const asOptions = (values: readonly string[], label: (value: string) => string = (v) => v) =>
  values.map((value) => ({ label: label(value), value })) as ReactSelectOption[]

export const NotificationPreferencesField: FieldClientComponent = ({ field, readOnly }) => {
  const { name, label, admin } = field as JSONFieldClient

  // Path is inferred from FieldPathContext; `name` is the path for the
  // label/error/description wrappers (see ToggleGroupField).
  const { value, setValue, showError } = useField<NotificationPreferences>()
  const [formState] = useAllFormFields()
  const { savedDocumentData } = useDocumentInfo()

  const methodOptions = useMemo(
    () => [DEFAULT_NOTIFICATION_METHOD, ...collectContactPlatforms(formState)],
    [formState],
  )

  const visibleTypes = useMemo(
    () => notificationTypesFor(managerRoles(savedDocumentData ?? {})),
    [savedDocumentData],
  )

  const prefs = useMemo(() => value ?? {}, [value])

  // The resolved pace, not the stored one: a row showing its default must save
  // that default when the manager changes only the method beside it.
  const resolved = (key: NotificationKey) => ({
    frequency: notificationFrequency(prefs, key),
    method: prefs[key]?.method ?? DEFAULT_NOTIFICATION_METHOD,
  })

  // ⚠ ReactSelect memoizes on `options` by identity, and this component
  // re-renders on every keystroke anywhere in the form (`useAllFormFields`), so
  // each row's arrays are built once per change to what they come from.
  const rows = useMemo(
    () =>
      visibleTypes.map((type) => {
        const frequency = notificationFrequency(prefs, type.key)
        const method = prefs[type.key]?.method ?? DEFAULT_NOTIFICATION_METHOD
        // Keep a method that's no longer in contactDetails selectable so it
        // isn't silently dropped from the dropdown.
        const methods = asOptions(
          method && !methodOptions.includes(method) ? [...methodOptions, method] : methodOptions,
          notificationMethodLabel,
        )
        const frequencies = asOptions(type.frequencyOptions)
        return {
          frequencies,
          frequency,
          method,
          methods,
          selectedFrequency: frequencies.find((option) => option.value === frequency),
          selectedMethod: methods.find((option) => option.value === method),
          type,
        }
      }),
    [methodOptions, prefs, visibleTypes],
  )

  const updateRow = (
    key: NotificationKey,
    patch: Partial<{ frequency: string; method: string }>,
  ) => {
    const updated = { ...resolved(key), ...patch }
    // Switching to "Never" clears the now-hidden method to keep data honest.
    if (updated.frequency === NEVER_FREQUENCY) updated.method = ''
    setValue({ ...prefs, [key]: updated })
  }

  const fieldClasses = [
    'field-type',
    'json',
    'notification-preferences',
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={fieldClasses}>
      <FieldLabel label={label} path={name} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        {visibleTypes.length === 0 ? (
          <p style={{ color: 'var(--theme-elevation-500)', fontSize: '13px', margin: 0 }}>
            Nothing is assigned to this manager yet, so there is nothing to send them.
          </p>
        ) : (
          <table
            style={{
              width: '100%',
              // ⚠ Fixed, or the `col` widths below are a suggestion the browser
              // drops: an auto table gives each choice column its content width
              // and the dropdown inside it lands at 50px, label truncated.
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              border: '1px solid var(--theme-elevation-150)',
              fontSize: '13px',
            }}
          >
            {/* The Notification column absorbs spare width; the two choices
              keep a column each, so a row's dropdowns line up with the one
              above whatever either holds. */}
            <colgroup>
              <col />
              <col style={{ width: CHOICE_COLUMN_WIDTH }} />
              <col style={{ width: CHOICE_COLUMN_WIDTH }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: 'var(--theme-elevation-50)' }}>
                <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>Notification</th>
                <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>Method</th>
                <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>Frequency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { frequencies, methods, selectedFrequency, selectedMethod, type } = row
                const isNever = row.frequency === NEVER_FREQUENCY
                const methodMissing = !isNever && !row.method

                // Fade only the Notification + Method cells when muted ("Never")
                // — the Frequency cell stays full-opacity so it never reads as
                // uneditable (it's how the user un-mutes the row).
                const mutedStyle = { ...cellStyle, opacity: isNever ? 0.55 : 1 }

                return (
                  <tr key={type.key} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
                    <td style={mutedStyle}>
                      <div style={{ fontWeight: 500 }}>{type.title}</div>
                      <div style={{ color: 'var(--theme-elevation-500)', marginTop: '2px' }}>
                        {type.description}
                      </div>
                    </td>
                    <td style={mutedStyle}>
                      {isNever ? (
                        <span style={{ color: 'var(--theme-elevation-400)' }}>—</span>
                      ) : (
                        <ReactSelect
                          aria-label={`${type.title} method`}
                          disabled={readOnly}
                          isClearable={false}
                          onChange={(option) =>
                            updateRow(type.key, {
                              method: String((option as ReactSelectOption | null)?.value ?? ''),
                            })
                          }
                          options={methods}
                          placeholder="Select"
                          showError={methodMissing}
                          value={selectedMethod}
                        />
                      )}
                    </td>
                    <td style={cellStyle}>
                      {/* No empty option: every row resolves to a pace, its own
                        default where the manager never saved one. */}
                      <ReactSelect
                        aria-label={`${type.title} frequency`}
                        disabled={readOnly}
                        isClearable={false}
                        onChange={(option) =>
                          updateRow(type.key, {
                            frequency: String((option as ReactSelectOption | null)?.value ?? ''),
                          })
                        }
                        options={frequencies}
                        value={selectedFrequency}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <FieldDescription description={admin?.description} path={name} />
    </div>
  )
}

export default NotificationPreferencesField
