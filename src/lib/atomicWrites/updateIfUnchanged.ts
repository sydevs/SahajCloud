import type { CollectionSlug, Payload, PayloadRequest, RequestContext, Where } from 'payload'

/**
 * Update one row only while it still holds the values its caller read.
 *
 * A background writer reads a row, does slow work — sends an email, renders a
 * page — and writes afterwards. Anything decided in that window is lost unless
 * the write says what it assumed. `expect` is that assumption, ANDed with the
 * row's id into the `where` of a single `payload.update`, so the row is
 * re-selected at write time and the newer decision stands.
 *
 * ⚠ **`payload.update`, not the atomic `payload.db.updateOne`.** That form
 * writes the main table alone, and both callers need what the operation
 * carries: the `afterChange` hook that keeps an event's capacity flag in step
 * when a registration's delivery fails, and the version row an unpublish
 * writes. What stays open is Payload's own select-then-update, which is
 * milliseconds — not the render or the send this closes.
 *
 * A lost race is reported, never thrown: the caller has already done its
 * outside work, and the other writer's value is the newer one. A write that
 * genuinely failed is still raised — the bulk form collects a per-document
 * error rather than throwing it, so an unraised one would be swallowed here.
 */
export async function updateIfUnchanged(args: {
  payload: Payload
  collection: CollectionSlug
  id: number | string
  /** What the caller read, as a `Where` over this one row. */
  expect: Where
  data: Record<string, unknown>
  context?: RequestContext
  depth?: number
  overrideAccess?: boolean
  req?: PayloadRequest
  /** Payload's flag for a write that must not re-validate stored data. */
  unpublishAllLocales?: boolean
}): Promise<boolean> {
  const { payload, collection, id, expect, ...update } = args

  // `as never`: `collection` is the whole slug union here, so Payload cannot
  // narrow `data` to one collection's shape. Each caller passes its own fields.
  const { docs, errors } = (await payload.update({
    ...update,
    collection,
    where: { and: [{ id: { equals: id } }, expect] },
  } as never)) as { docs: unknown[]; errors: { message: string }[] }

  if (errors.length > 0) throw new Error(errors[0].message)
  if (docs.length > 0) return true

  payload.logger.info({
    msg: 'updateIfUnchanged: the row moved while this write was being prepared; leaving it',
    collection,
    id,
  })
  return false
}
