import type { PayloadRequest, Where } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

/**
 * How many rows a predicate holds, said in one sentence — or `null` for none.
 *
 * Two surfaces close with a line of this shape, and the digest treats the
 * results as interchangeable. `null` rather than a zero is what lets a caller
 * leave the line out without deciding a second time.
 */
export async function countNote(args: {
  req: PayloadRequest
  where: Where
  overrideAccess: boolean
  text: (count: number) => string
}): Promise<null | { count: number; text: string }> {
  const { req, where, overrideAccess, text } = args

  const { totalDocs: count } = await req.payload.count({
    collection: 'user-submissions',
    where,
    overrideAccess,
    req: localeIsolatedReq(req),
  })

  return count === 0 ? null : { count, text: text(count) }
}
