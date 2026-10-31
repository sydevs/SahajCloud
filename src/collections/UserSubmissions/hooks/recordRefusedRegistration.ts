import type { CollectionAfterErrorHook } from 'payload'

import { refusalHour } from '@/collections/RegistrationRefusals/RegistrationRefusals'
import type { AntiSpamCode } from '@/lib/antiSpam/antiSpamGuard'
import { isRecord } from '@/lib/utilities/isRecord'
import { relationId } from '@/lib/utilities/relationId'
import { getPgPool, quotedDbSchema } from '@/plugins/usage'

/**
 * Every code the spam check refuses with. A `Record` rather than a list, so a
 * code added to `AntiSpamCode` is a compile error here until someone decides
 * whether it is a spam refusal. `submission_data_invalid`, `submission_type_mismatch`
 * and the registration gate's 409s are not: they answer a malformed or
 * impossible request, not a suspected spammer.
 */
const SPAM_CHECK_CODES: Record<AntiSpamCode, true> = {
  captcha_failed: true,
  captcha_unavailable: true,
  invalid_email: true,
  disposable_email: true,
  urls_not_allowed: true,
  content_unscannable: true,
}

const spamCheckCode = (error: unknown): AntiSpamCode | null => {
  const data = isRecord(error) ? error.data : null
  const code = isRecord(data) ? data.code : null
  return typeof code === 'string' && Object.hasOwn(SPAM_CHECK_CODES, code)
    ? (code as AntiSpamCode)
    : null
}

/**
 * One more refusal on its class, reason and hour, in a single statement: the
 * unique index on those three is what makes concurrent refusals add up rather
 * than race. On the pool, like the usage counters, because Payload has no
 * atomic increment; the schema is qualified for the same reason they are.
 */
const countRefusalSql = (quotedSchema: string) => `
  INSERT INTO ${quotedSchema}."registration_refusals"
    ("event_id", "stage", "reason", "hour", "count", "created_at", "updated_at")
  VALUES ($1, 'request', $2, $3, 1, now(), now())
  ON CONFLICT ("event_id", "reason", "hour")
  DO UPDATE SET "count" = "registration_refusals"."count" + 1, "updated_at" = now()
`

/**
 * afterError: count a class sign-up the spam check refused at the request, for
 * the admins' refused-sign-up digest (sydevs/SahajAtlasWeb#259).
 *
 * The write guard and `prepareUserSubmission` refuse in `beforeValidate`, so
 * no row exists to read later — this is the one place a refusal can still be
 * seen. Only the class, the code and the hour are kept: the body failed the
 * spam check, so none of it is trusted enough to store or to put in an admin's
 * inbox (`src/collections/RegistrationRefusals/`).
 *
 * ⚠ **REST only, which is every refusal there is.** Payload runs a collection's
 * `afterError` from `routeError` alone, and the write guard judges only an API
 * client, which reaches this collection over REST and no other way. The body is
 * `req.data`, which the REST create handler parsed before the operation ran.
 *
 * ⚠ **It never changes the answer.** By the time this runs the create's
 * transaction is already rolled back, so the count is written on the pool, and
 * any failure is logged and swallowed: the visitor gets the same refusal
 * whether or not it was counted.
 *
 * Only a class a visitor could sign up for counts — published, not in the
 * trash, and taking registrations here. Anyone holding the published widget key
 * can be refused for free, so a body naming any other id is not a sign-up, and
 * counting it would let them put any class they like in the digest.
 */
export const recordRefusedRegistration: CollectionAfterErrorHook = async ({ error, req }) => {
  if (req.user?.collection !== 'clients') return
  const code = spamCheckCode(error)
  if (!code) return

  const body = isRecord(req.data) ? req.data : null
  if (body?.type !== 'registration') return
  // A JSON body may carry the id as a string, which Payload's relationship
  // validator accepts too.
  const eventId =
    typeof body.event === 'string' && /^\d+$/.test(body.event)
      ? Number(body.event)
      : relationId(body.event)
  if (eventId == null || !Number.isSafeInteger(eventId) || eventId <= 0) return

  const payload = req.payload
  try {
    const event = await payload.findByID({
      collection: 'events',
      id: eventId,
      depth: 0,
      select: { _status: true, registrationMode: true },
      overrideAccess: true,
      disableErrors: true,
    })
    if (event?._status !== 'published' || event.registrationMode === 'external') return

    const pool = getPgPool(req)
    if (!pool) throw new Error('Postgres pool not available')
    await pool.query(countRefusalSql(quotedDbSchema(req)), [
      eventId,
      code,
      refusalHour(new Date()).toISOString(),
    ])
  } catch (recordError) {
    payload.logger.warn({
      msg: 'recordRefusedRegistration: could not record a refused sign-up',
      eventId,
      code,
      error: recordError instanceof Error ? recordError.message : String(recordError),
    })
  }
}
