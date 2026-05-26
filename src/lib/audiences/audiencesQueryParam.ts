import { z } from 'zod'

/**
 * Zod schema for the `audiences` query param accepted by the three
 * `/for-audience` data endpoints.
 *
 * Canonical wire format: comma-separated positive integers
 * (e.g. `audiences=3,1,2`). The single canonical form keeps the OpenAPI
 * shape simple and the cache-key permutation predictable. As a
 * compatibility nicety, repeated query params (`audiences=3&audiences=1`),
 * which `qs-esm` parses into an array, are also accepted: array values get
 * joined with commas and run through the same parser, so the canonical
 * comma-separated form remains the contract.
 *
 * Server-side normalization: the parsed list is **deduplicated and sorted
 * ascending**, so `audiences=3,1,2` and `audiences=2,3,1,2` collapse to the
 * same `[1, 2, 3]`. Together with `Cache-Control` on the data endpoints,
 * this means equivalent client requests share an edge-cache entry.
 *
 * Empty input rejects with a 400. Mobile clients are expected to call
 * `/api/audiences/for-user` first and pass that response through; an empty
 * `audiences` value usually means "no audiences match this user", and the
 * caller can decide to short-circuit on its side rather than firing a
 * round-trip we know will return `{ docs: [] }`.
 */
export const audiencesQueryParamSchema = z
  .preprocess(
    (value) => {
      if (Array.isArray(value)) return value.join(',')
      return value
    },
    z.string({ error: 'audiences must be a comma-separated string of IDs' }),
  )
  .transform((raw, ctx) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    const ids: number[] = []
    for (const part of parts) {
      if (!/^\d+$/.test(part)) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid audience ID: "${part}"`,
        })
        return z.NEVER
      }
      ids.push(parseInt(part, 10))
    }

    if (ids.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'audiences must be a non-empty list of comma-separated IDs',
      })
      return z.NEVER
    }

    return [...new Set(ids)].sort((a, b) => a - b)
  })
