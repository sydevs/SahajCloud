import type { Payload, PayloadRequest } from 'payload'

/** Max ids per `in` query, so a large registrant set doesn't build one huge clause. */
const USER_CHUNK = 200

/**
 * Batch-load registrant users' name + email by id, chunked to bound the `in`
 * list. Shared by both notification jobs, which resolve registrations at depth 0
 * (bare ids) and then look up only the users they actually send to.
 */
export async function loadUsers(
  payload: Payload,
  req: PayloadRequest,
  userIds: number[],
): Promise<Map<number, { name?: string | null; email: string }>> {
  const map = new Map<number, { name?: string | null; email: string }>()
  for (let i = 0; i < userIds.length; i += USER_CHUNK) {
    const chunk = userIds.slice(i, i + USER_CHUNK)
    const batch = await payload.find({
      collection: 'users',
      where: { id: { in: chunk } },
      depth: 0,
      limit: chunk.length,
      select: { name: true, email: true },
      overrideAccess: true,
      req,
    })
    for (const user of batch.docs) map.set(user.id, { name: user.name, email: user.email })
  }
  return map
}
