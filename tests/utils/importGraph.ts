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
 * `file`'s source, read once per process. A walk revisits the same module from
 * every edge that reaches it, and `src/` does not change while a spec runs.
 */
const sources = new Map<string, string>()
export function sourceOf(file: string): string {
  let source = sources.get(file)
  if (source === undefined) {
    source = readFileSync(file, 'utf8')
    sources.set(file, source)
  }
  return source
}

/**
 * `source` with leading whitespace and any run of leading comments removed, so
 * what follows is the first thing a compiler reads.
 *
 * A loop, not a regex: a directive can sit behind a licence block, a `//` note,
 * or both in either order, and the nested quantifier that expresses "any run of
 * either" backtracks badly on a long file that never matches.
 */
function afterLeadingTrivia(source: string): string {
  let rest = source.trimStart()
  for (;;) {
    if (rest.startsWith('//')) {
      const end = rest.indexOf('\n')
      rest = end === -1 ? '' : rest.slice(end + 1).trimStart()
    } else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/')
      if (end === -1) return ''
      rest = rest.slice(end + 2).trimStart()
    } else {
      return rest
    }
  }
}

/**
 * True when `file`'s first statement is `directive`, behind any leading
 * comments.
 *
 * One helper for both directives on purpose: `'use client'` picks the entry set
 * and `'use server'` prunes the walk, so a fix to what counts as a directive
 * must reach both, or the two disagree about the same file. A file this misses
 * is not merely unguarded by one spec — it leaves the entry set, so both guards
 * go quiet about it at once, which is why `client-bundle-safety.spec.ts`
 * cross-checks the result against a TypeScript parse.
 */
function hasDirective(file: string, directive: 'use client' | 'use server'): boolean {
  const rest = afterLeadingTrivia(sourceOf(file))
  return rest.startsWith(`'${directive}'`) || rest.startsWith(`"${directive}"`)
}

/**
 * Every specifier `file` imports, in all three forms a bundler follows:
 * `import … from 'x'`, the bare side-effect `import 'x'`, and dynamic
 * `import('x')`. `import type` is excluded — it is erased at build.
 */
function importsOf(file: string): string[] {
  const source = sourceOf(file)
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
 * Depth-first walk from `entry`. `onSpec` sees every specifier reached **and
 * the file it resolves to** — a specifier alone cannot answer "does this reach
 * module X", because the edge into X is usually a barrel's own relative import,
 * never the specifier a caller wrote. The first non-null return wins, carrying
 * the import chain that led there — so a failure message can name the path, not
 * just the offender.
 */
function walk<T>(
  entry: string,
  onSpec?: (spec: string, file: string | null) => T | null,
): { hit: (T & { chain: string[] }) | null; files: string[] } {
  const seen = new Set<string>()
  const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [entry] }]

  while (stack.length > 0) {
    const { file, chain } = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const spec of importsOf(file)) {
      const next = resolveSpec(spec, file)

      const found = onSpec?.(spec, next)
      if (found) return { hit: { ...found, chain: [...chain, spec] }, files: [...seen] }

      // Next compiles a `'use server'` module to a client *reference* — an id
      // the browser posts back. Its body, and everything it imports, stays out
      // of the browser bundle, so the walk stops at the edge into it (#770).
      if (next && !hasDirective(next, 'use server')) {
        stack.push({ file: next, chain: [...chain, spec] })
      }
    }
  }
  return { hit: null, files: [...seen] }
}

/**
 * The first specifier reached from `entry` that `onSpec` claims, with its chain.
 * `onSpec` receives the resolved file alongside the specifier — `null` when the
 * specifier resolves nowhere under `src/` (a package, a CSS import).
 */
export function findInImportGraph<T>(
  entry: string,
  onSpec: (spec: string, file: string | null) => T | null,
): (T & { chain: string[] }) | null {
  return walk(entry, onSpec).hit
}

/**
 * Every file under `src/` reachable from `entry`, including `entry` itself.
 *
 * A specifier that resolves nowhere under `src/` — a package, a CSS import — is
 * simply not in the result. Nor is a `'use server'` module or anything below
 * it. That is the point: this answers "which of *our* modules end up in this
 * bundle".
 */
export function reachableFiles(entry: string): string[] {
  return walk(entry).files
}

/** Every `.ts`/`.tsx` file under `src/`. */
export function sourceFiles(dir: string = SRC, out: string[] = []): string[] {
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
 * Derived, never listed, and read by both guards — see the barrel rule in
 * `src/AGENTS.md` for why a hand-written entry list is the failure mode they
 * exist to prevent.
 *
 * Memoized: `src/` does not change while a spec runs, and this reads every file
 * under it.
 */
let entries: string[] | null = null
export function clientEntries(): string[] {
  if (entries) return entries
  const useClient = sourceFiles().filter((file) => hasDirective(file, 'use client'))
  entries = [...useClient, join(SRC, 'instrumentation-client.ts')]
  return entries
}
