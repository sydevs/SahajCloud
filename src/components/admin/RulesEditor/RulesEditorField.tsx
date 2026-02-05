'use client'

import type { JSONFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import type { RuleDefinition, RulesValue } from '@/fields/rulesField'

import { RulesEditor } from './RulesEditor'

export const RulesEditorField: JSONFieldClientComponent = ({ field, readOnly }) => {
  const {
    name,
    label,
    required,
    admin: { description, custom } = {},
  } = field

  const ruleDefinitions = (custom?.ruleDefinitions || []) as RuleDefinition[]
  const { value, setValue, showError } = useField<RulesValue | null>()

  const fieldClasses = ['field-type', 'json', showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  const fieldId = `field-${name.replace(/\./g, '__')}`

  return (
    <div className={fieldClasses} id={fieldId}>
      <FieldLabel label={label} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />
        <RulesEditor
          ruleDefinitions={ruleDefinitions}
          value={value}
          onChange={setValue}
          readOnly={readOnly}
        />
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default RulesEditorField
