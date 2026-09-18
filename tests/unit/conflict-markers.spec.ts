import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

/**
 * **Markdown is the one place a conflict marker is silent.** Every other tracked
 * format breaks a parser or the type-checker, and no lint covers `docs/`, so a
 * block survived four merges inside a `docs/rules/` rule — loading both halves
 * into every agent session that read it (#787, #810).
 *
 * ⚠ **Build the patterns by concatenation.** A literal marker at the start of a
 * line in this file would make the guard fail on the day it is added.
 *
 * Scope is tracked files, which is what can land on `main`.
 */

const ROOT = resolve(__dirname, '../..')

/** The three lines `git merge` leaves behind. Shared with the fixture below. */
const OURS = '<'.repeat(7)
const SEPARATOR = '='.repeat(7)
const THEIRS = '>'.repeat(7)

const CONFLICT_MARKER = `^(${OURS} |${SEPARATOR}$|${THEIRS} )`

/**
 * Matching `<path>:<line>:<text>` rows in `cwd`'s tracked files, or `[]`.
 *
 * `grep.column` is pinned because a contributor who sets it globally would
 * otherwise get an extra column in every row. `-I` is deliberately absent: it
 * skips whatever git calls binary, which includes a plain text file marked
 * `-diff` in `.gitattributes`, and a guard should rather report a media file
 * loudly than miss a real block quietly.
 */
function grepConflictMarkers(cwd: string): string[] {
  let out: string
  try {
    out = execFileSync(
      'git',
      ['-c', 'grep.column=false', 'grep', '-n', '-E', CONFLICT_MARKER, '--', '.'],
      { cwd, encoding: 'utf8' },
    )
  } catch (error) {
    // `git grep` exits 1 for "no match" and 2 or more for a real failure, so
    // reading every non-zero exit as "clean" is how this would go vacuous.
    const { status, stderr } = error as { status?: number | null; stderr?: string }
    if (status === 1) return []
    const reported = status === null ? 'never ran — is git on PATH?' : `exited ${String(status)}`
    throw new Error(`git grep ${reported}: ${stderr ?? '(no stderr)'}`)
  }
  return out.split('\n').filter(Boolean)
}

describe('no tracked file carries an unresolved conflict block', () => {
  it('finds no conflict marker in the tree', () => {
    expect(grepConflictMarkers(ROOT)).toEqual([])
  })

  /**
   * A guard that has never matched anything has not been tested: a pattern
   * typo, a `git grep` that cannot see the tree, and an exit code read the
   * wrong way all produce the same green a clean tree does.
   *
   * The fixture is a real repository with the file really tracked, because
   * that is the only way to exercise the path the test above takes. Grepping a
   * loose file with `--no-index` would prove the pattern while bypassing index
   * enumeration, the pathspec and `.gitattributes` — every structural way the
   * scan can come back empty.
   */
  it('matches all three marker lines in a tracked file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conflict-markers-'))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))

    writeFileSync(
      join(dir, 'sample.md'),
      `${OURS} HEAD\nours\n${SEPARATOR}\ntheirs\n${THEIRS} main\n`,
    )
    // `-f` on the add, in case a contributor's global excludes file ignores it.
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '-q'], { cwd: dir })
    execFileSync('git', ['add', '-f', 'sample.md'], { cwd: dir })

    expect(grepConflictMarkers(dir)).toEqual([
      `sample.md:1:${OURS} HEAD`,
      `sample.md:3:${SEPARATOR}`,
      `sample.md:5:${THEIRS} main`,
    ])
  })
})
