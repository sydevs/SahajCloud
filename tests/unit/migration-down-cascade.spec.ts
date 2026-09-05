import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `DROP TABLE "x" CASCADE` also drops every foreign-key constraint that
 * references `x`. A `down` that then drops one of those by name aborts with
 * `constraint … does not exist`, and takes the whole batch rollback with it.
 *
 * Three migrations shipped that shape and broke `migrate:down` for anything
 * reaching back to 2026-06-08 (#682). Production rolls forward, so nothing
 * caught it — the cost is the local escape hatch.
 *
 * `migrate:create` emits the pair, so this is a generator shape, not a typo.
 * The check runs over the whole chain because a single bad `down` fails the
 * batch, whichever migration holds it.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'src/migrations')

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .sort()

const bodyOf = (source: string, fn: 'up' | 'down'): string =>
  new RegExp(`export async function ${fn}\\([\\s\\S]*?\\n\\}`).exec(source)?.[0] ?? ''

/** constraint name -> the table its FOREIGN KEY references, read from every `up`. */
const referencedTable = new Map<string, string>()
for (const file of files) {
  const up = bodyOf(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'), 'up')
  const pattern =
    /ADD CONSTRAINT "([^"]+)" FOREIGN KEY \([^)]*\) REFERENCES "public"\."([^"]+)"/g
  for (const [, constraint, table] of up.matchAll(pattern)) {
    referencedTable.set(constraint, table)
  }
}

/** Statements a `down` issues, in order, that the CASCADE rule cares about. */
type Statement =
  | { kind: 'dropTableCascade'; table: string }
  | { kind: 'dropConstraint'; constraint: string }

const statementsOf = (down: string): Statement[] => {
  const pattern = /DROP TABLE "([^"]+)" CASCADE|DROP CONSTRAINT "([^"]+)"/g
  return [...down.matchAll(pattern)].map(([, table, constraint]) =>
    table ? { kind: 'dropTableCascade', table } : { kind: 'dropConstraint', constraint: constraint! },
  )
}

describe('migration `down` blocks', () => {
  it('reads the chain, so a passing run means something', () => {
    // A glob that matches nothing would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(40)
    expect(referencedTable.size).toBeGreaterThan(40)
  })

  it('never drops a constraint an earlier DROP TABLE ... CASCADE already removed', () => {
    const redundant: string[] = []

    for (const file of files) {
      const down = bodyOf(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'), 'down')
      const cascaded = new Set<string>()

      for (const statement of statementsOf(down)) {
        if (statement.kind === 'dropTableCascade') {
          cascaded.add(statement.table)
          continue
        }
        const table = referencedTable.get(statement.constraint)
        if (table && cascaded.has(table)) {
          redundant.push(
            `${file}: DROP CONSTRAINT "${statement.constraint}" — DROP TABLE "${table}" CASCADE dropped it already`,
          )
        }
      }
    }

    expect(redundant).toEqual([])
  })
})
