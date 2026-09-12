import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findInImportGraph, SRC } from '../utils/importGraph'

/**
 * Nothing an admin **client** component imports may reach server-only code.
 *
 * This is not a style preference — it is a build failure that CI cannot see.
 * GitHub Actions does not build this app (Railway does), so a client component
 * that pulls in `pg` compiles, type-checks, passes every test, and then fails
 * the deploy with `Module not found: Cannot resolve 'dns'`. That happened: the
 * canonical picker imported `@/lib/clients/canonical`, which imported the
 * `@/plugins/usage` barrel, which re-exports the pg-pool seam.
 *
 * Walking the real import graph keeps the guard honest — asserting on a list of
 * "forbidden files" would go stale the moment someone adds a module. The walk
 * itself lives in `tests/utils/importGraph.ts`, shared with
 * `public-env-substitution.spec.ts`.
 */

/** Barrels and modules that drag Node-only dependencies in with them. */
const SERVER_ONLY = [
  { spec: '@/plugins/usage', reason: 're-exports the pg pool (getPgPool/quotedDbSchema)' },
  { spec: '@/plugins/usage/db', reason: 'imports pg directly' },
  { spec: '@/lib/env/server', reason: 'validates and holds server secrets' },
  { spec: '@/jobs/VerifyEmbeds/browserRendering', reason: 'holds Cloudflare credentials' },
]

/** Depth-first walk from a client entry, returning the first offending path. */
function findServerOnlyImport(entry: string): { chain: string[]; reason: string } | null {
  return findInImportGraph(entry, (spec) => {
    const hit = SERVER_ONLY.find((entryPoint) => entryPoint.spec === spec)
    return hit ? { reason: hit.reason } : null
  })
}

describe('admin client components stay out of the server bundle', () => {
  const entries = [
    'components/admin/CanonicalEmbedPicker/CanonicalEmbedPicker.tsx',
    'components/admin/CanonicalEmbedPicker/Description.tsx',
    'components/admin/CanonicalEmbedPicker/model.ts',
    // Reaches into `@/collections/UserMessages/*` for its status vocabulary and
    // verdict shape. Those are leaf modules precisely so this import cannot drag
    // the collection — and with it the hooks, the mailer and `node:crypto` —
    // into the admin bundle.
    'components/admin/UserMessages/UserMessageStatus.tsx',
  ]

  it.each(entries)('%s imports nothing server-only', (relative) => {
    const found = findServerOnlyImport(join(SRC, relative))
    expect(
      found,
      found ? `${found.chain.join(' → ')}\n  (${found.reason})` : '',
    ).toBeNull()
  })

  // Proves the walker actually traverses rather than passing vacuously: the
  // report endpoint legitimately uses the pg seam, so it must be caught.
  it('catches a server-only import when there is one', () => {
    const found = findServerOnlyImport(join(SRC, 'collections/Clients/endpoints/report.ts'))
    expect(found).not.toBeNull()
    expect(found?.chain.at(-1)).toBe('@/plugins/usage')
  })
})
