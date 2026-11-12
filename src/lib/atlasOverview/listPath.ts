import type { Where } from 'payload'

import * as qs from 'qs-esm'

/**
 * ⚠ An `in` list goes as one comma-joined value, which Payload splits; indexed
 * keys make a subtree's URL kilobytes long.
 */
export const listPath = (collection: string, and: Where[]): `/${string}` =>
  `/collections/${collection}${qs.stringify({ where: { and: joinIn(and) } }, { addQueryPrefix: true })}`

const joinIn = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(joinIn)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      key === 'in' && Array.isArray(inner) ? inner.join(',') : joinIn(inner),
    ]),
  )
}
