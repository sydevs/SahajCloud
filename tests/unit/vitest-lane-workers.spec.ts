/**
 * The int lane's worker bound keeps Postgres connections under control, and it
 * bounds nothing unless Vitest reads the key carrying it. `poolOptions` carried
 * it until Vitest 4 removed the key, and a removed key fails open: the lane ran
 * at Vitest's own default for a whole major version, announced only by a
 * deprecation line nobody read (#1199).
 *
 * The import below spells the config `.mjs`, which is what TypeScript resolves
 * under `moduleResolution: bundler`; the describe name spells it as the hook's
 * selector reads a path, so an edit to the config runs these cases.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

type Lane = {
  name?: string
  maxWorkers?: number
  sequence?: { groupOrder?: number }
}

const readLanes = async (): Promise<Lane[]> => {
  vi.resetModules()
  const { default: config } = await import('../../vitest.config.mjs')
  const projects = (config.test?.projects ?? []) as unknown as { test?: Lane }[]
  return projects.map((project) => project.test ?? {})
}

describe("the Vitest lanes in 'vitest.config.mts'", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('bounds the int lane through a key Vitest 5 reads', async () => {
    vi.stubEnv('VITEST_INT_MAX_FORKS', '2')

    const int = (await readLanes()).find((lane) => lane.name === 'int')

    expect(int?.maxWorkers).toBe(2)
  })

  it('declares no option Vitest removed', async () => {
    const lanes = await readLanes()

    expect(lanes.map((lane) => lane.name)).toEqual(['unit', 'int'])
    for (const lane of lanes) expect(lane).not.toHaveProperty('poolOptions')
  })

  // Vitest groups projects by `sequence.groupOrder` and refuses a group whose
  // projects disagree on `maxWorkers`, so a lane bounding its own workers has
  // to leave the group its siblings share or no run covering both starts.
  it('keeps lanes with different worker bounds in different groups', async () => {
    const bounds = new Map<number, Set<number | undefined>>()

    for (const lane of await readLanes()) {
      const order = lane.sequence?.groupOrder ?? 0
      bounds.set(order, (bounds.get(order) ?? new Set()).add(lane.maxWorkers))
    }

    for (const [order, group] of bounds) {
      expect(group.size, `group ${order} holds lanes with different maxWorkers`).toBe(1)
    }
  })
})
