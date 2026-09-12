import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { reachableFiles, SRC } from '../utils/importGraph'

/**
 * Browser code may read `process.env` **only** as a literal `process.env.<KEY>`
 * member expression.
 *
 * Next's DefinePlugin substitutes that one form and nothing else. A bare
 * `process.env` in a browser bundle is the empty object from
 * `next/dist/compiled/process`, so anything that parses it, destructures it, or
 * indexes it with a computed key gets nothing — silently, and looking exactly
 * like configuration that works.
 *
 * That is not hypothetical. `clientEnv` was `ClientEnvSchema.parse(process.env)`
 * and every `NEXT_PUBLIC_*` value read through it was `undefined` in the
 * browser, so both client `Sentry.init` calls sat behind a DSN that could never
 * be truthy and no browser error was reported at all — on production or on any
 * preview, for as long as the module existed (#760).
 *
 * ⚠ **No runtime test can catch this.** The unit lane runs in node, where
 * `process.env` is the real thing and the defective code passes. Only the shape
 * of the source distinguishes them, which is why this spec reads the AST.
 */

/**
 * The modules a browser actually executes, as graph entry points.
 *
 * `ProjectSelector.tsx` belongs here and is deliberately absent: it reaches
 * `@/lib/env/server` through the `@/plugins/access` barrel — the #633 shape
 * `client-bundle-safety.spec.ts` exists for, and a violation of that rule
 * rather than this one. Add it back when that import is fixed (#770).
 */
const BROWSER_ENTRIES = [
  // Next runs this on every page load in the browser.
  'instrumentation-client.ts',
  // `'use client'` components, and what they pull in.
  'components/ErrorBoundary.tsx',
  'components/admin/AddressSearchField/AddressSearchField.tsx',
  'components/admin/CanonicalEmbedPicker/CanonicalEmbedPicker.tsx',
  'components/admin/UserMessages/UserMessageStatus.tsx',
  // Not an entry point of its own, but the other half of #760 and only ever
  // imported by client components.
  'lib/logger/clientLogger.ts',
]

interface Offence {
  file: string
  line: number
  text: string
}

/**
 * Every `process.env` in `file` that is not a literal `process.env.<KEY>` read.
 *
 * Reading the AST rather than the text matters: this file and the modules it
 * guards both discuss `process.env` in prose, and a regex cannot tell a comment
 * from code.
 */
function nonLiteralEnvReads(file: string): Offence[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const offences: Offence[] = []

  const isProcessEnv = (node: ts.Node): boolean =>
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'env'

  const visit = (node: ts.Node): void => {
    if (isProcessEnv(node)) {
      // The one substituted form: `process.env.KEY`, read as a value.
      const literalRead =
        ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node

      if (!literalRead) {
        const { line } = source.getLineAndCharacterOfPosition(node.parent.getStart(source))
        offences.push({
          file: relative(SRC, file),
          line: line + 1,
          text: node.parent.getText(source).split('\n')[0].slice(0, 120),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return offences
}

describe('browser code reads NEXT_PUBLIC_* as a literal member expression', () => {
  it.each(BROWSER_ENTRIES)('nothing reachable from %s reads a bare process.env', (relativeEntry) => {
    const offences = reachableFiles(join(SRC, relativeEntry)).flatMap(nonLiteralEnvReads)

    expect(
      offences,
      offences
        .map((o) => `${o.file}:${o.line}  ${o.text}\n  (Next substitutes process.env.<KEY> only)`)
        .join('\n'),
    ).toEqual([])
  })

  // Proves the scanner is not passing vacuously. `src/lib/env/server.ts` hands a
  // bare `process.env` to zod on purpose — it is server-only, where that is the
  // real object — so it is exactly the shape this spec rejects in the browser.
  it('flags a bare process.env where one legitimately exists', () => {
    const offences = nonLiteralEnvReads(join(SRC, 'lib/env/server.ts'))

    expect(offences.length).toBeGreaterThan(0)
    expect(offences.some((o) => o.text.includes('ServerEnvSchema.parse(process.env)'))).toBe(true)
  })

  // Proves the walk reaches past the entry file itself — and reaches the exact
  // module #760 lived in. A `clientEnv` reintroduced there would be scanned.
  it('walks past the entry file, into src/lib/env/client.ts', () => {
    const reached = reachableFiles(join(SRC, 'lib/logger/clientLogger.ts')).map((file) =>
      relative(SRC, file),
    )

    expect(reached).toContain('lib/env/client.ts')
  })
})
