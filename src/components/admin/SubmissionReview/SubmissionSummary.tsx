import type { CollectionSlug, Field, FieldServerComponent, Payload, PayloadRequest } from 'payload'

import React from 'react'

import { TYPE_LABELS } from '@/collections/UserSubmissions/fields'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { SummaryLink } from './SummaryLink'

import './styles.css'

interface Row {
  label: string
  value: React.ReactNode
}

/**
 * Who sent a submission, through what, and about what — `type`, `user`,
 * `form` and `event` as one block, each document a link opening it in a drawer.
 *
 * **A server component**, so a title costs no client fetch. Each read runs
 * under the viewer's own access: a document they cannot read shows as plain
 * text, since its drawer would refuse them anyway.
 */
const SubmissionSummary: FieldServerComponent<Field> = async ({ data, payload, req }) => {
  const type = data?.type as UserSubmission['type'] | undefined
  if (!type || !(type in TYPE_LABELS)) return null

  const userId = relationId(data?.user)
  const formId = relationId(data?.form)
  const eventId = relationId(data?.event)

  // One after another rather than `Promise.all`: concurrent reads on one `req`
  // can race on its locale (`src/collections/AGENTS.md`).
  const user = userId != null ? await titleOf(payload, req, 'users', userId, 'email') : null
  const form = formId != null ? await titleOf(payload, req, 'forms', formId, 'title') : null
  const event = eventId != null ? await titleOf(payload, req, 'events', eventId, 'title') : null

  const rows: Row[] = [
    { label: 'Type', value: TYPE_LABELS[type] },
    {
      label: 'Submitted By',
      value:
        userId == null ? (
          <span className="submission-summary__muted">Anonymous</span>
        ) : (
          linkOrText('users', userId, user, `Registrant #${userId}`)
        ),
    },
  ]
  if (formId != null) {
    rows.push({ label: 'Form', value: linkOrText('forms', formId, form, `Form #${formId}`) })
  }
  if (eventId != null) {
    rows.push({ label: 'Event', value: linkOrText('events', eventId, event, `Event #${eventId}`) })
  } else if (type === 'proposal') {
    rows.push({
      label: 'Event',
      value: <span className="submission-summary__muted">A new event, created on accept</span>,
    })
  }

  return (
    <div className="field-type submission-summary">
      <dl className="submission-summary__list">
        {rows.map((row) => (
          <div className="submission-summary__row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function linkOrText(
  collection: CollectionSlug,
  id: number,
  title: string | null,
  fallback: string,
): React.ReactNode {
  if (title === null) return fallback
  return <SummaryLink collectionSlug={collection} id={id} label={title || fallback} />
}

/**
 * A document's display field, or `null` when the viewer cannot read it. An
 * empty string means readable but untitled.
 */
async function titleOf(
  payload: Payload,
  req: PayloadRequest,
  collection: 'users' | 'forms' | 'events',
  id: number,
  field: 'email' | 'title',
): Promise<string | null> {
  const doc = await payload.findByID({
    collection,
    id,
    depth: 0,
    select: { [field]: true },
    locale: req.locale ?? undefined,
    overrideAccess: false,
    user: req.user,
    disableErrors: true,
  })
  if (!doc) return null
  const value = (doc as unknown as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

export default SubmissionSummary
