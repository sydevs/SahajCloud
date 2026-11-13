import type {
  CollectionSlug,
  PayloadRequest,
  SelectType,
  TransformCollectionWithSelect,
} from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

/**
 * One row as `req.user` may read it: the row, or `null` where that user's own
 * access refuses it. Every other read in these components runs with
 * `overrideAccess: true` and so answers for anyone.
 *
 * ⚠ Call it before a server field component reads anything — in the loader
 * where several share one — and render nothing when it answers `null`. Such a
 * component is reachable on any `form-state` request, and that request names
 * its own `id` and carries its own `data` past nothing but `canAccessAdmin`, so
 * a component trusting either answers for whatever row the caller asked about
 * (#1126, `docs/rules/admin-ui.md`). A privileged read may follow this one.
 *
 * `select` the narrowest column where only the refusal is wanted: the row is
 * then unused, and this read is purely the access check.
 */
export function readAsRequestUser<TSlug extends CollectionSlug, TSelect extends SelectType>(
  req: PayloadRequest,
  collection: TSlug,
  id: number,
  select: TSelect,
): Promise<TransformCollectionWithSelect<TSlug, TSelect> | null> {
  // ⚠ Payload resolves `select` and the answer per collection slug, which over
  // the whole union is TS2590 — too complex to represent. Pinned to `never`
  // inside; the signature above still narrows the row to the selected columns.
  return req.payload.findByID<TSlug, true, never>({
    collection,
    id,
    depth: 0,
    select: select as never,
    overrideAccess: false,
    disableErrors: true,
    req: localeIsolatedReq(req),
  }) as Promise<TransformCollectionWithSelect<TSlug, TSelect> | null>
}
