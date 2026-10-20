import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { runHook } from '../../scripts/unit-test-hook.mjs'

/**
 * The per-edit hook used to report every timeout as "Unit tests failed", with a tail holding no
 * failure (#993). Each outcome here runs through the real `spawnSync`, with a stand-in for the
 * vitest binary, so the result shapes the hook branches on are node's own rather than a guess.
 */

let fixture: string

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'unit-test-hook-'))

  const write = (rel: string, text: string) => {
    mkdirSync(join(fixture, dirname(rel)), { recursive: true })
    writeFileSync(join(fixture, rel), text)
  }

  write('src/lib/thing.ts', 'export const thing = 1\n')
  write('src/lib/unspoken.ts', 'export const unspoken = 2\n')
  write('tests/unit/thing.spec.ts', "import { thing } from '@/lib/thing'\n")
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

/** Runs `node -e <script>` in place of vitest, with the options the hook passed. */
const standIn =
  (script: string) =>
  (_command: string, _args: string[], options: SpawnSyncOptionsWithStringEncoding) =>
    spawnSync(process.execPath, ['-e', script], options)

const edit = (rel: string, overrides: Partial<Parameters<typeof runHook>[0]> = {}) =>
  runHook({ filePath: join(fixture, rel), projectDir: fixture, ...overrides })

describe('runHook', () => {
  it('spawns nothing when no spec names the edited file', () => {
    const spawn = vi.fn(standIn(''))

    expect(edit('src/lib/unspoken.ts', { spawn })).toBeNull()
    expect(edit('README.md', { spawn })).toBeNull()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('runs the unit project over exactly the selected specs', () => {
    const spawn = vi.fn(standIn(''))

    expect(edit('src/lib/thing.ts', { spawn })).toBeNull()
    expect(spawn).toHaveBeenCalledOnce()
    expect(spawn.mock.calls[0][0]).toBe(join(fixture, 'node_modules/.bin/vitest'))
    expect(spawn.mock.calls[0][1]).toEqual([
      'run',
      '--project',
      'unit',
      '--config',
      './vitest.config.mts',
      'tests/unit/thing.spec.ts',
    ])
    expect(spawn.mock.calls[0][2]).toMatchObject({ cwd: fixture })
  })

  describe('reports each way a run can end distinctly', () => {
    const failure = () =>
      edit('src/lib/thing.ts', {
        spawn: standIn('console.log("FAIL tests/unit/thing.spec.ts"); process.exit(1)'),
      })
    const timeout = () =>
      edit('src/lib/thing.ts', { spawn: standIn('setTimeout(() => {}, 10_000)'), timeoutMs: 200 })
    const killed = () =>
      edit('src/lib/thing.ts', { spawn: standIn('process.kill(process.pid, "SIGKILL")') })
    // The fixture has no node_modules, so the hook's own binary path does not exist.
    const unstarted = () =>
      edit('src/lib/thing.ts', {
        spawn: (command, args, options) => spawnSync(command, args, options),
      })

    it('a genuine failure says tests failed, with the tail and the command to rerun', () => {
      const message = failure()

      expect(message).toMatch(/^Unit tests failed after editing src\/lib\/thing\.ts:/)
      expect(message).toContain('FAIL tests/unit/thing.spec.ts')
      expect(message).toContain(
        'pnpm exec vitest run --project unit --config ./vitest.config.mts tests/unit/thing.spec.ts',
      )
    })

    it('a timeout says it timed out', () => {
      expect(timeout()).toMatch(/timed out after 0\.2 s running 1 spec for src\/lib\/thing\.ts/)
    })

    it('a signal says which one', () => {
      expect(killed()).toContain('killed by SIGKILL')
    })

    it('a binary that never started says so', () => {
      expect(unstarted()).toMatch(/could not start vitest for src\/lib\/thing\.ts \(ENOENT\)/)
    })

    it('and only the genuine failure mentions failing', () => {
      const messages = [failure(), timeout(), killed(), unstarted()]

      expect(new Set(messages).size).toBe(4)
      expect(messages.filter((message) => /fail/i.test(message ?? ''))).toEqual([messages[0]])
    })
  })
})
