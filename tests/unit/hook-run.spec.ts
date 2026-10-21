import { join } from 'node:path'

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { REPO_ROOT, respond, runForHook, toRepoPath } from '../../scripts/hook-run.mjs'
import { standIn } from '../utils/spawnStandIn'

/**
 * Both PostToolUse hooks used to report every timeout as a failure, with a tail holding none —
 * every session was told its unit tests broke while they passed (#993). Each outcome here runs
 * through the real `spawnSync`, with `node -e` standing in for the command, so the result shapes
 * `runForHook` branches on are node's own rather than a guess.
 */

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

  it('accepts a root written with a trailing slash, as CLAUDE_PROJECT_DIR may be', () => {
    expect(toRepoPath(join(REPO_ROOT, 'src/lib/thing.ts'), `${REPO_ROOT}/`)).toBe(
      'src/lib/thing.ts',
    )
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

  it('still reports a failure that printed past node’s 1 MB default buffer', () => {
    // Over that default, node kills the child with ENOBUFS and SIGTERM, which reads as a signal.
    const loud = run({
      spawn: standIn('require("fs").writeSync(1, "x".repeat(2 * 1024 * 1024)); process.exit(1)'),
    })

    expect(loud).toMatch(/^Tool failed after editing src\/thing\.ts:/)
  })

  it('keeps the summary on stdout and the end of the detail on stderr', () => {
    const message = run({
      spawn: standIn(
        'console.log("summary: 2 failed"); for (let i = 0; i < 60; i++) console.error("detail " + i); process.exit(1)',
      ),
    })

    expect(message).toContain('summary: 2 failed')
    expect(message).toContain('detail 59')
    expect(message).not.toContain('detail 34')
  })
})

describe('respond', () => {
  const tool = (path: string) => () => JSON.stringify({ tool_input: { file_path: path } })

  // The lean gate and a Claude session both export it, so each case sets its own.
  beforeEach(() => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is silent when the hook has nothing to say', () => {
    expect(JSON.parse(respond(tool('/repo/a.ts'), () => null, 'example hook'))).toEqual({
      continue: true,
      suppressOutput: true,
    })
  })

  it('hands the hook the edited path and the project, and passes its message on', () => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', '/repo')
    const hook = vi.fn(() => 'something to say')

    expect(JSON.parse(respond(tool('/repo/a.ts'), hook, 'example hook'))).toEqual({
      continue: true,
      additionalContext: 'something to say',
    })
    expect(hook).toHaveBeenCalledWith({ filePath: '/repo/a.ts', projectDir: '/repo' })
  })

  it('runs nothing on input it cannot read', () => {
    const hook = vi.fn(() => null)

    expect(JSON.parse(respond(() => 'not json', hook, 'example hook'))).toEqual({
      continue: true,
      suppressOutput: true,
    })
    expect(hook).toHaveBeenCalledWith({ filePath: undefined, projectDir: undefined })
  })

  it('says so when the hook itself throws', () => {
    const hook = () => {
      throw new Error('boom')
    }

    expect(JSON.parse(respond(tool('/repo/a.ts'), hook, 'example hook'))).toEqual({
      continue: true,
      additionalContext: 'The example hook itself errored, so it did nothing: boom',
    })
  })
})
