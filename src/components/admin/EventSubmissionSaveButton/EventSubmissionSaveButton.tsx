'use client'

import { Button, SaveButton, toast, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'

const OPEN_STATUSES = new Set(['screening', 'pending'])

/**
 * Replaces the default Save button on an Event Submission's edit view with
 * **Accept** / **Reject** while the submission is still open:
 *
 * Both call the review endpoint directly. Neither saves the form first: the
 * submission is a proposal to judge, not a document to edit — the only
 * editable field is `region`, which a reviewer saves with the normal Save
 * button before deciding.
 *
 * Terminal submissions (spam / created / updated / rejected) get the default
 * Save button back, so an admin can still correct record-keeping fields.
 */
const EventSubmissionSaveButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const router = useRouter()
  const status = useFormFields(([fields]) => fields?.status?.value as string | undefined)
  const [busy, setBusy] = useState<null | 'accept' | 'reject'>(null)

  const review = useCallback(
    async (action: 'accept' | 'reject') => {
      if (!id || busy) return
      if (action === 'reject' && !window.confirm('Reject this submission?')) return
      setBusy(action)
      try {
        const response = await fetch(`/api/event-submissions/${id}/review`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const body = (await response.json().catch(() => null)) as {
          status?: string
          errors?: { message?: string }[]
        } | null
        if (!response.ok) {
          toast.error(body?.errors?.[0]?.message ?? 'Could not apply the review.')
          return
        }
        toast.success(
          body?.status === 'created'
            ? 'Accepted — event created and published as unverified.'
            : body?.status === 'updated'
              ? 'Accepted — changes applied to the event.'
              : 'Submission rejected.',
        )
        router.refresh()
      } catch {
        toast.error('Could not apply the review.')
      } finally {
        setBusy(null)
      }
    },
    [id, busy, router],
  )

  // New (unsaved) docs and terminal submissions keep the normal Save button.
  if (!id || !status || !OPEN_STATUSES.has(status)) return <SaveButton />

  return (
    <div style={{ display: 'flex', gap: 'calc(var(--base) * 0.4)' }}>
      <Button onClick={() => review('reject')} buttonStyle="secondary" disabled={busy !== null}>
        {busy === 'reject' ? 'Rejecting…' : 'Reject'}
      </Button>
      <Button onClick={() => review('accept')} disabled={busy !== null}>
        {busy === 'accept' ? 'Accepting…' : 'Accept'}
      </Button>
    </div>
  )
}

export default EventSubmissionSaveButton
