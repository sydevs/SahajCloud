import { z } from 'zod'

import { checkEmailAllowed, checkNoUrls } from '@/lib/antiSpam/antiSpamGuard'
import type { AntiSpamCode } from '@/lib/antiSpam/antiSpamGuard'
import { EVENT_REGISTRATION_QUESTIONS } from '@/lib/registrations/questions'
import { CLIENT_CONTEXT_KEYS } from '@/lib/submissions/clientContext'
import type { Form, UserSubmission } from '@/payload-types'


/**
 * The bound on `submissionData` — the plugin's `[{ field, value }]` array,
 * which holds the free-form remainder of a submission.
 *
 * **Why a schema built here and not a `jsonSchema`.** `submissionData` is not a
 * JSON column; it is a Payload array field, and its `value` is a `textarea`. So
 * the guard every other blob on this collection gets from Ajv is composed
 * here — and it is composed *per submission*, because a contact row's
 * legitimate keys are whatever its form's author named, a registration row's
 * are the event's enabled questions, and which answer is judged as an address
 * is whichever block the author made an `email` one.
 *
 * **Why bound it at all.** The array is client-writable as one blob, so
 * field-level access cannot protect anything inside it, and Payload cannot pair
 * `field`/`value` conditions on one array element — so nothing queryable may
 * live here, and nothing unbounded may either. Without this check a caller
 * chooses both the keys and their sizes on a public endpoint.
 *
 * **One schema, one pass.** The key allow-list, the length caps and the
 * per-block content checks are one `submissionDataSchema` rather than three
 * walks over the same pairs: every allowed key carries its own value schema,
 * so adding a block type is a row in `valueSchemaFor` and not a fourth pass.
 * `checkContent` is the client-write half — a manager pasting a link into a
 * triage note is not spam, and nothing a manager writes is screened.
 *
 * Everything in this module is pure, so the whole matrix is testable in the
 * unit lane without booting Payload.
 */

/** How many pairs one submission may carry, whatever its type. */
export const MAX_SUBMISSION_DATA_ENTRIES = 40

/** How long a key may be. Authored form fields are named by a person. */
export const MAX_SUBMISSION_DATA_KEY_LENGTH = 100

/** How long a value may be, for a key with no more specific bound below. */
export const DEFAULT_MAX_VALUE_LENGTH = 2000

/**
 * Per-key value bounds, for the keys that hold prose rather than a token.
 * Mirrors what the collections being replaced enforced: `UserMessages.message`
 * was `maxLength: 5000`.
 */
export const VALUE_MAX_LENGTHS: Readonly<Record<string, number>> = {
  message: 5000,
  note: 5000,
  error: 5000,
}

/**
 * Keys every type may carry: who sent it, in what language, and from where.
 *
 * These are the `context` keys `user-messages` accepted, flattened into the
 * pairs array. They are not per-type because the client that sends them does
 * not vary by type — the same widget reports its path and user agent whether
 * the visitor is registering or filing a bug.
 */
export const BASE_SUBMISSION_KEYS = [
  'name',
  'locale',
  'path',
  'hostUrl',
  'userAgent',
  'error',
] as const

/**
 * The registrant's mailing-list opt-in.
 *
 * A `submissionData` pair rather than a column, and rather than the
 * `mailingListSubscribedAt` timestamp it replaces: the consent record is a real
 * subscribe-type **row**, with its own status, screening and retries, spawned by
 * `spawnSubscribeFromRegistration`. This key is only the request saying which
 * way the box was ticked, so nothing queries it and nothing reads it after the
 * row exists.
 */
export const SUBSCRIBE_OPT_IN = 'subscribe'

/**
 * Whether an opt-in pair's text means yes. Absent or anything else means no.
 *
 * Four spellings count — `'true'`, `'yes'`, `'on'`, `'1'` — because the pair
 * arrives as text from an HTML form, where a checkbox's wire value is whatever
 * the front end chose.
 */
export function parseOptIn(value: string | undefined): boolean {
  if (value == null) return false
  return ['true', 'yes', 'on', '1'].includes(value.trim().toLowerCase())
}

/**
 * Keys a type adds to the base set, beyond whatever its form authored.
 *
 * `subscribe` adds none: an address plus a name is the whole of a subscription,
 * and the address is a real column.
 */
export const TYPE_SUBMISSION_KEYS: Record<UserSubmission['type'], readonly string[]> = {
  contact: ['subject', 'message'],
  subscribe: [],
  registration: [...EVENT_REGISTRATION_QUESTIONS.map((question) => question.name), SUBSCRIBE_OPT_IN],
  proposal: ['note'],
}

