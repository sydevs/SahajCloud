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
import { relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SRC, sourceFiles, sourceOf } from '../utils/importGraph'

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
    for (const [, typeOnly, specifiers] of sourceOf(file).matchAll(PAYLOAD_UI_IMPORT)) {
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
