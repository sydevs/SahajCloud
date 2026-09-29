import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

/**
 * **A doc citing a file that does not exist costs nothing until a human reads
 * it and goes hunting.** `docs/rules/admin-ui.md` named a component that exists
 * nowhere in the repo, three times, and two paths that were the flat spelling
 * of a component that had grown a folder (#860, #862). Nothing checked.
 *
 * ⚠ This file carries the scanner and proves it is not vacuous. The assertion
 * over the live tree is #862's phase 2b, and lands once #866 corrects
 * `docs/rules/storage.md`'s citation of a deleted pipeline (#864). Until then
 * the scanner guards nothing — an allowlist to get it green early is the one
 * outcome that would make it worthless.
 *
 * Scope is tracked files, which is what can land on `main`.
 */

/** `.tsx?`, never `(ts|tsx)` — the alternation stops at `ts` and drops the `x`, which reported four live components as missing. */
const CITATION = /src\/[A-Za-z0-9_./-]+\.tsx?/g

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
 * The docs a citation is checked in: this repo's own prose, never vendored or
 * generated text.
 *
 * Symlinks are dropped by git mode, not by name. Every `CLAUDE.md` is a symlink
 * to the `AGENTS.md` beside it, so reading both reports every finding twice.
 */
function inScopeDocs(cwd: string): string[] {
  return [...trackedFiles(cwd)]
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
 * Two exclusions, each measured against this repo rather than chosen: a fenced
 * block writes a path as a sample argument or a code comment, and a `://` run
 * means the path is the tail of an upstream URL. Both are citations of
 * somebody else's tree. Anything needing a third exclusion is a sign the scope
 * is wrong, not a case to waive.
 */
function unresolvedCitations(cwd: string): string[] {
  const tracked = trackedFiles(cwd)
  const rows: string[] = []

  for (const doc of inScopeDocs(cwd)) {
    let fenced = false
    readFileSync(join(cwd, doc), 'utf8').split('\n').forEach((line, index) => {
      if (FENCE.test(line)) {
        fenced = !fenced
        return
      }
      if (fenced) return

      for (const match of line.matchAll(CITATION)) {
        const precedingToken = /\S*$/.exec(line.slice(0, match.index))?.[0] ?? ''
        if (precedingToken.includes('://')) continue
        if (!tracked.has(match[0])) rows.push(`${doc}:${index + 1}:${match[0]}`)
      }
    })
  }
  return rows
}

/**
 * A real repository with the files really tracked, because that is the only way
 * to exercise the path a run over this repo takes. Reading loose files would
 * prove the regex while bypassing index enumeration and the git modes the
 * symlink rule reads.
 */
function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'doc-citations-'))
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }))

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

describe('every `src/…` path this repo\'s docs cite resolves', () => {
  it('reads this repo\'s own prose, and neither vendored text nor a symlink to a doc already read', () => {
    expect(inScopeDocs(fixtureRepo())).toEqual([
      'AGENTS.md',
      'docs/rules/sample.md',
    ])
  })

  /**
   * A guard that has never matched anything has not been tested: a regex typo,
   * a `git grep` that cannot see the tree, and an exclusion that swallows
   * everything all produce the green a clean tree does.
   *
   * `src/gone.tsx` is the row that pins the `x`. `src/fenced.ts`,
   * `src/index.ts` and `src/vendored.ts` are each absent from the fixture's
   * index, so an exclusion that stopped working would report them.
   */
  it('reports a cited path no tracked file answers, and skips a fenced block, a URL tail and a symlink', () => {
    expect(unresolvedCitations(fixtureRepo())).toEqual([
      'AGENTS.md:1:src/gone-agents.ts',
      'docs/rules/sample.md:3:src/gone.tsx',
    ])
  })
})
