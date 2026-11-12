import type { Field, FieldServerComponent, Payload, PayloadRequest } from 'payload'

import { FieldLabel, Table } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React from 'react'

import type { SubmissionDataEntry } from '@/collections/UserSubmissions/submissionData'
import { EVENT_REGISTRATION_QUESTIONS } from '@/lib/registrations/questions'
import { CLIENT_CONTEXT_KEYS } from '@/lib/submissions/clientContext'
import { relationId } from '@/lib/utilities/relationId'
import type { Form } from '@/payload-types'

import { tableColumn } from '../helpers/tableColumn'

import './styles.css'

type Part = 'answers' | 'context'

const CONTEXT_KEYS: ReadonlySet<string> = new Set(CLIENT_CONTEXT_KEYS)

/** Keys with a label of their own, whatever form (if any) the row names. */
const FIXED_LABELS: Record<string, string> = {
  ...Object.fromEntries(EVENT_REGISTRATION_QUESTIONS.map((q) => [q.name, q.label])),
  hostUrl: 'Host URL',
  userAgent: 'User Agent',
}

/**
 * A submission's `submissionData` as key/value rows — the visitor's answers on
 * the field itself, and the client-context keys (`CLIENT_CONTEXT_KEYS`) on a
 * `ui` field under System. One component, split by the `part` server prop.
 *
 * **A server component**, so the labels come from the form the row names
 * without a client fetch: an authored block's own label, else a fixed one, else
 * the key in words.
 *
 * ⚠ **Every value is untrusted text and renders as a React child, never a
 * link** — `error` alone may hold 5000 characters a sender chose
 * (`URL_EXEMPT_KEYS`).
 */
const SubmissionData: FieldServerComponent<Field, never, { part?: Part }> = async ({
  data,
  field,
  part = 'answers',
  payload,
  req,
}) => {
  const entries = (
    (Array.isArray(data?.submissionData) ? data.submissionData : []) as SubmissionDataEntry[]
  ).flatMap((entry) =>
    typeof entry?.field === 'string' && CONTEXT_KEYS.has(entry.field) === (part === 'context')
      ? [{ field: entry.field, value: entry.value }]
      : [],
  )

  const label = 'label' in field && typeof field.label === 'string' ? field.label : 'Submission'

  // Hidden rather than empty under System: most rows carry no context at all.
  if (part === 'context' && entries.length === 0) return null

  const labels = part === 'answers' ? await formLabels(payload, req, data?.form) : {}
  const keyLabel = (key: string) => labels[key] || FIXED_LABELS[key] || toWords(key)

  return (
    <div className="field-type submission-data read-only">
      <FieldLabel label={label} />
      {entries.length === 0 ? (
        <div className="submission-data__empty">Nothing was submitted.</div>
      ) : (
        <Table
          appearance="condensed"
          data={entries.map((_, index) => ({ id: index }))}
          columns={[
            tableColumn(
              'field',
              'Field',
              entries.map((entry, index) => (
                <span key={index} className="submission-data__key">
                  {keyLabel(entry.field)}
                </span>
              )),
            ),
            tableColumn(
              'value',
              'Value',
              entries.map((entry, index) => (
                <span key={index} className="submission-data__value">
                  {entry.value == null || entry.value === '' ? '—' : String(entry.value)}
                </span>
              )),
            ),
          ]}
        />
      )}
    </div>
  )
}

/**
 * The authored labels of the form a contact or subscribe row names, by block
 * name. Read in the editor's locale; a missing form (a registration, a deleted
 * form) labels nothing.
 *
 * ⚠ **`formValue` comes off the form body, and needs no gate** — the one
 * server field component here that does not (#1126,
 * `docs/rules/admin-ui.md`). `forms` keeps the form-builder plugin's
 * `read: () => true`, because a public site renders a form anonymously
 * (`src/plugins/formBuilder`), so a caller naming another form's id is handed
 * block labels they could already read unauthenticated. Gating this would
 * refuse nobody.
 */
async function formLabels(
  payload: Payload,
  req: PayloadRequest,
  formValue: unknown,
): Promise<Record<string, string>> {
  const formId = relationId(formValue)
  if (formId == null) return {}

  const form = (await payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 0,
    locale: req.locale ?? undefined,
    overrideAccess: true,
    disableErrors: true,
  })) as Form | null

  return Object.fromEntries(
    (form?.fields ?? []).flatMap((block) => {
      const name = (block as { name?: unknown }).name
      const blockLabel = (block as { label?: unknown }).label
      return typeof name === 'string' && typeof blockLabel === 'string' && blockLabel
        ? [[name, blockLabel]]
        : []
    }),
  )
}

export default SubmissionData
