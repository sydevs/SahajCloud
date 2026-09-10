// Shared engine for authoring translation-leaf information architecture.
// One `applyLeaf` call reorders a leaf's keys, tags them with on-screen
// `section` headings + plain-prose `description`s, removes audited-dead keys,
// and keeps the English seed (seeds/wm-app-translations/data.en.json) in step.
//
// Slugs never change (stored translations + seed are keyed on them — see
// HANDOFF-translations-ia.md rule 1). Only order/section/description move, all
// presentational. Nothing is ever dropped silently: unhandled keys keep their
// place at the end and are reported.
import { readFileSync, writeFileSync } from 'node:fs'

const SCHEMA_PATH = 'src/globals/WeMeditateAppTranslations/translationsSchema.json'
const SEED_PATH = 'seeds/wm-app-translations/data.en.json'

export function loadFiles() {
  return {
    schema: JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')),
    seed: JSON.parse(readFileSync(SEED_PATH, 'utf8')),
  }
}

export function writeFiles({ schema, seed }) {
  writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2) + '\n')
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n')
}

/**
 * @param {object} ctx        { schema, seed }
 * @param {object} cfg
 * @param {string[]} cfg.path        e.g. ['onboarding','welcome'] → schema.properties.onboarding.properties.welcome
 * @param {[string,string,string][]} cfg.spec  [key, section, description] in on-screen order
 * @param {string[]} [cfg.dead]      keys the audit proved render nowhere (removed)
 * @param {string[]} [cfg.misfiled]  keys that belong to another leaf (removed here)
 * @param {string}   [cfg.title]     tab-label override (slug stays put)
 * @param {string}   [cfg.description] leaf/tab description
 * @param {string}   cfg.seedKey     flattened seed key, e.g. 'onboarding_welcome'
 */
export function applyLeaf({ schema, seed }, cfg) {
  const { path, spec, dead = [], misfiled = [], title, description, seedKey } = cfg

  let node = schema
  for (const p of path) node = node.properties?.[p]
  if (!node || !node.properties) throw new Error(`leaf not found: ${path.join('.')}`)
  const old = node.properties
  const richTextKeys = Object.entries(old)
    .filter(([, v]) => v.type === 'richText')
    .map(([k]) => k)

  const missing = []
  const next = {}
  for (const [key, section, desc] of spec) {
    if (!old[key]) {
      missing.push(key)
      continue
    }
    next[key] = {
      ...old[key],
      ...(section ? { section } : {}),
      ...(desc !== undefined ? { description: desc } : {}),
    }
  }
  const handled = new Set([...spec.map((s) => s[0]), ...dead, ...misfiled])
  const unhandled = Object.keys(old).filter((k) => !handled.has(k))
  for (const k of unhandled) next[k] = old[k] // never drop silently

  node.properties = next
  if (title !== undefined) node.title = title
  if (description !== undefined) node.description = description

  console.log(
    `\n[${path.join('.')}] ordered ${Object.keys(next).length}` +
      `  dead ${dead.length}${dead.length ? ` (${dead.join(', ')})` : ''}` +
      `  misfiled ${misfiled.length}${misfiled.length ? ` (${misfiled.join(', ')})` : ''}`,
  )
  if (missing.length) console.log(`  !! spec keys NOT in schema (skipped): ${missing.join(', ')}`)
  if (unhandled.length) console.log(`  ?? UNHANDLED, kept at end: ${unhandled.join(', ')}`)

  syncSeed(seed, seedKey, Object.keys(next), richTextKeys, [...dead, ...misfiled])
  return { unhandled, missing }
}

// Seed shapes: leaves with a richText key nest their strings under `.strings`
// with richText keys as siblings; leaves without richText are flat. Handle both.
function syncSeed(seed, seedKey, orderedKeys, richTextKeys, removed) {
  if (!seedKey) return
  const entry = seed[seedKey]
  if (!entry || typeof entry !== 'object') {
    console.log(`  (no seed entry '${seedKey}')`)
    return
  }
  const hasStrings =
    entry.strings && typeof entry.strings === 'object' && !Array.isArray(entry.strings)
  const strContainer = hasStrings ? entry.strings : entry

  // Remove dead/misfiled from wherever they live so seeding never hits the
  // field validator's "Unknown key" rejection.
  for (const k of removed) {
    delete strContainer[k]
    if (hasStrings) delete entry[k]
  }

  const orderedStr = orderedKeys.filter((k) => !richTextKeys.includes(k))
  const reStr = {}
  for (const k of orderedStr) if (k in strContainer) reStr[k] = strContainer[k]
  for (const k of Object.keys(strContainer)) if (!(k in reStr)) reStr[k] = strContainer[k]

  if (hasStrings) {
    const reTop = { strings: reStr }
    for (const k of orderedKeys) if (richTextKeys.includes(k) && k in entry) reTop[k] = entry[k]
    for (const k of Object.keys(entry)) if (!(k in reTop)) reTop[k] = entry[k]
    seed[seedKey] = reTop
  } else {
    seed[seedKey] = reStr
  }
}
