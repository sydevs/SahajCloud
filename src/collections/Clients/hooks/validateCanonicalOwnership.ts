import type { CollectionBeforeChangeHook, TextFieldSingleValidation } from 'payload'

import { ValidationError } from 'payload'
import { text as textFieldValidation } from 'payload/shared'

import { relationId } from '@/lib/utilities/relationId'

/** A canonical domain is a bare host: lowercase letters, digits, dots, dashes. */
const CANONICAL_DOMAIN_RE = /^[a-z0-9.-]+$/

/**
 * Whether `value` is a usable canonical domain — a single bare host.
 *
 * The authority for the shape, shared with the backfill so a seeded value can
 * never be one the admin panel would refuse. Note what the character class
 * excludes: whitespace. Two legacy Atlas records hold *two* hosts in one field
 * (`sahajayoga.fr\r\nyogaessonne.fr`), and those must not be seeded as if they
 * named one canonical site.
 */
export function isCanonicalDomain(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && CANONICAL_DOMAIN_RE.test(value)
}

/**
 * `validate` for `canonical.domain` — shape only.
 *
 * Deliberately permissive about *absence*: whether a domain is required depends
 * on `canonical.enabled`, which is {@link validateCanonicalOwnership}'s job. It
 * has to be, because the backfill script seeds a domain on services whose
 * `enabled` stays false, and because the "what is missing" message reads better
 * naming every gap at once than as two independent field errors.
 *
 * Composes with Payload's built-in `text` validator rather than replacing it —
 * supplying a `validate` swaps out the default entirely, silently dropping
 * `maxLength` and friends.
 */
export const canonicalDomainValidate: TextFieldSingleValidation = (value, options) => {
  if (value && !CANONICAL_DOMAIN_RE.test(value)) {
    return 'Enter a bare host — lowercase letters, digits, dots and dashes only (no scheme, port or path).'
  }
  return textFieldValidation(value, options)
}

/**
 * Enforce the two rules that make canonical ownership answerable (#633).
 *
 * 1. **Enabling needs a target.** `canonical.enabled` without a `region` or a
 *    `canonical.domain` describes nothing, so it is refused with a message
 *    naming what is missing.
 * 2. **One owner per region.** Three published services map to Czechia and two
 *    each to Finland and Australia, so `region` alone can never identify an
 *    owner. A second enabled service on a region already spoken for is refused,
 *    naming the incumbent — otherwise "who owns Czechia" has no answer.
 *
 * Runs on both create and update. The incumbent lookup only fires when the write
 * actually leaves `enabled` true, so ordinary client writes — including the
 * widget's `embedMetadata` reports — cost no extra query.
 */
export const validateCanonicalOwnership: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  // A partial update carries only the touched fields, and Payload materialises an
  // empty object for a group the patch omits — so both halves are read as
  // "patch over stored". Shallow spread, not a deep merge: an explicit null in
  // the patch (someone clearing the domain) has to win over the stored value.
  const canonical = { ...originalDoc?.canonical, ...data?.canonical }
  if (!canonical.enabled) return data

  const region = relationId('region' in (data ?? {}) ? data.region : originalDoc?.region)
  const domain = typeof canonical.domain === 'string' ? canonical.domain.trim() : ''

  const missing: string[] = []
  if (region === null) missing.push('a region')
  if (!domain) missing.push('a canonical domain')

  if (missing.length > 0) {
    throw new ValidationError({
      collection: 'clients',
      errors: [
        {
          path: 'canonical.enabled',
          message: `Canonical ownership needs ${missing.join(' and ')}. Fill ${
            missing.length > 1 ? 'them' : 'it'
          } in, or leave canonical ownership off.`,
        },
      ],
    })
  }

  // Published state is the incumbent: publish/unpublish is this collection's auth
  // gate, so a draft-only claim isn't live yet and this hook runs again when it
  // is. `overrideAccess` because `clients` is unreadable by API clients — the
  // widget's own report write reaches this hook too.
  const { docs: incumbents } = await req.payload.find({
    collection: 'clients',
    where: {
      and: [
        { region: { equals: region } },
        { 'canonical.enabled': { equals: true } },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    select: { name: true },
    overrideAccess: true,
    req,
  })

  if (incumbents.length > 0) {
    throw new ValidationError({
      collection: 'clients',
      errors: [
        {
          path: 'canonical.enabled',
          message: `“${incumbents[0].name}” already owns the canonical URLs for this region. Turn canonical ownership off there first, or pick a different region.`,
        },
      ],
    })
  }

  return data
}
