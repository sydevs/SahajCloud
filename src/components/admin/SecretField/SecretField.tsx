'use client'

import type { TextFieldClientComponent } from 'payload'

import {
  Button,
  FieldDescription,
  FieldError,
  Modal,
  TextInput,
  useDocumentInfo,
  useField,
  useForm,
  useModal,
} from '@payloadcms/ui'
import { PlusIcon } from '@payloadcms/ui/icons/Plus'
import { RefreshIcon } from '@payloadcms/ui/icons/Refresh'
import React, { useCallback, useEffect, useState } from 'react'

import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import type { SecretControlConfig, SecretStaged, SecretStatus } from '@/fields/secretField/types'
import { REMOVE, STAGE_PREFIX } from '@/fields/secretField/types'

import './styles.css'

const MASK = '•'.repeat(20)

/**
 * The control for a `secretField`, drawn as Payload's own API-key field: a
 * masked, disabled input with a button on its end.
 *
 * Its form value is an instruction, never the secret — empty (keep), `remove`,
 * or `stage:<token>` for a value the set modal staged on the server. The
 * document's own Save applies it, so setting or removing a secret changes
 * nothing until then, and the secret never enters form state.
 *
 * Not built from Payload's `APIKey`: that is not exported, and is hard-wired to
 * the auth `apiKey` path, its reveal route and a PATCH of the document.
 */
export const SecretField: TextFieldClientComponent = ({ field, path }) => {
  const config = field.admin?.custom?.secret as SecretControlConfig
  const { value: change, setValue } = useField<string | null>({ path })
  const { collectionSlug, id, savedDocumentData } = useDocumentInfo()
  const { getDataByPath } = useForm()
  const { closeModal, isModalOpen, openModal } = useModal()
  /** `null` until the status answers; `'unknown'` when it could not be read. */
  const [status, setStatus] = useState<SecretStatus | 'unknown' | null>(null)

  const parentPath = path.split('.').slice(0, -1).join('.')
  const at = (name: string) => (parentPath ? `${parentPath}.${name}` : name)
  const modalSlug = `secret-${path}`
  const endpoint =
    id == null ? null : `/api/${collectionSlug}/${id}/secrets/${at(config.secretName)}`

  // Re-read after every save, which is when an instruction is applied.
  // (`lastUpdateTime` also moves on the document-lock heartbeat.)
  const savedAt = savedDocumentData?.updatedAt
  useEffect(() => {
    if (!endpoint) return
    let current = true
    void fetch(endpoint, { credentials: 'include' })
      .then(async (response) =>
        response.ok ? ((await response.json()) as SecretStatus) : ('unknown' as const),
      )
      .catch(() => 'unknown' as const)
      .then((body) => {
        if (current) setStatus(body)
      })
    return () => {
      current = false
    }
  }, [endpoint, savedAt])

  const staged = typeof change === 'string' && change.startsWith(STAGE_PREFIX)
  const removing = change === REMOVE
  const onStaged = useCallback(
    ({ token }: SecretStaged) => {
      setValue(`${STAGE_PREFIX}${token}`)
      closeModal(modalSlug)
    },
    [closeModal, modalSlug, setValue],
  )

  const label = config.label
  const style = mergeFieldStyles(field.admin)

  if (!endpoint) {
    return (
      <TextInput
        className="secret-field"
        label={label}
        path={path}
        placeholder="Save this page first"
        readOnly
        style={style}
        value=""
      />
    )
  }

  const stored = status && status !== 'unknown' ? status.last4 : null
  // A staged value shows the mask alone: nothing but its token is kept client-side.
  const has = staged || (!removing && stored !== null)
  const action = has ? `Replace ${label}` : `Set ${label}`
  const description = staged
    ? `New ${label} — it is saved when you save this page.`
    : removing
      ? `The ${label} is removed when you save this page.`
      : stored !== null
        ? 'Stored encrypted. It cannot be shown again.'
        : status === 'unknown'
          ? `We could not check whether a ${label} is set. Reload to try again.`
          : status === null
            ? ''
            : `No ${label} is set.`

  return (
    <>
      <TextInput
        AfterInput={
          <Button
            aria-label={action}
            buttonStyle="none"
            className="secret-field__set-button"
            icon={has ? <RefreshIcon /> : <PlusIcon />}
            onClick={() => openModal(modalSlug)}
            tooltip={action}
          />
        }
        className={['secret-field', (staged || removing) && 'secret-field--pending']
          .filter(Boolean)
          .join(' ')}
        Description={
          <div className="secret-field__footer">
            <FieldDescription description={description} path={path} />
            {staged || removing ? (
              <Button buttonStyle="secondary" onClick={() => setValue(null)} size="small">
                Undo
              </Button>
            ) : stored !== null ? (
              <Button
                buttonStyle="secondary"
                className="secret-field__remove-button"
                onClick={() => setValue(REMOVE)}
                size="small"
              >
                {`Remove ${label}`}
              </Button>
            ) : null}
          </div>
        }
        label={label}
        path={path}
        placeholder={removing ? 'Removed on save' : 'Not set'}
        readOnly
        style={style}
        value={staged ? MASK : has ? `${MASK}${stored}` : ''}
      />
      <Modal
        className="confirmation-modal secret-field__modal"
        closeOnBlur={false}
        slug={modalSlug}
      >
        {isModalOpen(modalSlug) ? (
          <StageForm
            config={config}
            endpoint={endpoint}
            heading={action}
            onCancel={() => closeModal(modalSlug)}
            onStaged={onStaged}
            siblings={() =>
              Object.fromEntries(config.dependsOn.map((name) => [name, getDataByPath(at(name))]))
            }
          />
        ) : null}
      </Modal>
    </>
  )
}

interface StageFormProps {
  config: SecretControlConfig
  endpoint: string
  heading: string
  onCancel: () => void
  onStaged: (staged: SecretStaged) => void
  /** The form's current values for `dependsOn`, read at submit. */
  siblings: () => Record<string, unknown>
}

function StageForm({
  config,
  endpoint,
  heading,
  onCancel,
  onStaged,
  siblings,
}: StageFormProps): React.ReactElement {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = async () => {
    if (checking || value.trim() === '') return
    setError(null)
    setChecking(true)
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ siblings: siblings(), value: value.trim() }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok) {
        // A refusal carries the checker's own words; anything else — a 500, an
        // HTML error page — has no body worth reading.
        const body = await response.json().catch(() => null)
        setError(
          (body as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message ??
            `That ${config.label} was refused.`,
        )
        return
      }
      onStaged((await response.json()) as SecretStaged)
    } catch {
      setError('We could not reach the server. Try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="confirmation-modal__wrapper">
      <div className="confirmation-modal__content">
        <h1>{heading}</h1>
        {config.setDescription ? <p>{config.setDescription}</p> : null}
        <p>It is stored encrypted, and saved when you save this page.</p>
      </div>
      <TextInput
        Error={<FieldError message={error ?? undefined} showError={Boolean(error)} />}
        htmlAttributes={{ autoComplete: 'off' }}
        label={config.label}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          setValue(event.target.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
        }}
        path="secretFieldValue"
        readOnly={checking}
        showError={Boolean(error)}
        value={value}
      />
      <div className="confirmation-modal__controls">
        <Button buttonStyle="secondary" disabled={checking} onClick={onCancel} size="large">
          Cancel
        </Button>
        <Button
          disabled={checking || value.trim() === ''}
          onClick={() => void submit()}
          size="large"
        >
          {checking ? 'Checking…' : 'Use this key'}
        </Button>
      </div>
    </div>
  )
}

export default SecretField
