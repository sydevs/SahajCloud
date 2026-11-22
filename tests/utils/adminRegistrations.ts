/**
 * How a custom admin component is registered, and how that registration
 * resolves to a file — shared by the specs that walk a `Cell:` or `Field:`
 * population.
 *
 * ⚠ **Not `importGraph.ts`.** That module follows `@/` and dynamic imports,
 * which would widen a convention walk until it passes through unrelated
 * modules. These walks follow relative imports only, because the question is
 * "which files make up this component", not "what can it reach". Naming
 * `importGraph` here would also widen the per-edit hook's selection for it,
 * already the widest in the tree and the one `select-unit-specs.spec.ts`
 * bounds (`stacked-table-coverage.spec.ts` records the same reason).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const SRC = resolve(__dirname, '../../src')

/**
 * Both shapes a registration takes: the bare path, and `{ path, serverProps }`.
 * ⚠ The leading `\b` is load-bearing — without it `searchTypesField: 'level'`
 * reads as a registration, and seven config values did.
 */
const registrationPattern = (kind: 'Cell' | 'Field') =>
  new RegExp(`\\b${kind}:\\s*(?:'([^']+)'|\\{[\\s\\S]{0,200}?path:\\s*'([^']+)')`, 'g')

export const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g

export function sourceFiles(dir: string, extensions = /\.tsx?$/): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path, extensions)
    return extensions.test(entry.name) ? [path] : []
  })
}

/**
 * `@/x` and `./x` alike, through the four spellings a module may take.
 *
 * ⚠ **The `#Export` suffix is stripped, and `index.tsx` is a candidate.**
 * Missing either drops a registration from a population silently: without the
 * strip, every `'…/TranscriptPanel#FileTranscriptField'` resolves nowhere, and
 * without `index.tsx`, so does `'@/components/admin/RegionEvents'`.
 */
export function resolveModule(specifier: string, from: string): string | null {
  const path = specifier.split('#')[0]!
  const base = path.startsWith('@/') ? join(SRC, path.slice(2)) : resolve(from, '..', path)
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Every `<kind>:` registration in `src/`, as `{ resolved, unresolved }`.
 *
 * A caller asserts `unresolved` is empty rather than letting the walk shrink:
 * a population that quietly loses a registration still satisfies any floor
 * placed under its size, which is how four custom fields sat outside a guard
 * that claimed to walk all of them.
 */
export function registeredComponents(kind: 'Cell' | 'Field'): {
  resolved: string[]
  unresolved: string[]
} {
  const resolved = new Set<string>()
  const unresolved = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    for (const match of readFileSync(file, 'utf8').matchAll(registrationPattern(kind))) {
      const specifier = match[1] ?? match[2]!
      const found = resolveModule(specifier, file)
      if (found) resolved.add(found)
      else unresolved.add(specifier)
    }
  }
  return { resolved: [...resolved].sort(), unresolved: [...unresolved].sort() }
}

/**
 * Whether `pattern` matches the module's own source or that of any module it
 * reaches by relative import.
 *
 * Transitive, not one hop: a registration naming a folder resolves to its
 * barrel, and a component that delegates its markup to a child keeps a
 * convention with whichever of the two writes it.
 */
export function reaches(pattern: RegExp, module: string, seen = new Set<string>()): boolean {
  if (seen.has(module)) return false
  seen.add(module)

  const source = readFileSync(module, 'utf8')
  if (pattern.test(source)) return true

  for (const match of source.matchAll(RELATIVE_IMPORT)) {
    const sibling = resolveModule(match[1]!, module)
    if (sibling && reaches(pattern, sibling, seen)) return true
  }
  return false
}
