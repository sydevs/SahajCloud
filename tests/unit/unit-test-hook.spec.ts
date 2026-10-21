import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { runHook } from '../../scripts/unit-test-hook.mjs'

/**
 * The per-edit unit hook runs only the specs naming the edited file, and nothing when none does.
 * How each outcome is worded is `hook-run.spec.ts`'s; this pins what the unit hook hands it.
 */

let fixture: string

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'unit-test-hook-'))
  mkdirSync(join(fixture, 'tests/unit'), { recursive: true })
  writeFileSync(join(fixture, 'tests/unit/thing.spec.ts'), "import { thing } from '@/lib/thing'\n")
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

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

  it('names the edit and the exact rerun when a spec fails', () => {
    const message = edit('src/lib/thing.ts', { spawn: standIn('process.exit(1)') })

    expect(message).toMatch(/^Unit tests failed after editing src\/lib\/thing\.ts:/)
    expect(message).toContain(
      'pnpm exec vitest run --project unit --config ./vitest.config.mts tests/unit/thing.spec.ts',
    )
  })

  it('names how many specs it was running when it times out', () => {
    const message = edit('src/lib/thing.ts', {
      spawn: standIn('setTimeout(() => {}, 10_000)'),
      timeoutMs: 50,
    })

    expect(message).toContain('timed out after 0.05 s running 1 spec for src/lib/thing.ts')
  })
})
