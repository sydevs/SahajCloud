import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

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
 * "forbidden files" would go stale the moment someone adds a module.
 */

const SRC = resolve(__dirname, '../../src')

/** Barrels and modules that drag Node-only dependencies in with them. */
const SERVER_ONLY = [
  { spec: '@/plugins/usage', reason: 're-exports the pg pool (getPgPool/quotedDbSchema)' },
  { spec: '@/plugins/usage/db', reason: 'imports pg directly' },
  { spec: '@/lib/env/server', reason: 'validates and holds server secrets' },
  { spec: '@/jobs/VerifyEmbeds/browserRendering', reason: 'holds Cloudflare credentials' },
]

/** Resolve an `@/…` or relative specifier to a file under src/, or null. */
function resolveSpec(spec: string, fromFile: string): string | null {
  const base = spec.startsWith('@/')
    ? join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(fromFile), spec)
      : null
  if (!base) return null

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      /* try the next shape */
    }
  }
  return null
}

/** Every specifier `file` imports, ignoring `import type` (erased at build). */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specs: string[] = []
  const re = /^\s*(?:import|export)\s+(?!type\b)([^'"]*?)from\s*['"]([^'"]+)['"]/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    // `import { type A, b }` still emits a runtime import. `import type { A }` does not.
    specs.push(match[2])
  }
  return specs
}

/** Depth-first walk from a client entry, returning the first offending path. */
function findServerOnlyImport(entry: string): { chain: string[]; reason: string } | null {
  const seen = new Set<string>()
  const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [entry] }]

  while (stack.length > 0) {
    const { file, chain } = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const spec of importsOf(file)) {
      const hit = SERVER_ONLY.find((entryPoint) => entryPoint.spec === spec)
      if (hit) return { chain: [...chain, spec], reason: hit.reason }

      const next = resolveSpec(spec, file)
      if (next) stack.push({ file: next, chain: [...chain, spec] })
    }
  }
  return null
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
