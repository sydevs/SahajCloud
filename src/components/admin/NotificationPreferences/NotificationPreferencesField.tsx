'use client'

import type { NotificationPreferencesValue, NotificationType } from './config'
import type { FieldClientComponent, FormState, JSONFieldClient } from 'payload'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  useAllFormFields,
  useField,
} from '@payloadcms/ui'
import React, { useMemo } from 'react'

import { DEFAULT_NOTIFICATION_METHOD, NEVER_FREQUENCY } from './config'

/**
 * NotificationPreferences Field
 *
 * Config-driven table for the Managers `notificationPreferences` json field.
 * Renders one row per type from `field.admin.custom.notificationTypes`; per
 * row the manager picks a delivery Method (single-select: `email` + the
 * platforms from their `contactDetails`, read reactively from form state) and
 * a Frequency (the type's options). Selecting "Never" hides Method and
 * disables the row. Stored as `{ [key]: { frequency, method } }`.
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
  verticalAlign: 'top',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.4)',
  fontSize: '13px',
  color: 'var(--theme-elevation-800)',
  backgroundColor: 'var(--theme-input-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-s)',
}

export const NotificationPreferencesField: FieldClientComponent = ({ field, readOnly }) => {
  const { name, label, admin } = field as JSONFieldClient
  const notificationTypes = (admin?.custom?.notificationTypes ?? []) as NotificationType[]

  // Path is inferred from FieldPathContext; `name` is the path for the
  // label/error/description wrappers (see ToggleGroupField).
  const { value, setValue, showError } = useField<NotificationPreferencesValue>()
  const [formState] = useAllFormFields()

  const methodOptions = useMemo(
    () => [DEFAULT_NOTIFICATION_METHOD, ...collectContactPlatforms(formState)],
    [formState],
  )

  const prefs = value ?? {}

  const updateRow = (key: string, patch: Partial<{ frequency: string; method: string }>) => {
    const current = prefs[key] ?? { frequency: '', method: '' }
    const next = { ...current, ...patch }
    // Switching to "Never" clears the now-hidden method to keep data honest.
    if (next.frequency === NEVER_FREQUENCY) next.method = ''
    setValue({ ...prefs, [key]: next })
  }

  const fieldClasses = ['field-type', 'json', showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={fieldClasses}>
      <FieldLabel label={label} path={name} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid var(--theme-elevation-150)',
            fontSize: '13px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: 'var(--theme-elevation-50)' }}>
              <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>Notification</th>
              <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left', width: '30%' }}>
                Method
              </th>
              <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'left', width: '30%' }}>
                Frequency
              </th>
            </tr>
          </thead>
          <tbody>
            {notificationTypes.map((type) => {
              const pref = prefs[type.key] ?? { frequency: '', method: '' }
              const isNever = pref.frequency === NEVER_FREQUENCY
              const methodRequired = Boolean(pref.frequency) && !isNever
              const methodMissing = methodRequired && !pref.method
              // Keep a method that's no longer in contactDetails selectable so
              // it isn't silently dropped from the dropdown.
              const rowMethodOptions =
                pref.method && !methodOptions.includes(pref.method)
                  ? [...methodOptions, pref.method]
                  : methodOptions

              return (
                <tr
                  key={type.key}
                  style={{
                    borderTop: '1px solid var(--theme-elevation-150)',
                    opacity: isNever ? 0.55 : 1,
                  }}
                >
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 500 }}>{type.title}</div>
                    <div style={{ color: 'var(--theme-elevation-500)', marginTop: '2px' }}>
                      {type.description}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    {isNever ? (
                      <span style={{ color: 'var(--theme-elevation-400)' }}>—</span>
                    ) : (
                      <select
                        aria-label={`${type.title} method`}
                        value={pref.method ?? ''}
                        disabled={readOnly}
                        onChange={(e) => updateRow(type.key, { method: e.target.value })}
                        style={{
                          ...selectStyle,
                          ...(methodMissing ? { borderColor: 'var(--theme-error-500)' } : {}),
                        }}
                      >
                        <option value="">— Select —</option>
                        {rowMethodOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={cellStyle}>
                    <select
                      aria-label={`${type.title} frequency`}
                      value={pref.frequency ?? ''}
                      disabled={readOnly}
                      onChange={(e) => updateRow(type.key, { frequency: e.target.value })}
                      style={selectStyle}
                    >
                      <option value="">— Select —</option>
                      {type.frequencyOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <FieldDescription description={admin?.description} path={name} />
    </div>
  )
}

export default NotificationPreferencesField
