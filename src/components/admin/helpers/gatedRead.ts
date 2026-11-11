import type {
  CollectionSlug,
  PayloadRequest,
  SelectType,
  TransformCollectionWithSelect,
} from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

/**
 * The row under the caller's own read access, `null` where they may not read
 * it — the named gate a server field component owes itself before it reads
 * anything.
 *
 * ⚠ A `form-state` request names its own `id` past nothing but
 * `canAccessAdmin`, so a component reading the database from it answers for
 * whatever row the caller names (#1126, `docs/rules/admin-ui.md`). Call this
 * first and render nothing when it refuses; a privileged read may follow.
 *
 * `select` the narrowest column where only the refusal is wanted: the value is
 * then unused.
 */
export function gatedRead<TSlug extends CollectionSlug, TSelect extends SelectType>(
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
