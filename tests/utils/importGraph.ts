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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const SRC = resolve(__dirname, '../../src')

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
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Every specifier `file` imports, in all three forms a bundler follows:
 * `import … from 'x'`, the bare side-effect `import 'x'`, and dynamic
 * `import('x')`. `import type` is excluded — it is erased at build.
 */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specs: string[] = []

  const patterns = [
    // `import { type A, b } from 'x'` still emits a runtime import.
    /^\s*(?:import|export)\s+(?!type\b)([^'"]*?)from\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) specs.push(match[2] ?? match[1])
  }
  return specs
}

/**
 * Depth-first walk from `entry`. `onSpec` sees every specifier reached; the
 * first non-null return wins, carrying the import chain that led there — so a
 * failure message can name the path, not just the offender.
 */
function walk<T>(
  entry: string,
  onSpec?: (spec: string) => T | null,
): { hit: (T & { chain: string[] }) | null; files: string[] } {
  const seen = new Set<string>()
  const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [entry] }]

  while (stack.length > 0) {
    const { file, chain } = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const spec of importsOf(file)) {
      const found = onSpec?.(spec)
      if (found) return { hit: { ...found, chain: [...chain, spec] }, files: [...seen] }

      const next = resolveSpec(spec, file)
      if (next) stack.push({ file: next, chain: [...chain, spec] })
    }
  }
  return { hit: null, files: [...seen] }
}

/** The first specifier reached from `entry` that `onSpec` claims, with its chain. */
export function findInImportGraph<T>(
  entry: string,
  onSpec: (spec: string) => T | null,
): (T & { chain: string[] }) | null {
  return walk(entry, onSpec).hit
}

/**
 * Every file under `src/` reachable from `entry`, including `entry` itself.
 *
 * A specifier that resolves nowhere under `src/` — a package, a CSS import — is
 * simply not in the result. That is the point: this answers "which of *our*
 * modules end up in this bundle".
 */
export function reachableFiles(entry: string): string[] {
  return walk(entry).files
}

/** Every `.ts`/`.tsx` file under `src/`. */
function sourceFiles(dir: string = SRC, out: string[] = []): string[] {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) sourceFiles(path, out)
    else if (/\.tsx?$/.test(item.name)) out.push(path)
  }
  return out
}

/**
 * The modules a browser executes: every `'use client'` file, plus the entries
 * Next runs client-side by filename convention.
 *
 * Derived, never listed. A hand-written entry list is the failure mode both
 * guards exist to prevent — a new client component gets no guard at all until
 * someone remembers to add it, which is how #760 survived.
 */
export function clientEntries(): string[] {
  const useClient = sourceFiles().filter((file) =>
    /^\s*(?:\/\*[\s\S]*?\*\/\s*)?['"]use client['"]/.test(readFileSync(file, 'utf8')),
  )
  return [...useClient, join(SRC, 'instrumentation-client.ts')]
}
