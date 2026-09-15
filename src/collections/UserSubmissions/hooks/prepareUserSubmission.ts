import type { CollectionBeforeValidateHook } from 'payload'

import { randomUUID } from 'node:crypto'

import { APIError } from 'payload'


import { checkNoUrls } from '@/lib/antiSpam/antiSpamGuard'
import { upsertUserByEmail } from '@/lib/users/upsertUserByEmail'
import { relationId } from '@/lib/utilities/relationId'
import type { Form, UserSubmission } from '@/payload-types'

import { FORM_BACKED_TYPES, SUBMISSION_TYPES, TYPE_LABELS } from '../fields'
import {
  allowedSubmissionKeys,
  checkSubmissionData,
  readSubmissionValue,
  urlScannablePairs,
} from '../submissionData'


/** Said when an address has no usable local part (`"..."@example.org`). */
const FALLBACK_NAME = 'Submitter'

/** How long a composed `subject` may be. Matches the column's `maxLength`. */
const MAX_SUBJECT = 300

/**
 * beforeValidate (create): everything the request itself knows, plus the two
 * things that need the database.
 *
 * **beforeValidate, not beforeChange**, unlike the hooks it replaces. The
 * allowed-key check has to refuse a bad blob with a 400 *at the collection*,
 * and the per-type `form` validator has to see a `type` that is already
 * settled — both run before `beforeChange` would. The write-guard plugin
 * prepends its own `beforeValidate`, so the captcha, URL scan and
 * disposable-email list are already behind us when this runs.
 *
 * What it owns:
 *
 * - **`submissionData` is bounded per type.** The blob is client-writable as
 *   one value, so nothing inside it is protected by field access; the keys a
 *   type accepts are the base context set, the type's own, and whatever the
 *   authored form declares. A rejection names the offending key.
 * - **`uuid` is issued here**, for every type. It was `randomUUID()` inline at
 *   the one endpoint that created a registration, which is why nothing else
 *   could create one — a `required` column with no default and no hook refuses
 *   every writer that forgets it.
 * - **`client` comes from the authenticated key, never the body.** It brands
 *   the emails sent about the submission, so a caller able to set it could
 *   attribute its rows to another service. The field's access already refuses
 *   a client write; this is the positive half of the same rule.
 * - **the sender is upserted into `users`** from the normalized address, for
 *   every type — which is what makes a sender's history one history across all
 *   four intakes, and what `Users.submissions` joins on.
 * - **`subject` is composed**, never taken from the body: it names the row in
 *   the admin list, and a submitter titling their own row would put unreviewed
 *   text there.
 * - **a client-created row always starts at `pending`** (belt-and-braces with
 *   the field-level access lockdown).
 *
 * ⚠ **Create only, so every bound here is a create-time bound.** The key
 * allow-list, the URL scan and the length caps do not run on an update. No
 * client holds update, so the only writer that reaches an existing row is a
 * manager or a job — but that does mean `submissionData` is unbounded from the
 * moment the row exists, and a manager editing one is trusted rather than
 * checked. Widening this to `update` is Phase 2's business, alongside the jobs
 * that will write these rows.
 */
export const prepareUserSubmission: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (!data) return data
  if (operation !== 'create') return data

  // Checked, not cast. This hook runs before Payload validates the select's
  // options, so an unrecognised string reaches `TYPE_SUBMISSION_KEYS[type]` and
  // spreads `undefined` — a `TypeError`, which surfaces as a 500 `Something
  // went wrong.` and pages Sentry once per attempt, where the caller should
  // have got a 400 naming the field.
  const raw = typeof data.type === 'string' ? data.type : 'contact'
  if (!SUBMISSION_TYPES.includes(raw as UserSubmission['type'])) {
    throw new APIError(
      `\`${raw}\` is not a submission type.`,
      400,
      { code: 'submission_data_invalid' },
      true,
    )
  }
  const type = raw as UserSubmission['type']
  const fromClient = req.user?.collection === 'clients'

  // The form is the authority on what a submission against it *is*. `type`
  // arrives in the body and every per-type rule below keys on it — the allowed
  // `submissionData` keys, the subject composition, the retention window — so a
  // row calling itself a `contact` against a subscribe form is judged by the
  // wrong rules throughout.
  // Refused rather than silently corrected: a caller and a form disagreeing
  // about what is being submitted is a bug in the caller, and quietly
  // rewriting it would hide it.
  const form = FORM_BACKED_TYPES.includes(type) ? await loadForm(req, data.form) : null

  if (form?.actionType != null && form.actionType !== type) {
    throw new APIError(
      `This form accepts ${form.actionType} submissions, not ${type}.`,
      400,
      { code: 'submission_type_mismatch' },
      true,
    )
  }

  const formFieldNames = authoredFieldNames(form)

  const problems = checkSubmissionData(
    data.submissionData,
    allowedSubmissionKeys(type, formFieldNames),
  )
  if (problems.length > 0) {
    // `APIError`, not `ValidationError`: Payload composes a ValidationError's
    // top-level message from the field paths ("The following field is invalid:
    // submissionData") and buries the per-error text, so the offending key —
    // the one thing an integrator can act on — never reaches the response body
    // they read. Same envelope the write-guard raises, for the same reason.
    throw new APIError(problems.join(' '), 400, { code: 'submission_data_invalid' }, true)
  }

  // The write-guard cannot scan these pairs selectively — see `URL_EXEMPT_KEYS`
  // and the note in `policies.ts`. Same check, same failure shape, so a client
  // sees one contract whichever field tripped it. Client writes only: a manager
  // pasting a link into a triage note is not spam.
  if (fromClient) {
    const urls = checkNoUrls(urlScannablePairs(data.submissionData))
    if (!urls.ok) {
      throw new APIError(urls.message, urls.status, { code: urls.code }, true)
    }
  }

  const senderEmail = typeof data.senderEmail === 'string' ? data.senderEmail.trim() : ''

  // An anonymous submission is allowed — `senderEmail` is optional — and simply
  // carries no user. It is still screened, by the checks that need no identity.
  const user = senderEmail
    ? await upsertUserByEmail({
        req,
        name: readSubmissionValue(data.submissionData, 'name') || displayNameFor(senderEmail),
        email: senderEmail,
      })
    : null

  return {
    ...data,
    type,
    // Always a list, never absent. The plugin's own `sendEmail` afterChange
    // spreads this value unconditionally, so `undefined` makes it throw on
    // every form-less submission — a logged error per registration, for a
    // feature that is switched off.
    submissionData: Array.isArray(data.submissionData) ? data.submissionData : [],
    uuid: typeof data.uuid === 'string' && data.uuid ? data.uuid : randomUUID(),
    subject: await composeSubject({ data, req, type }),
    ...(senderEmail ? { senderEmail: senderEmail.toLowerCase() } : {}),
    ...(user != null ? { user } : {}),
    ...(fromClient && req.user?.id != null ? { client: req.user.id } : {}),
    ...(fromClient ? { status: 'pending' } : {}),
  }
}

