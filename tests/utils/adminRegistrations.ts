/**
 * How a custom admin component is registered, and how that registration
 * resolves to a file — shared by the specs that walk a `Cell:` or `Field:`
 * population.
 *
 * ⚠ **`reaches` is this module's own, and must stay so.** `importGraph`'s walk
 * follows `@/` and dynamic imports, which widens a convention walk until it
 * passes through unrelated modules. The plumbing below is that module's,
 * re-exported from here rather than imported by each spec: a spec whose own
 * text names `importGraph` joins the per-edit hook's widest selection, which
 * `select-unit-specs.spec.ts` bounds. An import in this file adds no such
 * selection — the hook indexes spec text alone.
 */
import { readFileSync } from 'node:fs'

import { resolveSpec, sourceFiles, SRC } from './importGraph'

export { resolveSpec, sourceFiles, SRC }

/**
 * Both shapes a registration takes: the bare path, and `{ path, serverProps }`.
 * ⚠ The leading `\b` is load-bearing — without it `searchTypesField: 'level'`
 * reads as a registration, and seven config values did.
 */
const registrationPattern = (kind: 'Cell' | 'Field') =>
  new RegExp(`\\b${kind}:\\s*(?:'([^']+)'|\\{[\\s\\S]{0,200}?path:\\s*'([^']+)')`, 'g')

const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g

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
      const found = resolveSpec(specifier, file)
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
    const sibling = resolveSpec(match[1]!, module)
    if (sibling && reaches(pattern, sibling, seen)) return true
  }
  return false
}
