import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { upsertUserByEmail } from '@/lib/users/upsertUserByEmail'
import { relationId } from '@/lib/utilities/relationId'

/**
 * beforeChange (create): business validation + system stamping for a new
 * submission. The write-guard plugin has already run (beforeValidate) — the
 * captcha, URL scan, and disposable-email list are behind us; this hook owns
 * what needs the database:
 *
 * - an update proposal's target event must exist and be **published** —
 *   anonymous users only see published listings, so a proposal against
 *   anything else is forged or stale (409 `event_not_published`, 404 when
 *   absent);
 * - a new-event submission needs somewhere to land: an existing `country` or
 *   an existing city/venue `anchorRegion` (400 `region_target_missing`) —
 *   the screening job resolves the actual city from these;
 * - the region targets must be the right level (400 `region_level_invalid`):
 *   `country` a country, `state` a state/region, `anchorRegion` a city or
 *   venue. Enforced here rather than via relationship `filterOptions`, whose
 *   save-time validation forwards the client `req` into a find and trips the
 *   select-required client-query gate;
 * - the submitter is upserted into `users` by normalized email and linked;
 * - a client-created submission always starts at `status: 'screening'`
 *   (belt-and-braces with the field-level access lockdown).
 */
export const prepareSubmission: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data

  // Both arrive as JSON blobs from the widget; read them once, defensively —
  // shape is the write-guard's and `validateProposal`'s business, not ours.
  const regionHint = (data.regionHint ?? {}) as Record<string, unknown>
  const submitterInfo = (data.submitterInfo ?? {}) as Record<string, unknown>

  const eventId = relationId(data.event)
  if (eventId != null) {
    // `draft: true` so a never-published draft is found (and then refused with
    // the precise 409) rather than reading as absent. The narrow `select` is
    // load-bearing: this forwards the client `req`, and a select-less read
    // trips the usage plugin's client-query gate.
    const event = await req.payload
      .findByID({
        collection: 'events',
        id: eventId,
        depth: 0,
        draft: true,
        select: { _status: true },
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    if (!event) {
      throw new APIError('The event this proposal targets does not exist.', 404, undefined, true)
    }
    if (event._status !== 'published') {
      throw new APIError(
        'Updates can only be proposed for published events.',
        409,
        { code: 'event_not_published' },
        true,
      )
    }
  } else if (
    relationId(regionHint.country) == null &&
    relationId(regionHint.anchorRegion) == null
  ) {
    throw new APIError(
      'A new event needs a country, or an existing city/venue to attach to.',
      400,
      { code: 'region_target_missing' },
      true,
    )
  }

  // Level checks for whichever region targets were provided.
  const levelExpectations: [number | null, string[], string][] = [
    [relationId(regionHint.country), ['country'], 'country must be a country-level region.'],
    [relationId(regionHint.state), ['region'], 'state must be a state/region-level region.'],
    [
      relationId(regionHint.anchorRegion),
      ['city', 'venue'],
      'anchorRegion must be an existing city or venue.',
    ],
  ]
  for (const [regionId, levels, message] of levelExpectations) {
    if (regionId == null) continue
    const region = await req.payload
      .findByID({
        collection: 'regions',
        id: regionId,
        depth: 0,
        select: { level: true },
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    if (!region || !levels.includes(region.level)) {
      throw new APIError(message, 400, { code: 'region_level_invalid' }, true)
    }
  }

  const submitter =
    typeof submitterInfo.email === 'string' && typeof submitterInfo.name === 'string'
      ? await upsertUserByEmail({ req, name: submitterInfo.name, email: submitterInfo.email })
      : null

  return {
    ...data,
    ...(submitter != null ? { submitter } : {}),
    // Client submissions always enter at `screening`; system/test creates may
    // pin another status explicitly.
    ...(req.user?.collection === 'clients' ? { status: 'screening' } : {}),
  }
}
