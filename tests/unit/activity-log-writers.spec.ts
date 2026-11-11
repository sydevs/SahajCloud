/**
 * Nothing writes an `activityLog` as a whole array except the one reset that
 * means to (#1116).
 *
 * The defect this guards is not in any one writer: it is that rebuilding the
 * column from a copy read earlier drops whatever another writer added since,
 * and the spelling that does it — `data: { activityLog: [...log, entry] }` —
 * compiles, passes every other spec, and looks exactly like the nine call
 * sites that were converted. `@/lib/atomicWrites/appendLogEntry` is the only
 * append there is; this is what keeps a tenth writer from inventing another.
 *
 * Source text, in the mould of `lib-boundary.spec.ts`: the rule is about which
 * spelling appears in the repo, so there is nothing to run.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../../src')

/**
 * The one module that replaces the whole column, and why.
 *
 * Verifying an event opens a new cycle, so its log starts again from the entry
 * recording that verification — `logField`'s own doc comment carries the
 * convention. It is a reset, not an append, and it is the only one.
 */
const RESETS = ['collections/Events/lifecycle/verify.ts']

/** Generated: it declares the column rather than writing it. */
const IGNORED = ['payload-types.ts']

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, found)
    else if (/\.tsx?$/.test(entry)) found.push(relative(SRC, full))
  }
  return found
}

/** Lines assigning the whole column. A `select` names it instead, so it is not one. */
function wholeArrayWrites(file: string): number[] {
  const lines = readFileSync(join(SRC, file), 'utf8').split('\n')
  return lines.flatMap((line, index) => {
    const match = /^\s*activityLog:\s*(\S.*)$/.exec(line)
    return match && !/^(true|false)\b/.test(match[1]) ? [index + 1] : []
  })
}

describe('activityLog writers', () => {
  const files = sourceFiles(SRC).filter((file) => !IGNORED.includes(file))

  it('reads the files it is meant to', () => {
    // A walk that found nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no writer of the whole array but the declared reset', () => {
    const found = files
      .filter((file) => !RESETS.includes(file))
      .flatMap((file) => wholeArrayWrites(file).map((line) => `src/${file}:${line}`))

    // Each of these replaces the column with an array built in memory, which
    // drops whatever another writer appended since it was read. Append through
    // `@/lib/atomicWrites/appendLogEntry`, or add the file to RESETS with a
    // comment saying which cycle it opens.
    expect(found).toEqual([])
  })

  it('keeps every declared reset earning its place', () => {
    // A stale allowlist entry is an exemption nobody is using, and the next
    // reader reads it as permission.
    for (const file of RESETS) expect(wholeArrayWrites(file).length).toBeGreaterThan(0)
  })
})
