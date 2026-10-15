/**
 * Every registered custom `Cell` consults `useDrawerRowSelect` (#944).
 *
 * The hook is a convention, and `custom-cell-drawer-select.spec.ts` names the
 * three cells that hold it today — so a sixth custom cell added next month is
 * green and broken in exactly the way #942 and #944 were. This walks the
 * registrations instead, the shape `lib-boundary.spec.ts` and
 * `status-config-sync.spec.ts` already use.
 *
 * A cell that genuinely must never select is a deliberate edit here, not an
 * omission nobody notices.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../../src')

/** Both shapes a registration takes: the bare path, and `{ path, serverProps }`. */
const REGISTRATION = /Cell:\s*(?:'([^']+)'|\{[\s\S]{0,200}?path:\s*'([^']+)')/g

const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g

/** Anchored: a substring match calls `useDrawerRowSelectX` a hit. */
const HOOK = /\buseDrawerRowSelect\b/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** `@/x` and `./x` alike, through the three spellings a module may take. */
function resolveModule(specifier: string, from: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : resolve(from, '..', specifier)
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function registeredCells(): string[] {
  const found = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    for (const match of readFileSync(file, 'utf8').matchAll(REGISTRATION)) {
      const resolved = resolveModule(match[1] ?? match[2], file)
      if (resolved) found.add(resolved)
    }
  }
  return [...found].sort()
}

/**
 * The cell's own source, then the modules it reaches by relative import. The
 * walk has to be transitive rather than one hop: a registration naming a
 * folder resolves to its barrel, which is two hops from the component that
 * calls the hook.
 */
function readsTheHook(cell: string, seen = new Set<string>()): boolean {
  if (seen.has(cell)) return false
  seen.add(cell)

  const source = readFileSync(cell, 'utf8')
  if (HOOK.test(source)) return true

  for (const match of source.matchAll(RELATIVE_IMPORT)) {
    const sibling = resolveModule(match[1], cell)
    if (sibling && readsTheHook(sibling, seen)) return true
  }
  return false
}

describe('every registered custom Cell handles list-drawer selection', () => {
  const cells = registeredCells()

  /** A scan finding nothing would make the assertion below pass by vacuum. */
  it('finds the registrations', () => {
    expect(cells.map((path) => path.slice(SRC.length + 1))).toEqual([
      'components/admin/AbuseScore/AbuseScoreCell.tsx',
      'components/admin/ColorField/ColorCell.tsx',
      'components/admin/RelationshipCountCell/index.ts',
      'components/admin/ThumbnailCell/PreviewUrlThumbnailCell.tsx',
      'components/admin/ThumbnailCell/RelationshipThumbnailCell.tsx',
    ])
  })

  it('reaches useDrawerRowSelect from each one', () => {
    expect(cells.filter((cell) => !readsTheHook(cell))).toEqual([])
  })
})
