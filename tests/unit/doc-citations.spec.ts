import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * **A doc citing a file that does not exist costs nothing until a human reads
 * it and goes hunting.** `docs/rules/admin-ui.md` named a component that exists
 * nowhere in the repo, three times, and two paths that were the flat spelling
 * of a component which had since grown a folder (#860, #862). Nothing checked.
 *
 * Scope is tracked files, which is what can land on `main`.
 */

const ROOT = resolve(__dirname, '../..')

/**
 * `.tsx?`, never `(ts|tsx)` — the alternation stops at `ts`, which truncates
 * the row and reports live `.tsx` components as missing. Parentheses are in the
 * class for Next.js route groups; a glob keeps its `*` out of it and so never
 * matches at all, which is what we want of a pattern.
 */
const CITATION = /src\/[A-Za-z0-9_./()-]+\.tsx?/g

const FENCE = /^\s*(?:```|~~~)/

/** `<mode> <sha> <stage>\t<path>` per entry. `-z` so a path with a space or a quote arrives whole. */
function trackedFiles(cwd: string): Map<string, string> {
  const out = execFileSync('git', ['ls-files', '-s', '-z'], { cwd, encoding: 'utf8' })
  const tracked = new Map<string, string>()
  for (const entry of out.split('\0').filter(Boolean)) {
    const [meta, path] = entry.split('\t')
    tracked.set(path, meta.split(' ')[0])
  }
  return tracked
}

/**
 * This repo's own prose, never vendored or generated text.
 *
 * Symlinks go by git mode, not by name: every `CLAUDE.md` is a symlink to the
 * `AGENTS.md` beside it, so reading both reports every finding twice.
 */
function inScopeDocs(tracked: Map<string, string>): string[] {
  return [...tracked]
    .filter(([path, mode]) => {
      if (mode === '120000' || !path.endsWith('.md')) return false
      return path.startsWith('docs/') || !path.includes('/') || path.endsWith('AGENTS.md')
    })
    .map(([path]) => path)
}

/**
 * Matching `<doc>:<line>:<cited path>` rows for every citation resolving to no
 * tracked file, or `[]`.
 *
 * A fenced block writes a path as a sample argument or a code comment, and a
 * `://` run makes it the tail of an upstream URL. Both name somebody else's
 * tree. Anything wanting a third exclusion is a sign the scope is wrong, not a
 * case to waive.
 */
function unresolvedCitations(cwd: string): string[] {
  const tracked = trackedFiles(cwd)
  const rows: string[] = []

  for (const doc of inScopeDocs(tracked)) {
    let fenced = false
    for (const [index, line] of readFileSync(join(cwd, doc), 'utf8').split('\n').entries()) {
      if (FENCE.test(line)) {
        fenced = !fenced
        continue
      }
      if (fenced) continue

      for (const match of line.matchAll(CITATION)) {
        if (/\S*:\/\/\S*$/.test(line.slice(0, match.index))) continue
        if (!tracked.has(match[0])) rows.push(`${doc}:${index + 1}:${match[0]}`)
      }
    }
  }
  return rows
}

/**
 * A real repository with the files really tracked, because that is the only way
 * to exercise the path a run over this repo takes. Loose files would prove the
 * regex while bypassing index enumeration and the modes the symlink rule reads.
 */
function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'doc-citations-'))

  const write = (path: string, body: string) => {
    mkdirSync(join(dir, dirname(path)), { recursive: true })
    writeFileSync(join(dir, path), body)
  }

  write('AGENTS.md', 'The entry point is `src/gone-agents.ts`.\n')
  write('src/real.ts', 'export const real = 1\n')
  write('src/Real.tsx', 'export const Real = () => null\n')
  write('vendor/notes.md', 'Upstream ships `src/vendored.ts`.\n')
  write(
    'docs/rules/sample.md',
    [
      'Reference implementations are `src/real.ts` and `src/Real.tsx`.',
      '',
      'The deleted one was `src/gone.tsx`.',
      '',
      '```bash',
      'git grep -n thing src/fenced.ts',
      '```',
      '',
      'Upstream: https://github.com/payloadcms/payload/blob/main/packages/payload/src/index.ts',
      '',
    ].join('\n'),
  )
  symlinkSync('AGENTS.md', join(dir, 'CLAUDE.md'))

  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '-q'], { cwd: dir })
  // `-f`, in case a contributor's global excludes file ignores one of these.
  execFileSync('git', ['add', '-f', '.'], { cwd: dir })
  return dir
}

describe("every `src/…` path this repo's docs cite resolves", () => {
  let fixture: string

  beforeAll(() => {
    fixture = fixtureRepo()
  })
  afterAll(() => rmSync(fixture, { recursive: true, force: true }))

  it('finds no unresolvable citation in the tree', () => {
    expect(unresolvedCitations(ROOT)).toEqual([])
  })

  it("reads this repo's own prose, and neither vendored text nor a symlink to a doc already read", () => {
    expect(inScopeDocs(trackedFiles(fixture))).toEqual(['AGENTS.md', 'docs/rules/sample.md'])
  })

  /**
   * A guard that has never matched anything has not been tested: a regex typo,
   * a `git ls-files` that cannot see the tree, and an exclusion that swallows
   * everything all produce the green a clean tree does.
   *
   * `src/gone.tsx` pins the `x`, and `src/Real.tsx` pins that a resolving one
   * stays unreported — `(ts|tsx)` fails both ways round. `src/fenced.ts`,
   * `src/index.ts` and `src/vendored.ts` are each absent from the fixture's
   * index, so an exclusion that stopped working would report them.
   */
  it('reports a cited path no tracked file answers, and skips a fenced block, a URL tail and a symlink', () => {
    expect(unresolvedCitations(fixture)).toEqual([
      'AGENTS.md:1:src/gone-agents.ts',
      'docs/rules/sample.md:3:src/gone.tsx',
    ])
  })
})
