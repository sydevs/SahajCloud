'use client'

import type { UIFieldClientComponent } from 'payload'

import {
  Button,
  FieldDescription,
  FieldError,
  FieldLabel,
  Modal,
  TextInput,
  useDocumentInfo,
  useField,
  useModal,
} from '@payloadcms/ui'
import { RefreshIcon } from '@payloadcms/ui/icons/Refresh'
import React, { useCallback, useEffect, useState } from 'react'

import type { MailingListKeyStatus } from '@/collections/Clients/endpoints/mailingListKey'
import { MAILING_LIST_PROVIDER_LABELS } from '@/lib/mailingList/types'

import './styles.css'

const MODAL_SLUG = 'mailing-list-key'
const MASK = '•'.repeat(20)

/**
 * The Atlas tab's control for a service's mailing-list provider key.
 *
 * Drawn as Payload's own API-key field — a masked, disabled input with a
 * regenerate button on its end — but not built from it: `APIKey` is not
 * exported, and it is hard-wired to the auth `apiKey` path, the reveal route
 * and a PATCH of the document. The key is write-only (`secretField`), so the
 * input shows only its last four characters, from
 * `GET /api/clients/:id/mailing-list-key`.
 *
 * ⚠ **The modal states the credentials the key will be proven against rather
 * than re-editing them.** They are the form's own unsaved values, which the
 * endpoint stores beside the key — so the next form save carries identical
 * values and `validateMailingList` has nothing to re-prove.
 */
export const MailingListKeyField: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const { closeModal, isModalOpen, openModal } = useModal()
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
    closeModal(MODAL_SLUG)
    void loadStatus()
  }, [closeModal, loadStatus])

  if (!endpoint) return null

  const label = status?.set ? 'Replace API key' : 'Set API key'

  return (
    <div className="field-type text read-only mailing-list-key">
      <FieldLabel htmlFor="mailingListApiKeyStatus" label="API Key" />
      <div className="field-type__wrap">
        <div className="mailing-list-key__input-wrap">
          <input
            aria-label="API Key"
            disabled
            id="mailingListApiKeyStatus"
            placeholder="No key set"
            type="text"
            value={status?.set ? `${MASK}${status.last4}` : ''}
          />
          <Button
            aria-label={label}
            buttonStyle="none"
            className="mailing-list-key__replace-button"
            icon={<RefreshIcon />}
            onClick={() => openModal(MODAL_SLUG)}
            tooltip={label}
          />
        </div>
        <FieldDescription
          description={
            status?.set
              ? 'Stored encrypted. It cannot be shown again — replace it to change it.'
              : 'Nothing is sent to your list until a key is set.'
          }
          path="mailingList.apiKeyControl"
        />
      </div>
      <Modal className="confirmation-modal" closeOnBlur={false} slug={MODAL_SLUG}>
        {isModalOpen(MODAL_SLUG) ? (
          <KeyForm
            credentials={{ clientId, doiFlowId, doubleOptIn, listId, provider }}
            endpoint={endpoint}
            heading={label}
            onCancel={() => closeModal(MODAL_SLUG)}
            onStored={onStored}
          />
        ) : null}
      </Modal>
    </div>
  )
}

interface KeyFormProps {
  credentials: {
    clientId?: string | null
    doiFlowId?: string | null
    doubleOptIn?: boolean | null
    listId?: string | null
    provider?: string | null
  }
  endpoint: string
  heading: string
  onCancel: () => void
  onStored: () => void
}

function KeyForm({
  credentials,
  endpoint,
  heading,
  onCancel,
  onStored,
}: KeyFormProps): React.ReactElement {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { listId, provider } = credentials
  const providerLabel =
    MAILING_LIST_PROVIDER_LABELS[provider as keyof typeof MAILING_LIST_PROVIDER_LABELS]
  const ready = Boolean(providerLabel && listId)

  const submit = async () => {
    if (saving || apiKey.trim() === '') return
    setError(null)
    setSaving(true)
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ ...credentials, apiKey: apiKey.trim() }),
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

      onStored()
    } catch {
      setError('We could not reach the server. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="confirmation-modal__wrapper">
      <div className="confirmation-modal__content">
        <h1>{heading}</h1>
        {ready ? (
          <>
            <p>
              {`We check this key against ${providerLabel} list ${listId} before storing it. ` +
                'Saving it also saves this mailing list’s settings, and switches the list on.'}
            </p>
            <p>
              {provider === 'cleverreach'
                ? 'Paste your CleverReach app’s Client Secret. It is stored encrypted and never sent to your website.'
                : 'It is stored encrypted and never sent to your website.'}
            </p>
          </>
        ) : (
          <p>Choose a provider and a list on the form first.</p>
        )}
      </div>
      {ready ? (
        <TextInput
          Error={<FieldError message={error ?? undefined} showError={Boolean(error)} />}
          htmlAttributes={{ autoComplete: 'off' }}
          label="API Key"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setApiKey(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          path="mailingListApiKey"
          readOnly={saving}
          showError={Boolean(error)}
          value={apiKey}
        />
      ) : null}
      <div className="confirmation-modal__controls">
        <Button buttonStyle="secondary" disabled={saving} onClick={onCancel} size="large">
          Cancel
        </Button>
        {ready ? (
          <Button
            disabled={saving || apiKey.trim() === ''}
            onClick={() => void submit()}
            size="large"
          >
            {saving ? 'Checking…' : 'Save key'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default MailingListKeyField
