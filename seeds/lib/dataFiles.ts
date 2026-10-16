/**
 * The seed data files the CLI uploads in its POST body.
 *
 * ⚠ **A deployed route cannot read one off disk.** `next.config.mjs` drops
 * `seeds/**` from the production build trace (#471), so the CLI reads each
 * registered file locally and sends it as `inlineData`, keyed by the path
 * below; the importer consumes its own entry through
 * `loadJsonData({ localPath, inlineContent })`. Keyed differently on the two
 * sides, a script works locally and silently imports nothing in production —
 * which is why an importer imports its path from here rather than restating it.
 *
 * Pure data with no runtime import, so the CLI can read it without loading
 * `BaseImporter` and, through it, the whole Payload config.
 */
import type { ScriptName } from './expectedCounts'

export const MEDITATION_TRANSCRIPTS_DATA_FILE = 'seeds/meditation-transcripts/data.json'

export const SCRIPT_DATA_FILES: Partial<Record<ScriptName, string[]>> = {
  'wm-app-translations': ['seeds/wm-app-translations/data.en.json'],
  translations: [
    'seeds/wm-app-translations/data.en.json',
    'seeds/wm-web-translations/data.en.json',
  ],
  'meditation-transcripts': [MEDITATION_TRANSCRIPTS_DATA_FILE],
  // Atlas reads all 8 dumps via loadJsonData (keyed by these exact paths).
  atlas: [
    'seeds/atlas/data/users.json',
    'seeds/atlas/data/managers.json',
    'seeds/atlas/data/regions.json',
    'seeds/atlas/data/venues.json',
    'seeds/atlas/data/events.json',
    'seeds/atlas/data/registrations.json',
    'seeds/atlas/data/clients.json',
    'seeds/atlas/data/pictures.json',
  ],
}
