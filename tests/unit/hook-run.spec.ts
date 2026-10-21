import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { REPO_ROOT, runForHook, toRepoPath } from '../../scripts/hook-run.mjs'

/**
 * Both PostToolUse hooks used to report every timeout as a failure, with a tail holding none —
 * every session was told its unit tests broke while they passed (#993). Each outcome here runs
 * through the real `spawnSync`, with `node -e` standing in for the command, so the result shapes
 * `runForHook` branches on are node's own rather than a guess.
 */

const standIn =
  (script: string) =>
  (_command: string, _args: string[], options: SpawnSyncOptionsWithStringEncoding) =>
    spawnSync(process.execPath, ['-e', script], options)

const run = (overrides: Partial<Parameters<typeof runForHook>[0]>) =>
  runForHook({
    command: '/repo/node_modules/.bin/tool',
    args: [],
    cwd: REPO_ROOT,
    name: 'example hook',
    doing: 'checking src/thing.ts',
    rerun: 'pnpm tool',
    failure: 'Tool failed after editing src/thing.ts',
    ...overrides,
  })

describe('toRepoPath', () => {
  it('makes a path inside the repo repo-relative, and refuses one outside it', () => {
    expect(toRepoPath(join(REPO_ROOT, 'src/lib/thing.ts'))).toBe('src/lib/thing.ts')
    expect(toRepoPath('src/lib/thing.ts')).toBe('src/lib/thing.ts')
    expect(toRepoPath('/elsewhere/src/lib/thing.ts')).toBeNull()
    expect(toRepoPath('')).toBeNull()
  })
})

describe('runForHook', () => {
  let failure: string | null
  let timeout: string | null
  let killed: string | null
  let unstarted: string | null

  beforeAll(() => {
    failure = run({ spawn: standIn('console.log("FAIL src/thing.ts"); process.exit(1)') })
    timeout = run({ spawn: standIn('setTimeout(() => {}, 10_000)'), timeoutMs: 50 })
    killed = run({ spawn: standIn('process.kill(process.pid, "SIGKILL")') })
    // The real `spawnSync`, on a command path that does not exist.
    unstarted = run({})
  })

  it('stays silent when the command succeeds', () => {
    expect(run({ spawn: standIn('') })).toBeNull()
  })

  it('a genuine failure says it failed, with the tail and the command to rerun', () => {
    expect(failure).toBe(
      'Tool failed after editing src/thing.ts:\n\nFAIL src/thing.ts\n\nRun `pnpm tool` to see the full output.',
    )
  })

  it('a timeout says it timed out, and what it was doing', () => {
    expect(timeout).toMatch(/^The example hook timed out after 0\.05 s checking src\/thing\.ts,/)
  })

  it('a signal says which one', () => {
    expect(killed).toContain('saw tool killed by SIGKILL while checking src/thing.ts')
  })

  it('a command that never started says so', () => {
    expect(unstarted).toContain('could not start tool (ENOENT)')
  })

  it('and only the genuine failure mentions failing', () => {
    const messages = [failure, timeout, killed, unstarted]

    expect(new Set(messages).size).toBe(4)
    expect(messages.filter((message) => /fail/i.test(message ?? ''))).toEqual([failure])
  })
})
