import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

/**
 * **Markdown is the one place a conflict marker is silent.** Every other format
 * this repo tracks fails loudly — the same lines break a parser or the
 * type-checker. Markdown renders them as ordinary text, and no lint covers
 * `docs/`, so a block sat in `docs/rules/access.md` through four merges, with
 * two later PRs editing prose *inside* it without seeing it (#787, #810). That
 * file is a `docs/rules/` rule, so both halves loaded into every agent session
 * reading `src/plugins/access/`, contradicting each other.
 *
 * ⚠ **Build the patterns by concatenation.** A literal marker at the start of a
 * line in this file would make the guard fail on the day it is added.
 *
 * Scope is tracked files, which is what can land on `main`, and `git grep`
 * answers that in one process.
 */

const ROOT = resolve(__dirname, '../..')

/** The three lines `git merge` leaves behind. Shared with the fixture below. */
const OURS = '<'.repeat(7)
const SEPARATOR = '='.repeat(7)
const THEIRS = '>'.repeat(7)

const CONFLICT_MARKER = `^(${OURS} |${SEPARATOR}$|${THEIRS} )`

/** Matching `<path>:<line>:<text>` rows, or `[]` when nothing matches. */
function grepConflictMarkers(cwd: string, { noIndex = false } = {}): string[] {
  const scope = noIndex ? ['--no-index'] : []
  let out: string
  try {
    out = execFileSync('git', ['grep', ...scope, '-I', '-n', '-E', CONFLICT_MARKER, '--', '.'], {
      cwd,
      encoding: 'utf8',
    })
  } catch (error) {
    // `git grep` exits 1 for "no match" and 2 or more for a real failure, so
    // reading every non-zero exit as "clean" is how this would go vacuous.
    const { status, stderr } = error as { status?: number; stderr?: string }
    if (status === 1) return []
    throw new Error(`git grep exited ${String(status)}: ${stderr ?? '(no stderr)'}`)
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
   * wrong way all produce the same green a clean tree does. `--no-index` is
   * what lets this ask — the sample sits in no repository at all, so git greps
   * it the way plain `grep` would.
   */
  it('matches all three marker lines when one is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conflict-markers-'))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    writeFileSync(join(dir, 'sample.md'), `${OURS} HEAD\nours\n${SEPARATOR}\ntheirs\n${THEIRS} main\n`)

    expect(grepConflictMarkers(dir, { noIndex: true })).toEqual([
      `sample.md:1:${OURS} HEAD`,
      `sample.md:3:${SEPARATOR}`,
      `sample.md:5:${THEIRS} main`,
    ])
  })
})
