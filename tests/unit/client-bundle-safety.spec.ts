import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { clientEntries, findInImportGraph, sourceFiles, sourceOf, SRC } from '../utils/importGraph'

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
 * Modules a browser entry may not reach, as src-relative **files**.
 *
 * Matching the import *specifier* is what made this guard unfailable: the edge
 * into `lib/env/server.ts` is `@/lib/env`'s own `./server`, a specifier no
 * caller writes and no list can enumerate. So the walk resolves each specifier
 * and this matches the file it lands on (#770). The chain in the failure
 * message still reports specifiers, which is what a reader needs to find the
 * import to cut.
 *
 * Two kinds of row. Most drag a Node-only dependency in with them. The access
 * barrel is here for its weight instead: it is the rule `src/AGENTS.md` states,
 * and without its own row it is caught only while it happens to reach
 * `lib/env/server.ts` — cut that one edge and the browser still downloads
 * `accessPlugin`, `fieldAccess`, `accessConfigs` and `permissions`.
 */
const SERVER_ONLY = new Map(
  [
    ['plugins/usage/index.ts', 're-exports the pg pool (getPgPool/quotedDbSchema)'],
    ['plugins/usage/db.ts', 'imports pg directly'],
    ['lib/env/server.ts', 'validates and holds server secrets'],
    ['lib/embedVerification/browserRendering.ts', 'holds Cloudflare credentials'],
    [
      'plugins/access/index.ts',
      'the access barrel — client code imports ./config, ./adminOnly or ./types',
    ],
  ].map(([file, reason]) => [join(SRC, file), reason]),
)

/** Depth-first walk from a client entry, returning the first offending path. */
function findServerOnlyImport(entry: string): { chain: string[]; reason: string } | null {
  return findInImportGraph(entry, (_spec, file) => {
    const reason = file && SERVER_ONLY.get(file)
    return reason ? { reason } : null
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
  // above by having no cases at all. It also pins the swap itself: the three
  // `'use client'` files this spec used to list by hand are still entries. The
  // fourth, `CanonicalEmbedPicker/model.ts`, carries no directive — it is not
  // an entry and never was one, only a module reached from the picker.
  it('derives entries that cover the ones it used to list', () => {
    expect(entries.length).toBeGreaterThan(50)
    expect(entries).toEqual(
      expect.arrayContaining([
        'components/admin/CanonicalEmbedPicker/CanonicalEmbedPicker.tsx',
        'components/admin/CanonicalEmbedPicker/Description.tsx',
        'components/admin/UserMessages/UserMessageStatus.tsx',
      ]),
    )
  })

  // The entry set comes from a hand-rolled scan for a leading `'use client'`,
  // and a directive shape that scan misreads does not merely weaken one guard:
  // the file leaves the entry set, so this spec and
  // `public-env-substitution.spec.ts` both go quiet about it. No count can see
  // one file leave, so TypeScript's own parser is the oracle — it reports the
  // directive prologue whatever comments precede it.
  it('misses no file TypeScript reads as a client entry', () => {
    const declared = sourceFiles()
      .map((file) => ({ file, source: sourceOf(file) }))
      .filter(({ source }) => source.includes('use client'))
      .filter(({ file, source }) => {
        const parsed = ts.createSourceFile(
          file,
          source,
          ts.ScriptTarget.Latest,
          false,
          file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        )
        const first = parsed.statements[0]
        return (
          !!first &&
          ts.isExpressionStatement(first) &&
          ts.isStringLiteral(first.expression) &&
          first.expression.text === 'use client'
        )
      })
      .map(({ file }) => relative(SRC, file))

    const derived = new Set(entries)
    expect(declared.filter((file) => !derived.has(file))).toEqual([])
    expect(declared.length).toBeGreaterThan(50)
  })

  // A `SERVER_ONLY` key naming a module that does not exist is a row of this
  // guard that can never fire, and nothing else would say so: the walk simply
  // never matches it. `@/jobs/VerifyEmbeds/browserRendering` was exactly that
  // from #633 until #770 — the module had moved to `lib/embedVerification/`.
  it('names modules that exist', () => {
    const missing = [...SERVER_ONLY.keys()].filter((file) => !existsSync(file))
    expect(missing.map((file) => relative(SRC, file))).toEqual([])
  })

  // Proves the walker actually traverses rather than passing vacuously: the
  // report endpoint legitimately uses the pg seam, so it must be caught.
  it('catches a server-only import when there is one', () => {
    const found = findServerOnlyImport(join(SRC, 'collections/Clients/endpoints/report.ts'))
    expect(found).not.toBeNull()
    expect(found?.chain.at(-1)).toBe('@/plugins/usage')
  })

  // The `'use server'` stop is the one way this walk ends early, so it is the
  // one way it could go vacuous again. Pinned in both directions: loosen it and
  // real subtrees stop being walked; drop it and a server action's body is
  // reported as if the browser downloaded it.
  const verifyAction = 'app/(frontend)/events/verify/actions.ts'

  it('does not follow a client entry into a server action', () => {
    expect(findServerOnlyImport(join(SRC, 'app/(frontend)/events/verify/VerifyForm.tsx'))).toBeNull()
  })

  it('still walks a server action reached as an entry in its own right', () => {
    const found = findServerOnlyImport(join(SRC, verifyAction))
    expect(found).not.toBeNull()
    expect(found?.chain.at(-1)).toBe('./server')
  })
})