/**
 * Load the form a submission names, once, for the two questions that need it:
 * what it says the submission *is*, and which fields its author declared.
 *
 * Read without forwarding `req`. A form is committed state — this never needs
 * the caller's uncommitted writes — and a nested read that joins the caller's
 * transaction takes the whole create down with it when it goes wrong
 * (`src/collections/AGENTS.md`). `disableErrors` keeps a bad `form` id the
 * relationship validator's business, not this hook's.
 */
async function loadForm(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  form: unknown,
): Promise<Form | null> {
  const formId = relationId(form)
  if (formId == null) return null

  // `disableErrors` already returns null for a form that does not exist, which
  // is the relationship validator's business rather than this hook's. There is
  // deliberately no `.catch` beyond it: the fallback here is an empty allow-list,
  // which is not neutral — it would refuse a valid submission with "`x` is not a
  // field this submission accepts", blaming the integrator for a transient
  // database error and recording the real cause nowhere.
  return (await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as Form | null
}

/**
 * The field names the form's author declared, so `submissionData` accepts what
 * that form actually asks rather than a list restated here — an author adds a
 * field whenever they like.
 */
function authoredFieldNames(form: Form | null): string[] {
  if (!form || !Array.isArray(form.fields)) return []

  return form.fields
    .map((block) => (block as { name?: unknown }).name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

/**
 * The admin title, per type: a contact row leads with the form that produced
 * it, a registration with the event it attends, a subscription with the address
 * that subscribed, a proposal with what it proposes.
 *
 * The reads drop `req` for the same reason as `authoredFieldNames`, and fall
 * back to the type's label rather than throwing — a title is not worth failing
 * a submission over.
 */
async function composeSubject({
  data,
  req,
  type,
}: {
  data: Record<string, unknown>
  req: Parameters<CollectionBeforeValidateHook>[0]['req']
  type: UserSubmission['type']
}): Promise<string> {
  const sender = typeof data.senderEmail === 'string' ? data.senderEmail.trim() : ''

  if (type === 'subscribe') return truncate(sender || TYPE_LABELS.subscribe)

  if (type === 'contact') {
    const formTitle = await titleOf(req, 'forms', data.form)
    const written = readSubmissionValue(data.submissionData, 'subject')
    const parts = [formTitle, written].filter(Boolean)
    return truncate(parts.length ? parts.join(': ') : TYPE_LABELS.contact)
  }

  const eventTitle = await titleOf(req, 'events', data.event)
  if (type === 'registration') return truncate(eventTitle || TYPE_LABELS.registration)

  // A proposal for a brand-new event has no target to name, so it says so.
  return truncate(eventTitle ? `Update: ${eventTitle}` : 'New event proposal')
}

/**
 * One document's title, for the subject line.
 *
 * ⚠ **An event's title is only read when the event is published.** `event` is
 * client-writable and not tied to `type`, and this read elevates — so without
 * the check a create-only client could name any event id, get its title echoed
 * back in the create response's `subject`, and read out the titles of draft and
 * soft-deleted listings one row at a time. That is precisely the narrowing
 * `createAccessConfig` applies to a client's own reads of a drafts-enabled
 * collection, and a subject line must not route around it.
 *
 * `forms` needs no such check: a form is publicly readable by design.
 */
async function titleOf(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  collection: 'forms' | 'events',
  value: unknown,
): Promise<string> {
  const id = relationId(value)
  if (id == null) return ''

  const doc = await req.payload.findByID({
    collection,
    id,
    depth: 0,
    select: collection === 'events' ? { title: true, _status: true } : { title: true },
    overrideAccess: true,
    disableErrors: true,
  })

  if (!doc) return ''
  if (collection === 'events' && (doc as { _status?: string })._status !== 'published') return ''

  return typeof doc.title === 'string' ? doc.title.trim() : ''
}

function truncate(value: string): string {
  return value.length > MAX_SUBJECT ? value.slice(0, MAX_SUBJECT) : value
}

/**
 * A display name for the `users` row when the submission carried none.
 *
 * **Dots and underscores become spaces**, which is both nicer to read
 * (`john.doe` → `john doe`) and load-bearing: the write-guard's `users` policy
 * URL-scans `name`, and its bare-domain pattern matches any `word.tld` — so a
 * literal local part would reject every submission from `foo.com@example.org`
 * with "Links are not allowed in name".
 */
function displayNameFor(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  const name = localPart.replace(/[._]+/g, ' ').trim()
  return name || FALLBACK_NAME
}
