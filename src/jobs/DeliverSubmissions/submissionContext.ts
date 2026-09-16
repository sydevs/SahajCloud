import type { PayloadRequest } from 'payload'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import type { UserMessage } from '@/payload-types'

/** Said in an email subject when the relaying service cannot be resolved. */
const UNKNOWN_CLIENT = 'Unknown service'

/**
 * The relaying service's name, for an email subject.
 *
 * Read here rather than populated at `depth: 1` so the submission read stays a
 * single narrow query — and so a deleted client degrades to a label instead of
 * throwing in a job nobody is watching.
 */
export async function clientNameFor(
  req: PayloadRequest,
  clientId: number | null,
): Promise<string> {
  if (clientId == null) return UNKNOWN_CLIENT

  const client = await req.payload.findByID({
    collection: 'clients',
    id: clientId,
    depth: 0,
    select: { name: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })

  return typeof client?.name === 'string' && client.name.trim() !== ''
    ? client.name
    : UNKNOWN_CLIENT
}

/**
 * Rebuild the `context` block the contact email renders, from the flat pairs it
 * now arrives as.
 *
 * `user-messages` carried these five as a typed JSON column; `user-submissions`
 * flattens them into `submissionData`, because they are the same on every type
 * and none of them is queried. This is the one place that reverses the
 * flattening, so the email template keeps its existing shape rather than
 * learning about pairs.
 *
 * ⚠ **Every value here is submitter-chosen text, and four of the five are
 * exempt from the URL scan** (`URL_EXEMPT_KEYS` — an issue report names the
 * page it happened on, and a host URL *is* a URL). The template must therefore
 * never turn them into anchors. That constraint is stated at the exemption and
 * repeated here because this is where the values meet a renderer.
 */
export function contextFromSubmissionData(
  entries: unknown,
): NonNullable<UserMessage['context']> | undefined {
  const context = {
    locale: readSubmissionValue(entries, 'locale'),
    path: readSubmissionValue(entries, 'path'),
    hostUrl: readSubmissionValue(entries, 'hostUrl'),
    userAgent: readSubmissionValue(entries, 'userAgent'),
    error: readSubmissionValue(entries, 'error'),
  }

  const present = Object.entries(context).filter(([, value]) => value != null && value !== '')
  // `undefined` rather than an object of five undefineds: the template renders a
  // details block per present key, and an empty one would print a bare heading.
  return present.length > 0 ? (Object.fromEntries(present) as NonNullable<UserMessage['context']>) : undefined
}
