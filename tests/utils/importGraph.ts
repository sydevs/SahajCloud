/**
 * Walk the real import graph under `src/`, from an entry file outwards.
 *
 * Two specs need this and neither can get the answer any other way: CI does not
 * build this app (Railway does), so what a browser entry actually pulls in is
 * invisible until a deploy fails. Walking the graph keeps a guard honest —
 * asserting on a hand-written list of files goes stale the moment someone adds
 * a module in between.
 *
 * Used by `client-bundle-safety.spec.ts` (nothing client-side may reach
 * server-only code) and `public-env-substitution.spec.ts` (browser code may
 * read `process.env` only as a literal member expression).
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const SRC = resolve(__dirname, '../../src')

/** Resolve an `@/…` or relative specifier to a file under src/, or null. */
export function resolveSpec(spec: string, fromFile: string): string | null {
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
export function importsOf(file: string): string[] {
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

/**
 * Depth-first walk from `entry`, calling `visit` for every (file, specifier)
 * pair reached. The first non-null return wins, with the import chain that led
 * there — so a failure message can name the path, not just the offender.
 */
export function findInImportGraph<T>(
  entry: string,
  visit: (spec: string, chain: string[]) => T | null,
): (T & { chain: string[] }) | null {
  const seen = new Set<string>()
  const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [entry] }]

  while (stack.length > 0) {
    const { file, chain } = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const spec of importsOf(file)) {
      const hit = visit(spec, chain)
      if (hit) return { ...hit, chain: [...chain, spec] }

      const next = resolveSpec(spec, file)
      if (next) stack.push({ file: next, chain: [...chain, spec] })
    }
  }
  return null
}

/**
 * Every file under `src/` reachable from `entry`, including `entry` itself.
 *
 * A specifier that resolves nowhere under `src/` — a package, a CSS import — is
 * simply not in the result. That is the point: this answers "which of *our*
 * modules end up in this bundle".
 */
export function reachableFiles(entry: string): string[] {
  const seen = new Set<string>()
  const stack = [entry]

  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const spec of importsOf(file)) {
      const next = resolveSpec(spec, file)
      if (next) stack.push(next)
    }
  }
  return [...seen]
}
