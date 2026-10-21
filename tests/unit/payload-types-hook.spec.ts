import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { REPO_ROOT } from '../../scripts/hook-run.mjs'
import { runTypesHook } from '../../scripts/payload-types-hook.mjs'

/**
 * The types hook regenerates `src/payload-types.ts` after a schema edit, and spawns nothing for
 * any other file. How each outcome is worded is `hook-run.spec.ts`'s; this pins what it hands it.
 */

const standIn =
  (script: string) =>
  (_command: string, _args: string[], options: SpawnSyncOptionsWithStringEncoding) =>
    spawnSync(process.execPath, ['-e', script], options)

const edit = (rel: string, overrides: Partial<Parameters<typeof runTypesHook>[0]> = {}) =>
  runTypesHook({ filePath: join(REPO_ROOT, rel), ...overrides })

describe('runTypesHook', () => {
  it.each([
    'src/collections/Events/Events.ts',
    'src/fields/colorField.ts',
    'src/globals/WeMeditateAppStatus/WeMeditateAppStatus.ts',
    'src/lib/richEditor/blocks/ButtonBlock.ts',
    'src/payload.config.ts',
  ])('regenerates types after an edit to %s', (rel) => {
    const spawn = vi.fn(standIn(''))

    expect(edit(rel, { spawn })).toBeNull()
    expect(spawn).toHaveBeenCalledWith(
      'pnpm',
      ['generate:types'],
      expect.objectContaining({ cwd: REPO_ROOT }),
    )
  })

  it.each([
    'src/lib/richEditor/index.ts',
    'src/payload-types.ts',
    'src/collectionsIndex.ts',
    'tests/unit/locales.spec.ts',
  ])('spawns nothing after an edit to %s', (rel) => {
    const spawn = vi.fn(standIn(''))

    expect(edit(rel, { spawn })).toBeNull()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('spawns nothing for a file outside the repo', () => {
    const spawn = vi.fn(standIn(''))

    expect(runTypesHook({ filePath: '/elsewhere/src/collections/X.ts', spawn })).toBeNull()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('names the edit when generation fails', () => {
    expect(edit('src/collections/Events/Events.ts', { spawn: standIn('process.exit(1)') })).toMatch(
      /^Failed to regenerate Payload types after editing src\/collections\/Events\/Events\.ts:/,
    )
  })

  it('does not call a timeout a failure', () => {
    const message = edit('src/payload.config.ts', {
      spawn: standIn('setTimeout(() => {}, 10_000)'),
      timeoutMs: 50,
    })

    expect(message).toContain(
      'timed out after 0.05 s regenerating types after editing src/payload.config.ts',
    )
    expect(message).not.toMatch(/fail/i)
  })
})
