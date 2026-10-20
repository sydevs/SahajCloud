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

const write = (root: string, rel: string, text: string) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/** A missing match must fail, not pass vacuously on `undefined`. */
const matched = (text: string, re: RegExp) => {
  const found = re.exec(text)?.[1]
  expect(found, `nothing matched ${re}`).toBeTruthy()
  return found as string
}

let fixture: string

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'select-unit-specs-'))

  for (const source of [
    'src/lib/thing.ts',
    'src/lib/thing-other.ts',
    'src/lib/unspoken.ts',
    'src/lib/folder/index.ts',
    'src/payload.config.ts',
    'src/payload-types.ts',
    'tests/utils/helper.ts',
    'seeds/data/import.ts',
    'scripts/tool.mjs',
  ]) {
    write(fixture, source, 'export {}\n')
  }

  write(fixture, 'tests/unit/alias.spec.ts', "import { thing } from '@/lib/thing'\n")
  write(fixture, 'tests/unit/relative.spec.ts', "import { thing } from '../../src/lib/thing'\n")
  write(
    fixture,
    'tests/unit/nested/deep.spec.ts',
    "import { thing } from '../../../src/lib/thing'\n",
  )
  write(fixture, 'tests/unit/quoted.spec.ts', "const READS = ['src/lib/thing.ts']\n")
  write(fixture, 'tests/unit/near-name.spec.ts', "import { other } from '@/lib/thing-other'\n")
  write(fixture, 'tests/unit/folder.spec.ts', "import { folder } from '@/lib/folder'\n")
  write(fixture, 'tests/unit/config.spec.ts', "import config from '@payload-config'\n")
  write(fixture, 'tests/unit/helper.spec.ts', "import { helper } from '../utils/helper'\n")
  write(fixture, 'tests/unit/tests-alias.spec.ts', "import { helper } from 'tests/utils/helper'\n")
  write(fixture, 'tests/unit/seed.spec.ts', "import { run } from '../../seeds/data/import'\n")
  write(fixture, 'tests/unit/tool.spec.ts', "import { tool } from '../../scripts/tool.mjs'\n")
  write(fixture, 'tests/unit/types.spec.ts', "import type { Event } from '@/payload-types'\n")
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

  it('ignores a package and prose, so neither enters the index', () => {
    expect(resolveSpecifier('vitest', 'tests/unit')).toBeNull()
    expect(resolveSpecifier('payload/shared', 'tests/unit')).toBeNull()
    expect(resolveSpecifier('node:fs', 'tests/unit')).toBeNull()
    expect(resolveSpecifier('renders the label', 'tests/unit')).toBeNull()
  })
})

describe('selectFrom', () => {
  const select = (rel: string) => selectFrom(rel, readLane(fixture))

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
    expect(readLane(fixture).index.get('src/payload-types')).toContain('tests/unit/types.spec.ts')
    expect(select('src/payload-types.ts')).toEqual([])
    expect(isLaneSource('src/migrations/20260101_000000.ts')).toBe(false)
  })

  it('selects nothing for a file that is not a module, or not in the repo', () => {
    expect(select('README.md')).toEqual([])
    expect(isLaneSource('/elsewhere/src/lib/thing.ts')).toBe(false)
    expect(toRepoPath('/elsewhere/src/lib/thing.ts', fixture)).toBe('/elsewhere/src/lib/thing.ts')
    expect(toRepoPath(join(fixture, 'src/lib/thing.ts'), fixture)).toBe('src/lib/thing.ts')
  })
})

describe('this repository', () => {
  it('reads the specs from where the unit project collects them', () => {
    const config = readFileSync(join(ROOT, 'vitest.config.mts'), 'utf8')
    const include = matched(config, /name: 'unit',[\s\S]*?include: (\[[^\]]*\])/)

    expect(JSON.parse(include.replace(/'/g, '"'))).toEqual(['tests/unit/**/*.spec.ts'])
  })

  it('resolves the aliases tsconfig.json declares, and no others', () => {
    const { paths } = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8')).compilerOptions

    expect(paths).toEqual({
      '@/*': ['./src/*'],
      '@payload-config': ['./src/payload.config.ts'],
      'tests/*': ['./tests/*'],
    })
  })

  it('reaches each specifier form the lane actually writes', () => {
    // One end-to-end call per form, because the parts passing cannot say the composition does.
    expect(selectSpecs('src/plugins/login/index.ts', ROOT)).toContain(
      'tests/unit/session-cookie-parts.spec.ts',
    )
    expect(selectSpecs('src/lib/clients/verification.ts', ROOT)).toContain(
      'tests/unit/embed-verification.spec.ts',
    )
    expect(selectSpecs('tests/utils/importGraph.ts', ROOT)).toContain(
      'tests/unit/client-bundle-safety.spec.ts',
    )
    expect(selectSpecs('seeds/meditation-transcripts/import.ts', ROOT)).toContain(
      'tests/unit/meditation-transcripts-verify-run.spec.ts',
    )
    expect(selectSpecs('src/globals/WeMeditateAppStatus/statusConfig.json', ROOT)).toContain(
      'tests/unit/status-config-sync.spec.ts',
    )
    expect(selectSpecs('scripts/select-unit-specs.mjs', ROOT)).toContain(
      'tests/unit/select-unit-specs.spec.ts',
    )
  })

  it('keeps every edit under the width the per-edit budget is measured on', () => {
    const lane = readLane(ROOT)
    const sources = ['src', 'tests', 'seeds', 'scripts']
      .flatMap((dir) =>
        readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' }).map(
          (entry) => `${dir}/${entry.split(sep).join('/')}`,
        ),
      )
      .filter(isLaneSource)

    expect(sources.length).toBeGreaterThan(500)

    const widest = sources
      .map((source) => ({ source, count: selectFrom(source, lane).length }))
      .reduce((a, b) => (b.count > a.count ? b : a))

    // 9 today, on `tests/utils/importGraph.ts`: its 8 specs, plus this one, which names it above.
    // Width stands in for time without being it, so when this trips, time the hook and re-measure
    // in `tests/PERF.md`. Never drop a spec from a selection to pass it.
    expect(widest.count, `widest selection: ${widest.source}`).toBeLessThanOrEqual(10)
  })
})
