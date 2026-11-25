'use client'

import type { SlugFieldClientProps, TextFieldClient, TextFieldClientProps } from 'payload'

import { FieldLabel, SlugField, TextInput, useAuth, useField } from '@payloadcms/ui'
import React from 'react'

import { fieldId } from '@/components/admin/helpers/fieldId'
import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'

const LockedSlugField: React.FC<TextFieldClientProps> = (props) => {
  const { field, path } = props
  const { name, label } = field as TextFieldClient
  const { user } = useAuth()
  const resolvedPath = path ?? name
  const { value } = useField<string>({ path: resolvedPath })
  const useAsSlug =
    (field.admin?.custom as { useAsSlug?: string } | undefined)?.useAsSlug ?? 'title'

  if (user?.collection === 'managers' && (user as { type?: string }).type === 'admin') {
    return <SlugField {...(props as unknown as SlugFieldClientProps)} useAsSlug={useAsSlug} />
  }

  return (
    <div className="field-type slug-field-component" style={mergeFieldStyles(field.admin)}>
      <div className="label-wrapper">
        <FieldLabel htmlFor={fieldId(resolvedPath)} label={label || undefined} />
      </div>
      <TextInput path={resolvedPath} readOnly value={value ?? ''} />
    </div>
  )
}

export default LockedSlugField
