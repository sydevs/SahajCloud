'use client'

import type { PayloadRequest } from 'payload'

import {
  Button,
  ConfirmationModal,
  TextareaInput,
  toast,
  useAuth,
  useConfig,
  useDocumentInfo,
  useFormFields,
  useModal,
} from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { relationId } from '@/lib/utilities/relationId'
import { isAdminManager } from '@/plugins/access/adminOnly'

export interface BlockUserButtonProps {
  /** Which edit view this sits in: a Registrant's own, or a submission's. */
  source: 'users' | 'submission'
}

interface BlockState {
  blockedAt: string | null
  blockedReason: string | null
}

const MODAL_SLUG = 'block-user'

/**
 * Block / Unblock beside Save, on a Registrant and on every submission one sent.
 *
 * An offer, not a permission: `POST /api/users/:id/block` gates on the admin
 * bypass itself. Shown to admins only, since no other manager could use it, and
 * hidden on an anonymous submission, which has nobody to block.
 *
 * On a submission the block state is the Registrant's, so it is read from
 * there; on a Registrant it is the form's own. Either way the page refreshes
 * after a change, because a block also moves this sender's open submissions to
 * spam — the row on screen among them.
 */
export const BlockUserButton: React.FC<BlockUserButtonProps> = ({ source }) => {
  const { user: me } = useAuth()
  const { id } = useDocumentInfo()
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const { openModal } = useModal()

  const submissionUser = useFormFields(([fields]) => fields.user?.value)
  const ownState = useFormFields(([fields]) => ({
    blockedAt: (fields.blockedAt?.value as string | null | undefined) ?? null,
    blockedReason: (fields.blockedReason?.value as string | null | undefined) ?? null,
  }))

  const userId = source === 'users' ? id : relationId(submissionUser)
  const [fetched, setFetched] = useState<BlockState | null>(null)
  const [reason, setReason] = useState('')

  const isAdmin = isAdminManager(me as PayloadRequest['user'])
  const usersApi = `${serverURL ?? ''}${api}/users`

  useEffect(() => {
    if (source !== 'submission' || userId == null || !isAdmin) return
    let cancelled = false
    fetch(`${usersApi}/${userId}?depth=0&select[blockedAt]=true&select[blockedReason]=true`, {
      credentials: 'include',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((doc: Partial<BlockState> | null) => {
        if (cancelled || !doc) return
        setFetched({ blockedAt: doc.blockedAt ?? null, blockedReason: doc.blockedReason ?? null })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isAdmin, source, userId, usersApi])

  const state = source === 'users' ? ownState : fetched
  if (!isAdmin || userId == null || state == null) return null

  const blocked = state.blockedAt != null

  const submit = async () => {
    const response = await fetch(`${usersApi}/${userId}/block`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocked: !blocked,
        ...(!blocked && reason.trim() ? { reason: reason.trim() } : {}),
        ...(source === 'submission' && typeof id === 'number' ? { submission: id } : {}),
      }),
    })
    const body = (await response.json().catch(() => null)) as {
      markedSpam?: number
      errors?: { message: string }[]
    } | null

    if (!response.ok) {
      toast.error(body?.errors?.[0]?.message ?? 'The block could not be saved.')
      return
    }

    toast.success(
      blocked
        ? 'Sender unblocked.'
        : `Sender blocked${body?.markedSpam ? `; ${body.markedSpam} submission${body.markedSpam === 1 ? '' : 's'} marked as spam` : ''}.`,
    )
    router.refresh()
  }

  return (
    <>
      <Button
        buttonStyle={blocked ? 'secondary' : 'error'}
        margin={false}
        size="medium"
        onClick={() => {
          setReason(state.blockedReason ?? '')
          openModal(MODAL_SLUG)
        }}
      >
        {blocked ? 'Unblock User' : 'Block User'}
      </Button>
      <ConfirmationModal
        modalSlug={MODAL_SLUG}
        heading={blocked ? 'Unblock this sender?' : 'Block this sender?'}
        confirmLabel={blocked ? 'Unblock' : 'Block'}
        confirmingLabel={blocked ? 'Unblocking…' : 'Blocking…'}
        onConfirm={submit}
        body={
          blocked ? (
            <p>
              Their next submission is screened as usual. Submissions already marked as spam stay
              that way, and the reason is kept on their record.
            </p>
          ) : (
            <>
              <p>
                Nothing they send is delivered while blocked.
                {source === 'submission' ? ' This submission' : ' Their submissions'} still awaiting
                a decision will be marked as spam; delivered history is left alone.
              </p>
              <TextareaInput
                path="blockReason"
                label="Reason"
                description="For whoever reads their record next."
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </>
          )
        }
      />
    </>
  )
}

export default BlockUserButton
