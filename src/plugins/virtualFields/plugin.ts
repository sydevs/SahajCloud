import type { Plugin } from 'payload'

import { collectVirtualFieldInputs } from './collect'
import { ensureVirtualFieldDeps } from './ensureVirtualFieldDeps'

/**
 * Install the `select` repair on every collection whose fields declare their
 * own stored inputs with `virtualFieldInputs`.
 *
 * The declaration moved to the field because a per-collection one is a thing to
 * forget: `meditation-transcripts` grew a computed `status` while only Events
 * had declared anything, and `?select[status]=true` reported `failed` for every
 * finished transcript (#1084). A field that knows what it reads cannot be
 * mounted without saying so — which is what also retires the `url`→`filename`
 * co-select every caller owed on the eight upload collections.
 *
 * Prepended, so the `select` is whole before a hook that appends a `where`
 * reads it. The hook is a no-op unless a read uses an include-mode `select`
 * naming a declared field, so a collection gaining one costs nothing else.
 *
 * ⚠ **Runs at config build, over the collections as written.** A field Payload
 * itself adds during sanitization is invisible here, which is why the upload
 * URL fields are the repo's own factories rather than Payload's.
 */
export const virtualFieldsPlugin: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) => {
    const deps = collectVirtualFieldInputs(collection.fields)
    if (Object.keys(deps).length === 0) return collection

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        beforeOperation: [
          ensureVirtualFieldDeps(deps),
          ...(collection.hooks?.beforeOperation ?? []),
        ],
      },
    }
  }),
})
