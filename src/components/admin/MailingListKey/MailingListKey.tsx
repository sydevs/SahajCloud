'use client'

import {
  Button,
  Drawer,
  FieldLabel,
  TextInput,
  toast,
  useConfig,
  useDocumentInfo,
  useFormFields,
  useModal,
} from '@payloadcms/ui'
import React, { useState } from 'react'

import { MAILING_LIST_PROVIDER_LABELS } from '@/lib/mailingList/types'
import type { MailingListProvider } from '@/lib/mailingList/types'

const DRAWER_SLUG = 'mailing-list-key'

export interface MailingListKeyProps {
  /** The last characters of the stored key, or `null` while none is set. */
  readonly last4: null | string
}

/** The credential fields the key is proven alongside, as the form holds them. */
const useCredentials = () =>
  useFormFields(([fields]) => ({
    clientId: fields['mailingList.clientId']?.value as null | string | undefined,
    doiFlowId: fields['mailingList.doiFlowId']?.value as null | string | undefined,
    doubleOptIn: fields['mailingList.doubleOptIn']?.value as boolean | null | undefined,
    listId: fields['mailingList.listId']?.value as null | string | undefined,
    provider: fields['mailingList.provider']?.value as MailingListProvider | null | undefined,
  }))

/**
 * ⚠ **A field the provider does not show holds `null`, not nothing.** Form state
 * carries every declared field whatever `admin.condition` says, so sending the
 * object as it stands posts `clientId: null` for a Brevo list — which the
 * endpoint refuses, and which would read as "clear the stored one" if it did
 * not. What is absent here is what the stored row keeps.
 */
const posted = (credentials: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(credentials).filter(([, value]) => value != null))

/**
 * Whether a mailing-list key is set, and the drawer that replaces it.
 *
 * ⚠ **The key never enters form state, in either direction.** That is the whole
 * point of the field being `secretField`: Payload posts form state into the live
 * preview iframe on every change, and a provider secret must not be in it. So
 * this holds the typed key in its own state, sends it to
 * `POST /api/clients/:id/mailing-list-key`, and remembers only the last four
 * characters afterwards.
 *
 * The provider and list are shown rather than edited: the endpoint proves the
 * key against exactly the values the form holds, and saves them with it, so the
 * next form save finds nothing changed and skips the provider round trip.
 */
export const MailingListKey: React.FC<MailingListKeyProps> = ({ last4: stored }) => {
  const { id } = useDocumentInfo()
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const { closeModal, openModal } = useModal()
  const credentials = useCredentials()

  const [last4, setLast4] = useState(stored)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<null | string>(null)

  const save = async () => {
    setSaving(true)
    setFailure(null)
    try {
      const response = await fetch(`${serverURL ?? ''}${api}/clients/${id}/mailing-list-key`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...posted(credentials), apiKey: key }),
      })
      const body = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null

      if (!response.ok) {
        setFailure(body?.errors?.[0]?.message ?? 'The key could not be saved.')
        return
      }

      setLast4(key.slice(-4))
      setKey('')
      closeModal(DRAWER_SLUG)
      toast.success('Key saved — we checked it with your provider.')
    } finally {
      setSaving(false)
    }
  }

  const providerLabel = credentials.provider
    ? MAILING_LIST_PROVIDER_LABELS[credentials.provider]
    : 'your provider'

  return (
    <div className="field-type">
      <FieldLabel label="API Key" />
      <p>
        {last4
          ? `A key is set, ending ••••${last4}.`
          : 'No key set — nothing is sent until you add one.'}
      </p>
      <Button
        buttonStyle="secondary"
        margin={false}
        onClick={() => {
          setKey('')
          setFailure(null)
          openModal(DRAWER_SLUG)
        }}
        size="small"
      >
        {last4 ? 'Replace key' : 'Set key'}
      </Button>
      {/* Mounted whatever the drawer's state, or it opens without animating
          (`docs/rules/admin-ui.md`). */}
      <Drawer slug={DRAWER_SLUG} title={last4 ? 'Replace the API key' : 'Set the API key'}>
        <p>
          {credentials.provider === 'cleverreach'
            ? 'Your CleverReach app’s Client Secret, from Account → Extras → REST API.'
            : `The secret from your ${providerLabel} account.`}{' '}
          {`We check it with ${providerLabel} before storing it, and it is never sent to your website.`}
        </p>
        <p>
          {credentials.listId
            ? `It will be checked against ${providerLabel} list ${credentials.listId}, which is saved with it.`
            : 'Fill in the list ID above first — a key can only be checked against the list it will be used with.'}
        </p>
        <TextInput
          label="API Key"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setKey(event.target.value)}
          path="mailingListKeyInput"
          showError={Boolean(failure)}
          value={key}
        />
        {failure ? <p className="field-error">{failure}</p> : null}
        <Button
          buttonStyle="primary"
          disabled={saving || key.trim() === '' || !credentials.listId}
          onClick={save}
        >
          {saving ? 'Checking…' : 'Save key'}
        </Button>
      </Drawer>
    </div>
  )
}

export default MailingListKey