/**
 * Keys whose value may legitimately contain a URL, and so are never URL-scanned.
 *
 * This is the exemption `user-messages` expressed by not scanning its `context`
 * column at all: a crash report names the page it happened on, and the host URL
 * of the embedding site *is* a URL. Flattening those keys into the same array
 * as the message body is what makes the exemption need spelling out — the
 * write-guard's `urlScanFields` walks a path's every string leaf, so it cannot
 * tell one pair from another. See `policies.ts`.
 *
 * ⚠ **A constraint on whatever renders these pairs.** Exempt does not mean
 * harmless: `error` holds up to 5000 characters a sender chose, links included.
 * The contact email renders every answer as an escaped React child and never
 * inside a `<Link>` (`formAnswers.ts`, `UserMessageEmail`), which is what keeps
 * that true now the pairs reach a renderer.
 */
export const URL_EXEMPT_KEYS: ReadonlySet<string> = new Set(CLIENT_CONTEXT_KEYS)

/** One `submissionData` pair, as it arrives. */
export interface SubmissionDataEntry {
  field?: unknown
  value?: unknown
}

/**
 * What the pairs are judged against: the submission's type, the blocks its form
 * declared, and whether the content checks run.
 *
 * `formFields` carries each block's `blockType` as well as its name, because
 * which check an answer gets is keyed on the type the author chose and not on
 * what they called the field — renaming a question must not change how its
 * answer is judged.
 */
export interface SubmissionDataRules {
  type: UserSubmission['type']
  formFields?: readonly AuthoredBlock[]
  /** Run the anti-spam content checks. Client writes only. */
  checkContent?: boolean
}

/**
 * One block of an authored form, as the live document carries it.
 *
 * Narrowed to the arms that name a field, so the schema can key on the name
 * the operator chose. The plugin's `message` block is the one that carries
 * none: it is static copy, and no answer arrives for it.
 */
export type AuthoredBlock = Extract<NonNullable<Form['fields']>[number], { name: string }>

/** A refusal, with the envelope the caller raises it in. */
export interface SubmissionProblem {
  code: 'submission_data_invalid' | AntiSpamCode
  status: number
  message: string
  /** The offending key, for the per-field content refusals. */
  field?: string
}

const INVALID: SubmissionProblem['code'] = 'submission_data_invalid'

/**
 * The blocks a form's author declared, as the schema wants them: named, and
 * carrying the block type their answers are judged by.
 */
export function authoredBlocks(form: Form | null): readonly AuthoredBlock[] {
  return (form?.fields ?? []).filter(
    (block): block is AuthoredBlock =>
      typeof (block as { name?: unknown }).name === 'string' &&
      (block as AuthoredBlock).name.length > 0,
  )
}

/**
 * The value schema for one key: its length bound, plus the content checks a
 * client write gets.
 *
 * **The `email` arm is why this is per key rather than per blob.** An authored
 * email answer is judged as an address, never as free text: `URL_PATTERN`'s
 * bare-domain arm matches `gmail.com`, so the link scan refused most real
 * addresses and the atlas's required email field left the visitor no way to
 * clear the value (#899). Trimmed first, so a blank answer to an optional
 * question stays optional. The other eleven block types want the default: a
 * `date`, `state` or `country` code trips no arm of the pattern, and a
 * checkbox's value is not a string.
 */
function valueSchemaFor(
  key: string,
  blockType: string | undefined,
  checkContent: boolean,
): z.ZodType<string | null | undefined> {
  const max = VALUE_MAX_LENGTHS[key] ?? DEFAULT_MAX_VALUE_LENGTH
  const base = z
    .string({ error: `\`${key}\` must be text.` })
    .max(max, `\`${key}\` is longer than the ${max} characters allowed.`)

  if (!checkContent) return base.nullish()

  if (blockType === 'email') {
    return base
      .superRefine((value, ctx) => addAntiSpamIssue(ctx, checkEmailAllowed(value.trim(), key)))
      .nullish()
  }

  if (URL_EXEMPT_KEYS.has(key)) return base.nullish()

  return base
    .superRefine((value, ctx) => addAntiSpamIssue(ctx, checkNoUrls({ [key]: value })))
    .nullish()
}

