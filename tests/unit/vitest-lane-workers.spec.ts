/**
 * The int lane's worker bound keeps Postgres connections under control, and it
 * bounds nothing unless Vitest reads the key carrying it. `poolOptions` carried
 * it until Vitest 4 removed the key, and a removed key fails open (#1199).
 *
 * `tsconfig.test.json` is what makes a removed key a compile error, so the
 * first case here pins that `vitest.config.mts` is still in its program — the
 * gate disappears silently if it falls out.
 *
 * The import spells the config `.mjs` because `.mts` is not an importable
 * specifier under `moduleResolution: bundler`; the describe name spells `.mts`
 * so the per-edit hook selects these cases on a config edit.
 */
import type { TestProjectConfiguration, TestProjectInlineConfiguration } from 'vitest/config'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

type Lane = NonNullable<TestProjectInlineConfiguration['test']>

const ROOT = join(import.meta.dirname, '../..')

const readLanes = async (): Promise<Lane[]> => {
  vi.resetModules()
  const { default: config } = await import('../../vitest.config.mjs')
  const projects: TestProjectConfiguration[] = config.test?.projects ?? []
  return projects.flatMap((project) =>
    typeof project === 'object' && 'test' in project && project.test ? [project.test] : [],
  )
}

const laneNamed = async (name: string): Promise<Lane> => {
  const lane = (await readLanes()).find((candidate) => candidate.name === name)
  if (!lane) throw new Error(`no '${name}' lane in vitest.config.mts`)
  return lane
}

const groupOrderOf = (lane: Lane) => lane.sequence?.groupOrder ?? 0

describe("the Vitest lanes in 'vitest.config.mts'", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // Read as the `include` line rather than parsed: that file carries `//`
  // comments naming this one, so both a whole-file parse and a bare substring
  // search answer about the prose instead of the entry.
  it('keeps the config in a typecheck program', () => {
    const config = readFileSync(join(ROOT, 'tsconfig.test.json'), 'utf8')

    expect(config.match(/"include":\s*\[([^\]]*)\]/)?.[1] ?? '').toContain('"vitest.config.mts"')
  })

  // 7 is outside both branches of the derivation — `min(cores, 4)` on CI and
  // `max(2, min(cores - 1, 6))` locally — so no core count lets this pass with
  // the override unread.
  it('bounds the int lane through a key Vitest 5 reads', async () => {
    vi.stubEnv('VITEST_INT_MAX_FORKS', '7')

    expect((await laneNamed('int')).maxWorkers).toBe(7)
  })

  // Vitest refuses a group whose projects disagree on `maxWorkers`, and `tsc`
  // cannot express that, so the throw only ever surfaces in a run covering
  // both lanes — today only `pnpm test:coverage`.
  it('keeps lanes with different worker bounds in different groups', async () => {
    const [int, unit] = [await laneNamed('int'), await laneNamed('unit')]

    expect(
      groupOrderOf(int) === groupOrderOf(unit) && int.maxWorkers !== unit.maxWorkers,
      'lanes sharing a group order must agree on maxWorkers',
    ).toBe(false)
  })
})
