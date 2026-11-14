/**
 * Every CMS table renders through `StackedTable` (#1151).
 *
 * Payload's `Table` only scrolls sideways, so a column past the edge is a
 * column nobody finds on a phone — the registrations table hid three of its
 * five that way. The wrapper is the answer, and a wrapper is only an answer
 * while nothing goes round it: a table added next month with the bare import
 * is green and unreadable in exactly the way the ten converted ones were.
 *
 * A surface that genuinely must stay a table at every width is a deliberate
 * entry below, not an omission nobody notices.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../../src')

/**
 * Its own walk, rather than `tests/utils/importGraph`'s.
 *
 * Naming that module puts this spec in the hook's selection for every edit of
 * it, and `select-unit-specs.spec.ts` caps how wide any one edit's selection
 * may get — which this would push past. The walk costs about 48 ms, and the
 * shared `sourceOf` memo buys nothing here: the unit project isolates each
 * spec file, so nothing else has read these files already.
 */
function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** The one module that may render Payload's own `Table`. */
const WRAPPER = 'components/admin/helpers/stackedTable.tsx'

/** The whole import statement, so its specifiers can be read apart. */
const PAYLOAD_UI_IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s*from\s+'@payloadcms\/ui'/g

/**
 * Files importing `Table` as a value.
 *
 * A type-only import is not a render — `tableColumn.ts` reads the component's
 * own props to type a column, which is what keeps that helper honest.
 */
function tableImporters(): string[] {
  const found: string[] = []
  for (const file of sourceFiles()) {
    for (const [, typeOnly, specifiers] of readFileSync(file, 'utf8').matchAll(PAYLOAD_UI_IMPORT)) {
      if (typeOnly) continue
      const imported = specifiers.split(',').map((part) => part.trim())
      if (imported.some((part) => /^Table\b/.test(part))) found.push(relative(SRC, file))
    }
  }
  return found.sort()
}

describe('StackedTable coverage', () => {
  it('is the only renderer of Payload’s Table', () => {
    expect(tableImporters()).toEqual([WRAPPER])
  })
})
