/**
 * Pins `seeds/lib/dataFiles.ts` as the whole registry.
 *
 * A path an importer loads but nobody registers reads from disk, which a
 * deployed route cannot do (`next.config.mjs` drops `seeds/**` from the build
 * trace, #471) — so the script works locally and fails against every deployed
 * target. The ten `sy-atlas-translations` locale files were exactly that.
 */
import { existsSync } from 'node:fs'
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

describe('seed data file registry', () => {
  it('registers a file that exists on disk, for every script', () => {
    const registered = Object.values(SCRIPT_DATA_FILES).flat()
    expect(registered.length).toBeGreaterThan(0)

    for (const filePath of registered) {
      expect(existsSync(path.resolve(process.cwd(), filePath!)), filePath).toBe(true)
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

  it('registers all eight atlas dumps', () => {
    expect(SCRIPT_DATA_FILES.atlas).toEqual(ATLAS_DUMP_NAMES.map(atlasDataFile))
    expect(SCRIPT_DATA_FILES.atlas).toHaveLength(8)
  })
})
