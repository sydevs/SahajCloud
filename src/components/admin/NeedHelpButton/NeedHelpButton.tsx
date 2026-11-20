'use client'

import { Button } from '@payloadcms/ui'
import React from 'react'

import { CONTACT_EMAIL } from '@/lib/contact'

/** "Need help?" in the admin header: a `mailto:` to the support address. */
export function NeedHelpButton(): React.ReactElement {
  return (
    <Button
      buttonStyle="secondary"
      el="anchor"
      margin={false}
      size="small"
      url={`mailto:${CONTACT_EMAIL}`}
    >
      Need help?
    </Button>
  )
}

export default NeedHelpButton
