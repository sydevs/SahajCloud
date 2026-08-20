'use client'

import {
  Button,
  SaveButton,
  toast,
  useDocumentInfo,
  useForm,
  useFormFields,
  useFormModified,
} from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'

import type { SubmissionStatus } from '@/collections/EventSubmissions/statuses'
import {
  OPEN_SUBMISSION_STATUSES,
  REOPENABLE_STATUSES,
} from '@/collections/EventSubmissions/statuses'

// The same sets the review op enforces server-side, from the leaf module both
// can import — a button offered for a status `applyReview` would refuse is a
// promise the UI can't keep.
const OPEN = new Set<SubmissionStatus>(OPEN_SUBMISSION_STATUSES)
const REOPENABLE = new Set<SubmissionStatus>(REOPENABLE_STATUSES)

type Action = 'accept' | 'reject' | 'reopen' | 'delete'

const CONFIRM: Partial<Record<Action, string>> = {
  reject: 'Reject this submission?',
  delete: 'Delete this submission? The event it created is not affected.',
}

const DONE: Record<Action, (status?: string) => string> = {
  accept: (status) =>
    status === 'created'
      ? 'Accepted — event created and published as unverified.'
      : 'Accepted — changes applied to the event.',
  reject: () => 'Submission rejected.',
  reopen: () => 'Reopened — back to pending review.',
  delete: () => 'Submission deleted.',
}

/**
 * Replaces the default Save button on an Event Submission with the actions
 * that actually apply to it. A submission is a proposal to judge, so "Save"
 * is only ever meaningful for the one editable field (`region`), and offering
 * it as the sole action on a resolved submission said nothing about what a
 * manager could do next:
 *
 * - **open** (`screening` / `pending`) — Accept / Reject.
 * - **shelved** (`spam` / `rejected`) — Reopen, returning it to pending. A
 *   screening false positive is otherwise unrecoverable from the admin.
 * - **applied** (`created` / `updated`) — Delete. The submission has served
 *   its purpose and the record is the manager's to discard; the event it
 *   created is untouched.
 *
 */
const EventSubmissionActions: React.FC = () => {
  const { id } = useDocumentInfo()
  const router = useRouter()
  const { submit } = useForm()
  const modified = useFormModified()
  const status = useFormFields(([fields]) => fields?.status?.value as SubmissionStatus | undefined)
  const [busy, setBusy] = useState<Action | null>(null)

  const run = useCallback(
    async (action: Action) => {
      if (!id || busy) return
      const confirmation = CONFIRM[action]
      if (confirmation && !window.confirm(confirmation)) return
      setBusy(action)
      try {
        // `region` is the one editable field, and correcting it only matters as
        // part of accepting — so Accept persists it rather than a Save button
        // asking the reviewer to do it in two steps. Nothing else on the page
        // is editable, so a dirty form can only mean the region moved.
        if (action === 'accept' && modified) await submit()
        const response =
          action === 'delete'
            ? await fetch(`/api/event-submissions/${id}`, {
                method: 'DELETE',
                credentials: 'include',
              })
            : await fetch(`/api/event-submissions/${id}/review`, {
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
          toast.error(body?.errors?.[0]?.message ?? 'Could not apply that action.')
          return
        }
        toast.success(DONE[action](body?.status))
        // A deleted submission has no page left to refresh.
        if (action === 'delete') router.push('/admin/collections/event-submissions')
        else router.refresh()
      } catch {
        toast.error('Could not apply that action.')
      } finally {
        setBusy(null)
      }
    },
    [id, busy, router, submit, modified],
  )

  // An unsaved document has nothing to act on yet.
  if (!id || !status) return <SaveButton />

  if (OPEN.has(status)) {
    return (
      <div style={{ display: 'flex', gap: 'calc(var(--base) * 0.4)' }}>
        <Button onClick={() => run('reject')} buttonStyle="secondary" disabled={busy !== null}>
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
        <Button onClick={() => run('accept')} disabled={busy !== null}>
          {busy === 'accept' ? 'Accepting…' : 'Accept'}
        </Button>
      </div>
    )
  }

  if (REOPENABLE.has(status)) {
    return (
      <Button onClick={() => run('reopen')} disabled={busy !== null}>
        {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
      </Button>
    )
  }

  // `created` / `updated` — applied, and now just a record.
  return (
    <Button onClick={() => run('delete')} buttonStyle="secondary" disabled={busy !== null}>
      {busy === 'delete' ? 'Deleting…' : 'Delete'}
    </Button>
  )
}

export default EventSubmissionActions
