import type { Field, Plugin } from 'payload'

import { startImpersonation, stopImpersonation } from './endpoints'
import {
  endImpersonationOnLogout,
  overlayImpersonation,
  refreshImpersonatorToken,
  refuseOwnRowWrites,
} from './hooks'
import { createImpersonationStrategy } from './strategy'

/** "Sign in as this manager", shown to the support account alone. */
const START_BUTTON: Field = {
  name: 'impersonate',
  type: 'ui',
  admin: { position: 'sidebar', components: { Field: '@/components/admin/ImpersonateButton' } },
}

/**
 * Support impersonation: the support account acts as a manager in the real
 * admin, to reproduce a permission problem. See this folder's `AGENTS.md`.
 *
 * The strategy is prepended and `accessPlugin` appends `localized-roles`, so
 * this one runs first whichever plugin is registered first.
 */
export const impersonationPlugin: Plugin = (config) => ({
  ...config,
  admin: {
    ...config.admin,
    components: {
      ...config.admin?.components,
      header: [
        ...(config.admin?.components?.header ?? []),
        '@/components/admin/ImpersonationBanner',
      ],
    },
  },
  collections: (config.collections ?? []).map((collection) => {
    if (collection.slug !== 'managers') return collection
    const auth = typeof collection.auth === 'object' ? collection.auth : {}
    return {
      ...collection,
      auth: { ...auth, strategies: [createImpersonationStrategy(), ...(auth.strategies ?? [])] },
      endpoints: [...(collection.endpoints || []), startImpersonation, stopImpersonation],
      fields: [...collection.fields, START_BUTTON],
      hooks: {
        ...collection.hooks,
        afterLogout: [...(collection.hooks?.afterLogout ?? []), endImpersonationOnLogout],
        afterRead: [...(collection.hooks?.afterRead ?? []), overlayImpersonation],
        beforeOperation: [...(collection.hooks?.beforeOperation ?? []), refuseOwnRowWrites],
        refresh: [refreshImpersonatorToken, ...(collection.hooks?.refresh ?? [])],
      },
    }
  }),
})