/** Carry an anti-spam verdict into the parse, code and field intact. */
function addAntiSpamIssue(ctx: z.RefinementCtx, result: ReturnType<typeof checkNoUrls>): void {
  if (result.ok) return
  ctx.addIssue({
    code: 'custom',
    message: result.message,
    params: { code: result.code, status: result.status, field: result.field },
  })
}

/**
 * The schema one submission's pairs are parsed against: every key it may carry,
 * each with its own value schema.
 *
 * The walk lives in one `superRefine` rather than in the element schema so that
 * a malformed blob reports every problem at once — the caller joins them into
 * one response, and Zod stops at the first failing element otherwise. The entry
 * cap returns early for the same reason: a 100k-entry array must not answer
 * with 100k sentences about a request already refused.
 */
export function submissionDataSchema(rules: SubmissionDataRules) {
  const { type, formFields = [], checkContent = false } = rules
  const blockTypes = new Map<string, string>(
    formFields.map((block) => [block.name, block.blockType]),
  )
  const schemas = new Map<string, z.ZodType<string | null | undefined>>()
  for (const key of [...BASE_SUBMISSION_KEYS, ...TYPE_SUBMISSION_KEYS[type], ...blockTypes.keys()]) {
    schemas.set(key, valueSchemaFor(key, blockTypes.get(key), checkContent))
  }

  return z
    .array(z.unknown(), { error: '`submissionData` must be a list of field/value pairs.' })
    .superRefine((entries, ctx) => {
      if (entries.length > MAX_SUBMISSION_DATA_ENTRIES) {
        ctx.addIssue({
          code: 'custom',
          message: `A submission may carry at most ${MAX_SUBMISSION_DATA_ENTRIES} answers; this one has ${entries.length}.`,
        })
        return
      }

      const seen = new Set<string>()

      for (const entry of entries as SubmissionDataEntry[]) {
        const key = entry?.field

        if (typeof key !== 'string' || key.length === 0) {
          ctx.addIssue({ code: 'custom', message: 'Every answer needs a `field` name.' })
          continue
        }

        if (key.length > MAX_SUBMISSION_DATA_KEY_LENGTH) {
          ctx.addIssue({
            code: 'custom',
            message: `\`${key.slice(0, MAX_SUBMISSION_DATA_KEY_LENGTH)}…\` is not a valid field name.`,
          })
          continue
        }

        const schema = schemas.get(key)
        if (!schema) {
          ctx.addIssue({
            code: 'custom',
            message: `\`${key}\` is not a field this submission accepts.`,
          })
          continue
        }

        // A repeated key silently overwrites downstream, so it is a malformed
        // blob rather than a harmless one.
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', message: `\`${key}\` appears more than once.` })
          continue
        }
        seen.add(key)

        // Re-raised rather than forwarded: an inner issue's `params` is what
        // carries the anti-spam code, and nothing else about it is wanted here.
        const parsed = schema.safeParse(entry?.value)
        if (parsed.success) continue
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: 'custom',
            message: issue.message,
            params: (issue as { params?: Record<string, unknown> }).params,
          })
        }
      }
    })
}

/**
 * Check the pairs against the schema their form and type compose.
 *
 * Returns the problems rather than throwing, so the caller owns the error
 * envelope and this stays a pure function. Every shape message **names the
 * offending key**: a 400 saying only "invalid submission data" tells a client
 * integrator nothing they can act on. A content refusal carries the code and
 * field the anti-spam check raised instead, so one link in a message reads the
 * same whichever refuser caught it.
 */
export function checkSubmissionData(
  entries: unknown,
  rules: SubmissionDataRules,
): SubmissionProblem[] {
  if (entries == null) return []

  const parsed = submissionDataSchema(rules).safeParse(entries)
  if (parsed.success) return []

  return parsed.error.issues.map((issue) => {
    const params = (issue as { params?: Record<string, unknown> }).params
    if (typeof params?.code === 'string') {
      return {
        code: params.code as AntiSpamCode,
        status: typeof params.status === 'number' ? params.status : 400,
        message: issue.message,
        ...(typeof params.field === 'string' ? { field: params.field } : {}),
      }
    }
    return { code: INVALID, status: 400, message: issue.message }
  })
}

/** Read one pair's value out of the blob, for the hooks that compose from it. */
export function readSubmissionValue(entries: unknown, key: string): string | undefined {
  if (!Array.isArray(entries)) return undefined
  const found = (entries as SubmissionDataEntry[]).find((entry) => entry?.field === key)
  return typeof found?.value === 'string' ? found.value : undefined
}
