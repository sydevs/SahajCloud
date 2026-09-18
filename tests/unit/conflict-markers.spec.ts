import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * No tracked file may carry an unresolved git conflict block.
 *
 * **Markdown is the one place a conflict marker is silent.** The same block in
 * a `.ts` file is a syntax error that `pnpm lint` and `pnpm typecheck` both
 * reject, and in `.json`, `.mts` or `.yml` it breaks a parser. Markdown renders
 * it as ordinary text. That is how `docs/rules/access.md` carried one from #787
 * through four merges, with two later PRs editing prose *inside* the block
 * without seeing it (#810).
 *
 * The cost was not cosmetic. That file is a `docs/rules/` rule, so both halves
 * loaded into every agent session that read `src/plugins/access/`, contradicting
 * each other.
 *
 * ⚠ **Build the patterns by concatenation.** A literal marker at the start of a
 * line in this file would make the guard fail on the day it is added.
 *
 * Scope is tracked files, which is what can land on `main`. `git grep` is also
 * the only affordable way to ask: it scans the tree in ~40ms, where reading
 * 76MB of tracked bytes into JS would cost more than the rest of the unit lane.
 */

const ROOT = resolve(__dirname, '../..')

/** The three lines `git merge` leaves behind, as an ERE. */
const CONFLICT_MARKER = `^(${'<'.repeat(7)} |${'='.repeat(7)}$|${'>'.repeat(7)} )`

/** Matching `<path>:<line>:<text>` rows, or `[]` when nothing matches. */
function grep(pattern: string, cwd: string, scope: string[]): string[] {
  let out: string
  try {
    out = execFileSync('git', ['grep', ...scope, '-I', '-n', '-E', pattern, '--', '.'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch (error) {
    // `git grep` exits 1 for "no match" and 2 or more for a real failure.
    // Reading every non-zero exit as "clean" is how this guard would go
    // silently vacuous, so anything else is rethrown with what git said.
    const { status, stderr } = error as { status?: number; stderr?: string }
    if (status === 1) return []
    throw new Error(`git grep exited ${String(status)}: ${stderr ?? '(no stderr)'}`)
  }
  return out.split('\n').filter(Boolean)
}

describe('no tracked file carries an unresolved conflict block', () => {
  it('finds no conflict marker in the tree', () => {
    expect(grep(CONFLICT_MARKER, ROOT, [])).toEqual([])
  })

  /**
   * A guard that has never matched anything has not been tested. A typo in the
   * pattern, a `git grep` that cannot see the tree, and an exit code read the
   * wrong way all produce the same green as a clean tree does. This runs the
   * same pattern through the same command against a block that really is there.
   *
   * `--no-index` is what lets it: the sample is a scratch file in no repository
   * at all, so git greps it the way plain `grep` would.
   */
  it('matches all three marker lines when one is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conflict-markers-'))
    const block = [
      `${'<'.repeat(7)} HEAD`,
      'ours',
      '='.repeat(7),
      'theirs',
      `${'>'.repeat(7)} main`,
    ]
    writeFileSync(join(dir, 'sample.md'), `${block.join('\n')}\n`)

    expect(grep(CONFLICT_MARKER, dir, ['--no-index'])).toEqual([
      `sample.md:1:${block[0]}`,
      `sample.md:3:${block[2]}`,
      `sample.md:5:${block[4]}`,
    ])
  })
})
