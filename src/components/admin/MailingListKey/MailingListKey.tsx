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

import type { MailingListProvider } from '@/lib/mailingList/types'
import { CREDENTIAL_KEYS, MAILING_LIST_PROVIDER_LABELS } from '@/lib/mailingList/types'

const DRAWER_SLUG = 'mailing-list-key'

/** Shown where the refusal carries no words of its own. */
const SAVE_FAILED = 'The key could not be saved.'

/** Where the operator finds the secret, in each provider's own words. */
const KEY_SOURCE: Record<MailingListProvider, string> = {
  brevo: 'The API key from your Brevo account, under SMTP & API.',
  cleverreach: 'Your CleverReach app’s Client Secret, from Account → Extras → REST API.',
  klaviyo: 'A private API key from your Klaviyo account, under Settings → API keys.',
  mailchimp: 'An API key from your Mailchimp account, under Account → Extras → API keys.',
}

export interface MailingListKeyProps {
  /** The last characters of the stored key, or `null` while none is set. */
  readonly last4: null | string
  readonly style: React.CSSProperties
}

/**
 * The credential fields the key is proven alongside, as the form holds them.
 * Read off `CREDENTIAL_KEYS` rather than listed again: a field the drawer did
 * not send is proven against the stored value while the operator looks at a
 * new one.
 *
 * ⚠ **A field the provider does not show holds `null`, not nothing.** Form
 * state carries every declared field whatever `admin.condition` says, so the
 * nulls are dropped here — the endpoint's patch leaves the stored value alone
 * for every key it omits, and `null` would clear one.
 */
const useCredentials = (): Record<string, unknown> =>
  useFormFields(([fields]) =>
    Object.fromEntries(
      CREDENTIAL_KEYS.filter((key) => key !== 'apiKey')
        .map((key) => [key, fields[`mailingList.${key}`]?.value])
        .filter(([, value]) => value != null),
    ),
  )

/**
 * Whether a mailing-list key is set, and the drawer that replaces it.
 *
 * ⚠ **The key never enters form state, in either direction.** That is what
 * `secretField` buys: form state is what Payload posts into a live-preview
 * iframe and what a save writes back, and a provider secret belongs in
 * neither. So this holds the typed key in its own state, sends it to
 * `POST /api/clients/:id/mailing-list-key`, and remembers only the last four
 * characters afterwards.
 *
 * The provider and list are shown rather than edited: the endpoint proves the
 * key against exactly the values the form holds, and saves them with it, so the
 * next form save finds nothing changed and skips the provider round trip.
 */
export const MailingListKey: React.FC<MailingListKeyProps> = ({ last4: stored, style }) => {
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
        body: JSON.stringify({ ...credentials, apiKey: key }),
      })
      const body = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null

      if (!response.ok) {
        setFailure(body?.errors?.[0]?.message ?? SAVE_FAILED)
        return
      }

      setLast4(key.slice(-4))
      setKey('')
      closeModal(DRAWER_SLUG)
      // Not "we checked it": a provider that could not be reached never
      // refuses the save, so the key may have gone in unproven.
      toast.success('Key saved.')
    } catch {
      // A rejected `fetch` — offline, DNS, a dropped connection — has no
      // response to quote, and leaving `failure` null re-enables the button
      // over an empty drawer.
      setFailure(SAVE_FAILED)
    } finally {
      setSaving(false)
    }
  }

  const provider = credentials.provider as MailingListProvider | undefined
  const listId = credentials.listId as string | undefined
  const providerLabel = provider ? MAILING_LIST_PROVIDER_LABELS[provider] : 'your provider'

  return (
    <div className="field-type" style={style}>
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
          {provider ? KEY_SOURCE[provider] : 'The secret from your mailing-list account.'}{' '}
          {`We check it with ${providerLabel} before storing it, and it is never sent to your website.`}
        </p>
        <p>
          {listId
            ? `It will be checked against ${providerLabel} list ${listId}, which is saved with it.`
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
          disabled={saving || key.trim() === '' || !listId}
          onClick={save}
        >
          {saving ? 'Checking…' : 'Save key'}
        </Button>
      </Drawer>
    </div>
  )
}

export default MailingListKey
