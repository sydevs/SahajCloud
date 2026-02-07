'use client'

import type { FieldDescriptionClientComponent, SelectFieldClient } from 'payload'

import { FieldDescription, useField } from '@payloadcms/ui'
import React from 'react'

/**
 * Dynamic description component for select fields.
 * Shows different descriptions based on the selected value.
 *
 * Falls back to static `admin.description` when:
 * - No `admin.custom.descriptions` is configured
 * - Current value has no matching description
 *
 * Configure via admin.custom.descriptions:
 * ```typescript
 * {
 *   name: 'type',
 *   type: 'select',
 *   options: [...],
 *   admin: {
 *     description: 'Default description shown when no match',
 *     custom: {
 *       descriptions: {
 *         optionValue1: 'Description for option 1',
 *         optionValue2: 'Description for option 2',
 *       },
 *     },
 *     components: {
 *       Description: '@/components/admin/SelectDescription',
 *     },
 *   },
 * }
 * ```
 */
export const SelectDescription: FieldDescriptionClientComponent<SelectFieldClient> = ({
  field,
  path,
}) => {
  const { value } = useField<string>({ path })

  const descriptions = field.admin?.custom?.descriptions as Record<string, string> | undefined
  const description = descriptions?.[value] ?? field.admin?.description

  return <FieldDescription description={description} path={path} />
}

export default SelectDescription
