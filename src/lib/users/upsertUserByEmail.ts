import type { PayloadRequest } from 'payload'

import { asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Find-or-create a `users` (registrant) row by normalized email — the shared
 * identity step behind every public flow that captures a person (event
 * registration, event submission). Race-safe: a concurrent request with the
 * same email can create the row between our find and create (email is
 * unique), so a failed create re-finds instead of surfacing a 500.
 *
 * `users` is a restricted, admin-only collection — the client can't touch it
 * directly — so the writes elevate via `overrideAccess`. The caller's `req`
 * still rides along (transaction + hooks): when it carries a client user, the
 * write-guard plugin's `users` policy (email format + disposable list, URL
 * scan on the name) applies to the create — that's the point, not a bug.
 *
 * Returns the user id.
 */
export async function upsertUserByEmail(args: {
  req: PayloadRequest
  name: string
  email: string
}): Promise<number> {
  const { req, name } = args
  const normalizedEmail = args.email.toLowerCase()

  const { docs } = await req.payload.find({
    collection: 'users',
    where: { email: { equals: normalizedEmail } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req: asTrustedReq(req),
  })
  const existing = docs[0]?.id
  if (existing != null) return existing

  try {
    const created = await req.payload.create({
      collection: 'users',
      data: { name, email: normalizedEmail },
      overrideAccess: true,
      req,
    })
    return created.id
  } catch (createError) {
    const { docs: raced } = await req.payload.find({
      collection: 'users',
      where: { email: { equals: normalizedEmail } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: asTrustedReq(req),
    })
    if (raced[0]?.id == null) throw createError
    return raced[0].id
  }
}
