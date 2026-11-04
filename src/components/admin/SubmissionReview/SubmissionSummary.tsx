import type { CollectionSlug, Field, FieldServerComponent, Payload, PayloadRequest } from 'payload'

import { FieldLabel, Pill, Table } from '@payloadcms/ui'
import React from 'react'

import { TYPE_LABELS } from '@/collections/UserSubmissions/fields'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { SummaryLink } from './SummaryLink'
import { tableColumn } from '../helpers/tableColumn'

import './styles.css'

interface Row {
  label: string
  value: React.ReactNode
}

/** The collection each linked document lives in, and the field that names it. */
const TITLE_FIELDS = {
  users: 'email',
  clients: 'name',
  forms: 'title',
  events: 'title',
} as const

type Linked = keyof typeof TITLE_FIELDS

/**
 * Who sent a submission, through what, and about what — `type`, `user`,
 * `client`, `form` and `event` as one read-only field, each document a link
 * opening it in a drawer.
 *
 * Marked up as a Payload field — `field-type` and its `FieldLabel` — around a
 * condensed `Table`, the same key/value shape as the submission data beside it.
 *
 * **A server component**, so a title costs no client fetch. Each read runs
 * under the viewer's own access: a document they cannot read shows as plain
 * text, since its drawer would refuse them anyway.
 */
const SubmissionSummary: FieldServerComponent<Field> = async ({ data, field, payload, req }) => {
  const type = data?.type as UserSubmission['type'] | undefined
  if (!type || !(type in TYPE_LABELS)) return null

  const ids = {
    users: relationId(data?.user),
    clients: relationId(data?.client),
    forms: relationId(data?.form),
    events: relationId(data?.event),
  }

  // One after another rather than `Promise.all`: concurrent reads on one `req`
  // can race on its locale (`src/collections/AGENTS.md`).
  const links: Partial<Record<Linked, React.ReactNode>> = {}
  for (const collection of Object.keys(ids) as Linked[]) {
    const id = ids[collection]
    if (id == null) continue
    links[collection] = await linkTo(payload, req, collection, id)
  }

  const muted = (text: string) => <span className="submission-summary__muted">{text}</span>

  const rows: Row[] = [
    {
      label: 'Type',
      value: (
        <Pill pillStyle="light-gray" size="small">
          {TYPE_LABELS[type]}
        </Pill>
      ),
    },
    { label: 'Submitted By', value: links.users ?? muted('Anonymous') },
    { label: 'Submitted Via', value: links.clients ?? muted('Not recorded') },
  ]
  if (links.forms) rows.push({ label: 'Form', value: links.forms })
  if (links.events) rows.push({ label: 'Event', value: links.events })
  else if (type === 'proposal') {
    rows.push({ label: 'Event', value: muted('A new event, created on accept') })
  }

  const label = 'label' in field && typeof field.label === 'string' ? field.label : 'Context'

  return (
    <div className="field-type submission-data submission-summary read-only">
      <FieldLabel label={label} />
      <Table
        appearance="condensed"
        data={rows.map((_, index) => ({ id: index }))}
        columns={[
          tableColumn(
            'field',
            'Field',
            rows.map((row) => (
              <span key={row.label} className="submission-data__key">
                {row.label}
              </span>
            )),
          ),
          tableColumn(
            'value',
            'Value',
            rows.map((row) => (
              <span key={row.label} className="submission-summary__value">
                {row.value}
              </span>
            )),
          ),
        ]}
      />
    </div>
  )
}

/**
 * A drawer link to the document, named by its title field — or plain text when
 * the viewer cannot read it.
 */
async function linkTo(
  payload: Payload,
  req: PayloadRequest,
  collection: Linked,
  id: number,
): Promise<React.ReactNode> {
  const titleField = TITLE_FIELDS[collection]
  const doc = await payload.findByID({
    collection,
    id,
    depth: 0,
    select: { [titleField]: true },
    locale: req.locale ?? undefined,
    overrideAccess: false,
    user: req.user,
    disableErrors: true,
  })
  const fallback = `#${id}`
  if (!doc) return fallback

  const title = (doc as unknown as Record<string, unknown>)[titleField]
  return (
    <SummaryLink
      collectionSlug={collection as CollectionSlug}
      id={id}
      label={typeof title === 'string' && title ? title : fallback}
    />
  )
}

export default SubmissionSummary
