'use client'

import type { UIFieldClientComponent } from 'payload'

import {
  Button,
  Drawer,
  FieldLabel,
  TextInput,
  useDocumentInfo,
  useField,
  useModal,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import type { MailingListKeyStatus } from '@/collections/Clients/endpoints/mailingListKey'
import { MAILING_LIST_PROVIDER_LABELS } from '@/lib/mailingList/types'

const DRAWER_SLUG = 'mailing-list-key'

/**
 * The Atlas tab's control for a service's mailing-list provider key.
 *
 * The key is write-only (`secretField`), so nothing here can show it: the hint
 * reports whether one is stored and its last four characters, from
 * `GET /api/clients/:id/mailing-list-key`.
 *
 * ⚠ **The drawer shows the credentials the key will be proven against rather
 * than re-editing them.** They are the form's own unsaved values, which the
 * endpoint stores beside the key — so the next form save carries identical
 * values and `validateMailingList` has nothing to re-prove, with one editor for
 * each credential instead of two.
 */
export const MailingListKeyField: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const { closeModal, openModal } = useModal()
  const [status, setStatus] = useState<MailingListKeyStatus | null>(null)

  const provider = useField<string>({ path: 'mailingList.provider' }).value
  const listId = useField<string>({ path: 'mailingList.listId' }).value
  const clientId = useField<string>({ path: 'mailingList.clientId' }).value
  const doiFlowId = useField<string>({ path: 'mailingList.doiFlowId' }).value
  const doubleOptIn = useField<boolean>({ path: 'mailingList.doubleOptIn' }).value

  const endpoint = id == null ? null : `/api/clients/${id}/mailing-list-key`

  const loadStatus = useCallback(async () => {
    if (!endpoint) return
    const response = await fetch(endpoint, { credentials: 'include' })
    setStatus(response.ok ? ((await response.json()) as MailingListKeyStatus) : null)
  }, [endpoint])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const onStored = useCallback(() => {
    closeModal(DRAWER_SLUG)
    void loadStatus()
  }, [closeModal, loadStatus])

  if (!endpoint) return null

  return (
    <div className="field-type">
      <FieldLabel label="API Key" />
      <p>
        {status?.set
          ? `Key set, ending ••••${status.last4}`
          : 'No key set — nothing is sent until you add one.'}
      </p>
      <Button buttonStyle="secondary" onClick={() => openModal(DRAWER_SLUG)}>
        {status?.set ? 'Replace key' : 'Set key'}
      </Button>
      {/* Mounted unconditionally so it animates open (docs/rules/admin-ui.md). */}
      <Drawer slug={DRAWER_SLUG} title="Mailing list API key">
        <KeyForm
          credentials={{ clientId, doiFlowId, doubleOptIn, listId, provider }}
          endpoint={endpoint}
          onStored={onStored}
        />
      </Drawer>
    </div>
  )
}

interface KeyFormProps {
  credentials: {
    clientId?: string
    doiFlowId?: string
    doubleOptIn?: boolean
    listId?: string
    provider?: string
  }
  endpoint: string
  onStored: () => void
}

function KeyForm({ credentials, endpoint, onStored }: KeyFormProps): React.ReactElement {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { listId, provider } = credentials
  const providerLabel =
    MAILING_LIST_PROVIDER_LABELS[provider as keyof typeof MAILING_LIST_PROVIDER_LABELS]

  const submit = async () => {
    setError(null)
    setSaving(true)
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ ...credentials, apiKey }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!response.ok) {
        // A refusal is the provider's own words; anything else — a 500, an HTML
        // error page — has no body worth reading, and reading it first is how a
        // failed save showed nothing at all.
        const body = await response.json().catch(() => null)

        setError(
          (body as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message ??
            'That key was refused.',
        )
        return
      }

      setApiKey('')
      onStored()
    } catch {
      setError('We could not reach the server. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!providerLabel || !listId) {
    return <p>Choose a provider and a list on the form, then come back.</p>
  }

  return (
    <div>
      <p>{`We check this key against ${providerLabel} list ${listId} before storing it.`}</p>
      <TextInput
        htmlAttributes={{ autoComplete: 'off' }}
        label="API Key"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value)}
        path="mailingListApiKey"
        value={apiKey}
      />
      {error ? <p className="field-error">{error}</p> : null}
      <Button disabled={saving || apiKey === ''} onClick={() => void submit()}>
        {saving ? 'Checking…' : 'Save key'}
      </Button>
    </div>
  )
}

export default MailingListKeyField
