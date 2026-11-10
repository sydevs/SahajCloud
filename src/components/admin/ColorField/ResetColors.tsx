'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button, useField } from '@payloadcms/ui'
import React from 'react'

import { isBrandColor } from '@/lib/clients/appearance'

/**
 * One button that puts a service's three brand colours back to the Atlas
 * defaults, shown while any of them is the service's own.
 *
 * It clears the columns rather than writing the defaults into them: an unset
 * colour is what follows a change to the defaults, and a copied one would not.
 * The paths are the `Clients` columns themselves, which sit in unnamed groups.
 */
const ResetColors: UIFieldClientComponent = () => {
  const color1 = useField<string | null>({ path: 'color1' })
  const color2 = useField<string | null>({ path: 'color2' })
  const color3 = useField<string | null>({ path: 'color3' })
  const fields = [color1, color2, color3]

  if (!fields.some((field) => isBrandColor(field.value))) return null

  return (
    <div className="field-type">
      <Button
        buttonStyle="secondary"
        margin={false}
        onClick={() => fields.forEach((field) => field.setValue(null))}
        size="small"
      >
        Reset colors to defaults
      </Button>
    </div>
  )
}

export default ResetColors
