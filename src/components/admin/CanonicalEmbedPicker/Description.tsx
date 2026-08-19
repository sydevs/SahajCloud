'use client'

import type { FieldDescriptionClientComponent, TextFieldClient } from 'payload'

import { Banner, useAllFormFields, useField } from '@payloadcms/ui'
import React, { useMemo, useState } from 'react'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification } from '@/lib/clients/verification'

import { buildPickerModel } from './model'

/**
 * What the chosen embed actually means: its routing mode, the shape of URL it
 * yields, and how long ago the CMS last confirmed it by loading the page.
 *
 * The sample URL is the point of this component. A WordPress mount is already
 * `/?p=123`, so the Atlas parameter has to join with `&` — seeing the finished
 * URL before saving is what catches a bad choice, and it is the one thing three
 * hand-typed fields never showed anyone.
 */
const CanonicalEmbedDescription: FieldDescriptionClientComponent<TextFieldClient> = ({ path }) => {
  const { value } = useField<string>({ path })
  const [formState] = useAllFormFields()
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<string | null>(null)

  const embedMetadata = formState['embedMetadata']?.value as EmbedMetadata | undefined
  const verification = formState['canonical.verification']?.value as
    | CanonicalVerification
    | undefined
  const clientId = formState['id']?.value as number | string | undefined

  const model = useMemo(
    () => buildPickerModel({ embedMetadata, embed: value, verification, now: new Date() }),
    [embedMetadata, value, verification],
  )

  const selected = model.selected
  if (!selected) return null

  const verifyNow = async () => {
    if (clientId == null) return
    setChecking(true)
    setCheckResult(null)
    try {
      const response = await fetch(`/api/clients/${clientId}/verify-embed`, { method: 'POST' })
      const body = (await response.json()) as { message?: string }
      setCheckResult(body.message ?? 'Verification finished.')
    } catch {
      setCheckResult('Could not reach the verification service.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 'calc(var(--base) * 0.4)' }}>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '0 calc(var(--base) * 0.6)',
          margin: 0,
          color: 'var(--theme-elevation-600)',
        }}
      >
        <dt>Routing</dt>
        <dd style={{ margin: 0 }}>
          {selected.routing === 'path' ? 'Path segment' : 'Query parameter'}
        </dd>

        <dt>Example URL</dt>
        <dd style={{ margin: 0, wordBreak: 'break-all' }}>
          <code>{selected.sampleUrl ?? '—'}</code>
          {selected.sampleIsProvisional && ' (as reported — not yet verified)'}
        </dd>

        <dt>Last verified</dt>
        <dd style={{ margin: 0 }}>{selected.verifiedAge ?? 'never'}</dd>
      </dl>

      {selected.cautions.map((caution) => (
        <Banner key={caution} type="error">
          {caution}
        </Banner>
      ))}

      {selected.failureCount > 0 && (
        <Banner type="error">
          {`Failed verification ${selected.failureCount}× in a row. Canonical ownership switches off automatically after 3.`}
        </Banner>
      )}

      <div>
        <button
          className="btn btn--style-secondary btn--size-small"
          disabled={checking || clientId == null}
          onClick={verifyNow}
          type="button"
        >
          {checking ? 'Verifying…' : 'Verify now'}
        </button>
        {checkResult && <span style={{ marginLeft: 'var(--base)' }}>{checkResult}</span>}
      </div>
    </div>
  )
}

export default CanonicalEmbedDescription
