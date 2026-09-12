import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { clientEntries, reachableFiles, SRC } from '../utils/importGraph'

/**
 * Browser code may read `process.env` **only** as a literal `process.env.<KEY>`
 * member expression — the one form Next's DefinePlugin substitutes. Anything
 * that parses, destructures, or indexes it reads the empty stub from
 * `next/dist/compiled/process` and gets nothing, silently (#760).
 *
 * ⚠ **No runtime test can catch this.** The unit lane runs in node, where
 * `process.env` is the real object, so the defective code passes. Only the
 * shape of the source distinguishes them, which is why this spec reads the AST
 * — and why a regex will not do: the modules it guards discuss `process.env`
 * in prose, and a regex cannot tell a comment from code.
 *
 * It errs strict. `process.env['KEY']` is flagged although DefinePlugin does
 * substitute a string-literal computed member, and `process.env?.KEY` is not
 * flagged although it is not substituted. Neither shape appears in `src/`.
 */

/**
 * Files reached from client code that still hold a bare `process.env`, with the
 * ticket that will remove them. A backlog, not an approval — it should only
 * shrink, in the spirit of `KNOWN_SINGLE_CONSUMER` in `lib-boundary.spec.ts`.
 *
 * Exempting a *file* here does not hide a new offender: reaching server-only
 * code from a client entry is `client-bundle-safety.spec.ts`'s rule, and
 * `@/lib/env/server` is on its list.
 */
const KNOWN_OFFENDERS = new Map([
  [
    'lib/env/server.ts',
    'reached by 14 client entries, all via @/plugins/access → @/lib/env (#770)',
  ],
])

interface Offence {
  file: string
  line: number
  text: string
}

/** Every `process.env` in `file` that is not a literal `process.env.<KEY>` read. */
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

/** Every src/ module a browser can reach, deduplicated across entries. */
function clientReachableFiles(): string[] {
  const union = new Set<string>()
  for (const entry of clientEntries()) for (const file of reachableFiles(entry)) union.add(file)
  return [...union]
}

describe('browser code reads NEXT_PUBLIC_* as a literal member expression', () => {
  it('nothing a browser reaches reads a bare process.env', () => {
    const offences = clientReachableFiles()
      .flatMap(nonLiteralEnvReads)
      .filter((offence) => !KNOWN_OFFENDERS.has(offence.file))

    expect(
      offences,
      offences
        .map((o) => `${o.file}:${o.line}  ${o.text}\n  (Next substitutes process.env.<KEY> only)`)
        .join('\n'),
    ).toEqual([])
  })

  // Three controls. Without them this spec passes for reasons unrelated to the
  // property: an entry set that silently came back empty, a walk that never
  // leaves its entries, or a scanner that flags nothing at all.
  it('finds the browser entries, including the ones this ticket touched', () => {
    const entries = clientEntries().map((file) => relative(SRC, file))

    expect(entries.length).toBeGreaterThan(50)
    expect(entries).toContain('instrumentation-client.ts')
    expect(entries).toContain('components/ErrorBoundary.tsx')
    expect(entries).toContain('app/global-error.tsx')
  })

  it('walks past the entry files', () => {
    const reached = clientReachableFiles().map((file) => relative(SRC, file))
    const entries = new Set(clientEntries().map((file) => relative(SRC, file)))

    // `model.ts` is two hops out, through CanonicalEmbedPicker.
    expect(reached).toContain('components/admin/CanonicalEmbedPicker/model.ts')
    expect(reached.filter((file) => !entries.has(file)).length).toBeGreaterThan(20)
  })

  // `src/lib/env/server.ts` hands a bare `process.env` to zod on purpose — it is
  // server-only, where that is the real object — so it is exactly the shape this
  // spec rejects in the browser, and the scanner must see it.
  it('flags a bare process.env where one legitimately exists', () => {
    const offences = nonLiteralEnvReads(join(SRC, 'lib/env/server.ts'))

    expect(offences.length).toBeGreaterThan(0)
    expect(offences.some((o) => o.text.includes('ServerEnvSchema.parse(process.env)'))).toBe(true)
  })
})
