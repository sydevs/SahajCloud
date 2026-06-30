'use client'

import { useDocumentInfo, useField, useForm, useFormInitializing } from '@payloadcms/ui'
import { useSearchParams } from 'next/navigation'
import React, { useEffect, useRef } from 'react'

/**
 * Seeds a new region's `level` + `parent` from `?childLevel` / `?parent` in the
 * URL. The Atlas sidebar's "add child region" (+) buttons link to the create
 * form with those params, and Payload has no native query-param prefill — so
 * this `ui`-field component applies them once, on create only, then renders
 * nothing. No-op on an existing document or a plain create with no params.
 *
 * Waits until the form finishes initializing (an earlier write is clobbered by
 * the initial server form-state merge), seeds `parent` in the data via
 * `dispatchFields`, then sets `level` through its own `useField().setValue` —
 * which is what reveals the conditional `parent` field and re-syncs server form
 * state (preserving the seeded parent), exactly as `AddressSearchField` does.
 */
export const RegionCreatePrefill: React.FC = () => {
  const { id } = useDocumentInfo()
  const initializing = useFormInitializing()
  const searchParams = useSearchParams()
  const { dispatchFields } = useForm()
  const { setValue: setLevel } = useField<string>({ path: 'level' })
  const applied = useRef(false)

  useEffect(() => {
    if (applied.current || id || initializing) return
    const parent = searchParams.get('parent')
    const childLevel = searchParams.get('childLevel')
    if (!parent || !childLevel) return
    applied.current = true
    dispatchFields({ type: 'UPDATE', path: 'parent', value: Number(parent) })
    setLevel(childLevel)
  }, [id, initializing, searchParams, dispatchFields, setLevel])

  return null
}

export default RegionCreatePrefill
