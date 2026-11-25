import type { Plugin } from 'payload'

import { startImpersonation, stopImpersonation } from './endpoints'
import { afterMeImpersonation, refreshImpersonatorToken, refuseOwnRowWrites } from './hooks'
import { createImpersonationStrategy } from './strategy'

export const IMPERSONATION_BANNER = '@/components/admin/ImpersonationBanner'

/**
 * Support impersonation: the support account acts as a manager in the real
 * admin, to reproduce a permission problem. See this folder's `AGENTS.md`.
 *
 * ⚠ **Register before `accessPlugin`.** The strategy is prepended and the
 * access plugin appends `localized-roles`, so this one runs first; the
 * reverse order would authenticate support as themself and never reach it.
 */
export const impersonationPlugin: Plugin = (config) => ({
  ...config,
  admin: {
    ...config.admin,
    components: {
      ...config.admin?.components,
      header: [...(config.admin?.components?.header ?? []), IMPERSONATION_BANNER],
    },
  },
  collections: (config.collections ?? []).map((collection) => {
    if (collection.slug !== 'managers') return collection
    const auth = typeof collection.auth === 'object' ? collection.auth : {}
    return {
      ...collection,
      auth: { ...auth, strategies: [createImpersonationStrategy(), ...(auth.strategies ?? [])] },
      endpoints: [...(collection.endpoints || []), startImpersonation, stopImpersonation],
      hooks: {
        ...collection.hooks,
        afterMe: [...(collection.hooks?.afterMe ?? []), afterMeImpersonation],
        beforeOperation: [...(collection.hooks?.beforeOperation ?? []), refuseOwnRowWrites],
        refresh: [refreshImpersonatorToken, ...(collection.hooks?.refresh ?? [])],
      },
    }
  }),
})
