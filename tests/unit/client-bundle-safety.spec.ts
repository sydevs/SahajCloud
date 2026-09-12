import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { clientEntries, findInImportGraph, SRC } from '../utils/importGraph'

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

/**
 * Modules that drag Node-only dependencies in with them, as src-relative
 * **files**.
 *
 * Matching the import *specifier* is what made this guard unfailable: the edge
 * into `lib/env/server.ts` is `@/lib/env`'s own `./server`, a specifier no
 * caller writes and no list can enumerate. So the walk resolves each specifier
 * and this matches the file it lands on (#770). The chain in the failure
 * message still reports specifiers, which is what a reader needs to find the
 * import to cut.
 */
const SERVER_ONLY = [
  { file: 'plugins/usage/index.ts', reason: 're-exports the pg pool (getPgPool/quotedDbSchema)' },
  { file: 'plugins/usage/db.ts', reason: 'imports pg directly' },
  { file: 'lib/env/server.ts', reason: 'validates and holds server secrets' },
  { file: 'jobs/VerifyEmbeds/browserRendering.ts', reason: 'holds Cloudflare credentials' },
]

/** Depth-first walk from a client entry, returning the first offending path. */
function findServerOnlyImport(entry: string): { chain: string[]; reason: string } | null {
  return findInImportGraph(entry, (_spec, file) => {
    if (!file) return null
    const hit = SERVER_ONLY.find((entryPoint) => entryPoint.file === relative(SRC, file))
    return hit ? { reason: hit.reason } : null
  })
}

describe('admin client components stay out of the server bundle', () => {
  // Derived, never listed. A hand-written list guards only what someone
  // remembered to add — it held four entries while 88 others went unwatched.
  //
  // Among them, `components/admin/UserMessages/UserMessageStatus.tsx` reaches
  // into `@/collections/UserMessages/*` for its status vocabulary and verdict
  // shape. Those are leaf modules precisely so this import cannot drag the
  // collection — and with it the hooks, the mailer and `node:crypto` — into the
  // admin bundle.
  const entries = clientEntries().map((file) => relative(SRC, file))

  it.each(entries)('%s imports nothing server-only', (entry) => {
    const found = findServerOnlyImport(join(SRC, entry))
    expect(found, found ? `${found.chain.join(' → ')}\n  (${found.reason})` : '').toBeNull()
  })

  // Without this, an entry set that silently came back empty passes every case
  // above by having no cases at all.
  it('derives the browser entries rather than listing them', () => {
    expect(entries.length).toBeGreaterThan(50)
    expect(entries).toContain('instrumentation-client.ts')
    expect(entries).toContain('components/admin/UserMessages/UserMessageStatus.tsx')
  })

  // Proves the walker actually traverses rather than passing vacuously: the
  // report endpoint legitimately uses the pg seam, so it must be caught.
  it('catches a server-only import when there is one', () => {
    const found = findServerOnlyImport(join(SRC, 'collections/Clients/endpoints/report.ts'))
    expect(found).not.toBeNull()
    expect(found?.chain.at(-1)).toBe('@/plugins/usage')
  })
})
