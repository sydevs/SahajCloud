'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button, FieldDescription, TextInput, useField } from '@payloadcms/ui'
import React from 'react'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'

/**
 * Where Payload keeps the sign-in address. It is a top-level auth field, so it
 * cannot move into a tab — `mergeBaseFields` matches by name at the level it is
 * handed, and a copy in a tab sanitizes to a second field.
 */
const EMAIL_PATH = 'email'

/**
 * The account's email at the top of the Contact tab, read-only.
 *
 * Every notification goes to this address whatever the messaging handles below
 * it say, and the tab listed those and not this. Change takes the editor to the
 * field that owns it rather than editing a copy of the value.
 */
export const AccountEmail: UIFieldClientComponent = ({ field, path }) => {
  const { value } = useField<string>({ path: EMAIL_PATH })

  const goToSignInField = () => {
    const input = document.getElementById(`field-${EMAIL_PATH}`)
    if (!(input instanceof HTMLInputElement)) return
    input.scrollIntoView({ behavior: 'smooth', block: 'center' })
    input.focus({ preventScroll: true })
  }

  return (
    <TextInput
      AfterInput={
        <Button buttonStyle="secondary" margin={false} onClick={goToSignInField} size="small">
          Change
        </Button>
      }
      Description={
        <FieldDescription
          description="Every notification goes here. The handles below are for the methods that are not email."
          path={path}
        />
      }
      label="Email"
      path={path}
      readOnly
      style={mergeFieldStyles(field.admin)}
      value={value ?? ''}
    />
  )
}

export default AccountEmail
