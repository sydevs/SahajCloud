import type { ParseQueryResult } from './parseQuery'
import type { PayloadRequest } from 'payload'

import { z } from 'zod'

/**
 * Validate a JSON request body against a Zod `schema` — the POST counterpart to
 * {@link parseQuery}. Custom Payload endpoints don't get `req.data` populated, so
 * this reads the body via `await req.json()` (returning a `400` on unparseable
 * JSON) and then runs the same `safeParse → 400` envelope:
 *
 * ```typescript
 * const parsed = await parseBody(req, bodySchema)
 * if (!parsed.ok) return parsed.response
 * const { email } = parsed.data
 * ```
 */
export async function parseBody<S extends z.ZodTypeAny>(
  req: PayloadRequest,
  schema: S,
): Promise<ParseQueryResult<z.infer<S>>> {
  let body: unknown
  try {
    body = await req.json?.()
  } catch {
    return {
      ok: false,
      response: Response.json(
        { errors: [{ message: 'Request body must be valid JSON.' }] },
        { status: 400 },
      ),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, response: Response.json({ errors: parsed.error.issues }, { status: 400 }) }
  }
  return { ok: true, data: parsed.data }
}
