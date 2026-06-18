import type { PayloadRequest } from 'payload'

import { z } from 'zod'

/**
 * Result of {@link parseQuery}: a discriminated union so handlers narrow on `ok`
 * without re-deriving the `400` shape. On failure, `response` is a ready-to-return
 * `400` carrying the Zod issues; on success, `data` is the schema's parsed output.
 */
export type ParseQueryResult<T> = { ok: true; data: T } | { ok: false; response: Response }

/**
 * Validate `req.query` against a Zod `schema`, collapsing the repeated
 * `safeParse → 400` block shared by the client endpoints:
 *
 * ```typescript
 * const parsed = parseQuery(req, querySchema)
 * if (!parsed.ok) return parsed.response
 * const { audiences, limit } = parsed.data
 * ```
 *
 * The `400` body (`{ errors: parsed.error.issues }`) is byte-identical to the
 * inline blocks it replaces.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  req: PayloadRequest,
  schema: S,
): ParseQueryResult<z.infer<S>> {
  const parsed = schema.safeParse(req.query)
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json({ errors: parsed.error.issues }, { status: 400 }),
    }
  }
  return { ok: true, data: parsed.data }
}
