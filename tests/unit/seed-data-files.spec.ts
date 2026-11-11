/**
 * Pins `seeds/lib/dataFiles.ts` as the whole registry.
 *
 * A path an importer loads but nobody registers reads from disk, which a
 * deployed route cannot do (`next.config.ts` drops `seeds/**` from the build
 * trace, #471) — so the script works locally and fails against every deployed
 * target. The ten `sy-atlas-translations` locale files were exactly that.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ATLAS_DUMP_NAMES,
  ATLAS_TRANSLATION_LOCALES,
  atlasDataFile,
  atlasTranslationsDataFile,
  SCRIPT_DATA_FILES,
  WM_APP_TRANSLATIONS_DATA_FILE,
  WM_WEB_TRANSLATIONS_DATA_FILE,
} from '../../seeds/lib/dataFiles'
import { EXPECTED_COUNTS } from '../../seeds/lib/expectedCounts'

describe('seed data file registry', () => {
  it('registers a file that exists on disk, for every committed script', () => {
    const registered = Object.entries(SCRIPT_DATA_FILES)
      .filter(([script]) => script !== 'atlas')
      .flatMap(([, files]) => files ?? [])
    expect(registered.length).toBeGreaterThan(0)

    for (const filePath of registered) {
      expect(existsSync(path.resolve(process.cwd(), filePath)), filePath).toBe(true)
    }
  })

  it('keeps the atlas data out of git — it is personal data, built locally', () => {
    // `pnpm atlas:sync build` writes these. A deployed route still receives
    // them, because the CLI uploads every registered file as inlineData.
    const ignored = readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8').split('\n')
    expect(ignored).toContain('/seeds/atlas/data/')
    expect(ignored).toContain('/seeds/atlas/local/')
    for (const filePath of SCRIPT_DATA_FILES.atlas ?? []) {
      expect(filePath.startsWith('seeds/atlas/data/'), filePath).toBe(true)
    }
  })

  it('registers every locale the translations script reads', () => {
    expect(SCRIPT_DATA_FILES.translations).toEqual([
      WM_APP_TRANSLATIONS_DATA_FILE,
      WM_WEB_TRANSLATIONS_DATA_FILE,
      ...ATLAS_TRANSLATION_LOCALES.map(atlasTranslationsDataFile),
    ])
    expect(SCRIPT_DATA_FILES.translations).toHaveLength(12)
  })

  it('registers the eight atlas tables and the build manifest', () => {
    expect(SCRIPT_DATA_FILES.atlas).toEqual(ATLAS_DUMP_NAMES.map(atlasDataFile))
    expect(SCRIPT_DATA_FILES.atlas).toHaveLength(9)
    expect(SCRIPT_DATA_FILES.atlas).toContain('seeds/atlas/data/manifest.json')
  })
})

/**
 * The two registries TypeScript cannot check, and the one the route reads.
 *
 * `EXPECTED_COUNTS` and `SCRIPT_DESCRIPTIONS` are total over `ScriptName`, so a
 * missing entry is a build error. These three are not: `VALID_SCRIPTS` in
 * `run.ts` is an array, and `getImporter`'s `switch` falls through to `null`.
 * A script left out of either is accepted by `tsc` and then refused at run
 * time — by the CLI as "invalid script", or by the route as a 500 — which is
 * the same class of failure as an unregistered data file above, and the one
 * `seeds/AGENTS.md`'s checklist exists to prevent.
 *
 * Read as source text because importing either module runs it: `run.ts` is a
 * CLI with a top-level `main()`, and the route pulls in the Payload config.
 */
describe('the registries TypeScript cannot check', () => {
  const read = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), 'utf-8')

  const scripts = Object.keys(EXPECTED_COUNTS)

  it('names every script in the CLI, which holds a plain array', () => {
    const cli = read('seeds/run.ts')
    // Bounded by the next declaration, not by the name `SCRIPT_RUN_ORDER`: a
    // comment inside the array mentions it, and cutting there hid the last
    // entry — which is how this assertion first failed against correct code.
    const listed = cli.slice(
      cli.indexOf('const VALID_SCRIPTS'),
      cli.indexOf('const SCRIPT_RUN_ORDER'),
    )

    for (const script of scripts) expect(listed, script).toContain(`'${script}'`)
  })

  it('names every script in the seed route, whose switch falls through to null', () => {
    const route = read('src/app/(payload)/api/seed/[script]/route.ts')

    for (const script of scripts) expect(route, script).toContain(`case '${script}':`)
  })
})
