import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  isLaneSource,
  readLane,
  resolveSpecifier,
  selectFrom,
  selectSpecs,
  toRepoPath,
} from '../../scripts/select-unit-specs.mjs'

/**
 * `scripts/select-unit-specs.mjs` decides what the per-edit hook runs. Nothing times the hook, so
 * what is pinned is what its budget rests on: every specifier form a spec writes reaches the
 * module it names, a near name does not, and the widest selection in the tree stays a small slice
 * of the lane.
 *
 * The fixture assumes the unit project collects `tests/unit/**\/*.spec.ts` and that the aliases
 * are `@/`, `@payload-config` and `tests/`. Both are asserted against the real config below.
 */

const ROOT = resolve(__dirname, '../..')

let fixture: string
let lane: ReturnType<typeof readLane>

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'select-unit-specs-'))

  // Selection reads only the specs, so the modules they name need not exist.
  const specs: Record<string, string> = {
    'alias.spec.ts': "import { thing } from '@/lib/thing'",
    'relative.spec.ts': "import { thing } from '../../src/lib/thing'",
    'nested/deep.spec.ts': "import { thing } from '../../../src/lib/thing'",
    'quoted.spec.ts': "const READS = ['src/lib/thing.ts']",
    'near-name.spec.ts': "import { other } from '@/lib/thing-other'",
    'folder.spec.ts': "import { folder } from '@/lib/folder'",
    'config.spec.ts': "import config from '@payload-config'",
    'helper.spec.ts': "import { helper } from '../utils/helper'",
    'tests-alias.spec.ts': "import { helper } from 'tests/utils/helper'",
    'seed.spec.ts': "import { run } from '../../seeds/data/import'",
    'tool.spec.ts': "import { tool } from '../../scripts/tool.mjs'",
    'types.spec.ts': "import type { Event } from '@/payload-types'",
  }
  for (const [name, text] of Object.entries(specs)) {
    const path = join(fixture, 'tests/unit', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${text}\n`)
  }

  lane = readLane(fixture)
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

describe('resolveSpecifier', () => {
  it('addresses one module through every specifier a unit spec writes', () => {
    expect(resolveSpecifier('@/lib/geo', 'tests/unit')).toBe('src/lib/geo')
    expect(resolveSpecifier('@payload-config', 'tests/unit')).toBe('src/payload.config')
    expect(resolveSpecifier('tests/utils/testData', 'tests/unit')).toBe('tests/utils/testData')
    expect(resolveSpecifier('../../src/lib/geo', 'tests/unit')).toBe('src/lib/geo')
    expect(resolveSpecifier('../utils/testData', 'tests/unit')).toBe('tests/utils/testData')
    expect(resolveSpecifier('../../seeds/data/import', 'tests/unit')).toBe('seeds/data/import')
    expect(resolveSpecifier('src/lib/geo.ts', 'tests/unit')).toBe('src/lib/geo.ts')
  })

  it('reads anything else from the repo root, where a package name matches no file', () => {
    expect(resolveSpecifier('next.config.mjs', 'tests/unit')).toBe('next.config.mjs')
    expect(resolveSpecifier('vitest', 'tests/unit')).toBe('vitest')
  })
})

describe('selectFrom', () => {
  const select = (rel: string) => selectFrom(rel, lane)

  it('reaches an alias, a relative path, a nested relative path and a quoted path', () => {
    expect(select('src/lib/thing.ts')).toEqual([
      'tests/unit/alias.spec.ts',
      'tests/unit/nested/deep.spec.ts',
      'tests/unit/quoted.spec.ts',
      'tests/unit/relative.spec.ts',
    ])
  })

  it('resolves specifiers, so a near name selects only its own spec', () => {
    expect(select('src/lib/thing-other.ts')).toEqual(['tests/unit/near-name.spec.ts'])
  })

  it('reaches an index file through its folder', () => {
    expect(select('src/lib/folder/index.ts')).toEqual(['tests/unit/folder.spec.ts'])
  })

  it('reaches the @payload-config alias', () => {
    expect(select('src/payload.config.ts')).toEqual(['tests/unit/config.spec.ts'])
  })

  it('reaches a test helper through the tests/ alias and through ../utils', () => {
    expect(select('tests/utils/helper.ts')).toEqual([
      'tests/unit/helper.spec.ts',
      'tests/unit/tests-alias.spec.ts',
    ])
  })

  it('reaches seeds and scripts, which specs import relatively', () => {
    expect(select('seeds/data/import.ts')).toEqual(['tests/unit/seed.spec.ts'])
    expect(select('scripts/tool.mjs')).toEqual(['tests/unit/tool.spec.ts'])
  })

  it('selects a spec edited directly', () => {
    expect(select('tests/unit/alias.spec.ts')).toEqual(['tests/unit/alias.spec.ts'])
  })

  it('selects nothing for a module no spec names', () => {
    expect(select('src/lib/unspoken.ts')).toEqual([])
  })

  it('selects nothing for a generated file, even one a spec names', () => {
    expect(lane.get('src/payload-types')).toContain('tests/unit/types.spec.ts')
    expect(select('src/payload-types.ts')).toEqual([])
    expect(isLaneSource('src/migrations/20260101_000000.ts')).toBe(false)
  })

  it('selects nothing for a file that is not a module, or not in the repo', () => {
    expect(select('README.md')).toEqual([])
    expect(toRepoPath('/elsewhere/src/lib/thing.ts', fixture)).toBeNull()
    expect(toRepoPath(join(fixture, 'src/lib/thing.ts'), fixture)).toBe('src/lib/thing.ts')
  })
})

describe('this repository', () => {
  let repo: ReturnType<typeof readLane>

  beforeAll(() => {
    repo = readLane(ROOT)
  })

  it('reads the specs from where the unit project collects them', () => {
    expect(readFileSync(join(ROOT, 'vitest.config.mts'), 'utf8')).toMatch(
      /name: 'unit',[\s\S]*?include: \['tests\/unit\/\*\*\/\*\.spec\.ts'\]/,
    )
  })

  it('resolves the aliases tsconfig.json declares, and no others', () => {
    const { paths } = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8')).compilerOptions

    expect(paths).toEqual({
      '@/*': ['./src/*'],
      '@payload-config': ['./src/payload.config.ts'],
      'tests/*': ['./tests/*'],
    })
  })

  it('runs those two pins on the very edit that would make them drift', () => {
    expect(selectFrom('tsconfig.json', repo)).toContain('tests/unit/select-unit-specs.spec.ts')
    expect(selectFrom('vitest.config.mts', repo)).toContain('tests/unit/select-unit-specs.spec.ts')
  })

  it('reaches each specifier form the lane actually writes', () => {
    // `selectSpecs` once, so the composition the hook calls is covered end to end.
    expect(selectSpecs('src/plugins/login/index.ts', ROOT)).toContain(
      'tests/unit/session-cookie-parts.spec.ts',
    )
    expect(selectFrom('src/lib/clients/verification.ts', repo)).toContain(
      'tests/unit/embed-verification.spec.ts',
    )
    expect(selectFrom('tests/utils/importGraph.ts', repo)).toContain(
      'tests/unit/client-bundle-safety.spec.ts',
    )
    expect(selectFrom('seeds/meditation-transcripts/import.ts', repo)).toContain(
      'tests/unit/meditation-transcripts-verify-run.spec.ts',
    )
    expect(selectFrom('src/globals/WeMeditateAppStatus/statusConfig.json', repo)).toContain(
      'tests/unit/status-config-sync.spec.ts',
    )
    expect(selectFrom('scripts/select-unit-specs.mjs', repo)).toContain(
      'tests/unit/select-unit-specs.spec.ts',
    )
  })

  it('keeps every edit under the width the per-edit budget is measured on', () => {
    const sources = ['src', 'tests', 'seeds', 'scripts']
      .flatMap((dir) =>
        readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' }).map(
          (entry) => `${dir}/${entry.split(sep).join('/')}`,
        ),
      )
      .filter(isLaneSource)

    expect(sources.length).toBeGreaterThan(500)

    const widest = sources
      .map((source) => ({ source, count: selectFrom(source, repo).length }))
      .reduce((a, b) => (b.count > a.count ? b : a))

    // 9 today, on `tests/utils/importGraph.ts`: its 8 specs, plus this one, which names it above.
    // Width stands in for time without being it, so when this trips, time the hook and re-measure
    // in `tests/PERF.md`. Never drop a spec from a selection to pass it.
    expect(widest.count, `widest selection: ${widest.source}`).toBeLessThanOrEqual(10)
  })
})
