// Import the prod snapshot into the LOCAL database. Never contacts prod.
//
// Relations are remapped prod-id -> local-id RECURSIVELY (groups, tabs, arrays,
// blocks, and Lexical rich text), because Payload reassigns ids on insert and
// several FKs are NOT NULL (albums.artwork_id, lessons.icon_id, songs.album_id,
// subtle_system_nodes.page_id). ORDER is therefore referenced-first; anything
// still unresolved (e.g. the 403 `authors`) is dropped rather than dangled.
import 'dotenv/config'
import { readFileSync } from 'node:fs'

import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

const SNAP = 'temp_scripts/prod-snapshot'
const ORDER = [
  'images',
  'files',
  'videos',
  'narrators',
  'audiences',
  'song-tags',
  'user-choices',
  'pages',
  'subtle-system-nodes',
  'frames', // references subtle-system-nodes
  'albums',
  'songs',
  'meditations',
  'lessons',
  'lectures',
  'app-cards',
  'forms',
]

const payload = await getPayload({ config })
const idMap = {}
let dropped = 0

// Prod uses pt-BR. Older branches only define pt-br, so alias incoming locale
// keys ONLY when the local config can't represent them. Derived from the live
// config rather than hardcoded, so this works on either branch.
const SUPPORTED = new Set(
  (config.localization?.locales ?? payload.config.localization?.locales ?? []).map((l) =>
    typeof l === 'string' ? l : l.code,
  ),
)
const LOCALE_ALIAS = SUPPORTED.has('pt-BR') ? {} : { 'pt-BR': 'pt-br' }
console.log(
  `locales: ${[...SUPPORTED].join(',') || '(none)'}\nalias in effect: ${JSON.stringify(LOCALE_ALIAS)}`,
)
let localeRenamed = 0
const normalizeLocales = (node) => {
  if (Array.isArray(node)) return node.map(normalizeLocales)
  if (!node || typeof node !== 'object') return node
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    const key = LOCALE_ALIAS[k]
    if (key) localeRenamed++
    out[key ?? k] = normalizeLocales(v)
  }
  return out
}

const mapId = (to, val) => {
  if (val == null) return null
  const raw = typeof val === 'object' && val !== null && 'id' in val ? val.id : val
  if (typeof val === 'object' && val !== null && 'relationTo' in val) {
    const inner = typeof val.value === 'object' && val.value ? val.value.id : val.value
    const nid = idMap[val.relationTo]?.[inner]
    return nid ? { relationTo: val.relationTo, value: nid } : null
  }
  for (const t of Array.isArray(to) ? to : [to]) {
    const nid = idMap[t]?.[raw]
    if (nid != null) return nid
  }
  return null
}

// Lexical / unknown JSON: remap any {relationTo, value} pair found anywhere.
// Unresolvable nodes are REMOVED from their array, never left as null — a null
// child breaks Lexical's recurseNodeTree ("Cannot use 'in' operator ... in null").
const deepRemapJson = (node) => {
  if (Array.isArray(node)) return node.map(deepRemapJson).filter((n) => n !== null)
  if (!node || typeof node !== 'object') return node
  if ('relationTo' in node && 'value' in node) {
    const m = mapId(node.relationTo, node)
    if (m && typeof m === 'object') {
      return { ...node, value: m.value }
    }
    dropped++
    return null
  }
  const out = {}
  for (const [k, v] of Object.entries(node)) out[k] = deepRemapJson(v)
  return out
}

const LOCALE_CODES = new Set([
  'en',
  'es',
  'de',
  'it',
  'fr',
  'ru',
  'ro',
  'cs',
  'uk',
  'el',
  'hy',
  'pl',
  'pt-br',
  'fa',
  'bg',
  'tr',
])
const isLocaleMap = (v) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  !('relationTo' in v) &&
  !('id' in v) &&
  Object.keys(v).length > 0 &&
  Object.keys(v).every((k) => LOCALE_CODES.has(k))

// Resolve one relationship/upload value: handles hasMany arrays, polymorphic
// {relationTo,value}, and `localized: true` fields whose value is {en: ...}.
const mapRelValue = (f, v) => {
  if (v == null) return null
  if (isLocaleMap(v)) {
    const out = {}
    for (const [loc, lv] of Object.entries(v)) out[loc] = mapRelValue(f, lv)
    return out
  }
  if (Array.isArray(v)) {
    const arr = v.map((x) => mapId(f.relationTo, x)).filter((x) => x != null)
    dropped += v.length - arr.length
    return arr
  }
  const m = mapId(f.relationTo, v)
  if (m == null) dropped++
  return m
}

// Walk config fields alongside data, remapping relationship/upload at any depth.
const remapFields = (fields, data) => {
  if (!data || typeof data !== 'object') return data
  const out = Array.isArray(data) ? [...data] : { ...data }
  for (const f of fields) {
    if (f.type === 'tabs') {
      for (const t of f.tabs ?? []) {
        if (t.name) out[t.name] = remapFields(t.fields ?? [], out[t.name])
        else Object.assign(out, remapFields(t.fields ?? [], out))
      }
      continue
    }
    if (f.type === 'row' || f.type === 'collapsible') {
      Object.assign(out, remapFields(f.fields ?? [], out))
      continue
    }
    if (!f.name) continue
    const v = out[f.name]
    if (v === undefined) continue

    if (f.type === 'relationship' || f.type === 'upload') {
      if (v == null) continue
      // NB: null rather than `delete` — these results are merged back with
      // Object.assign for unnamed tabs/rows, and assign cannot delete a key,
      // which would leak the raw prod id through to the FK.
      out[f.name] = mapRelValue(f, v)
    } else if (f.type === 'group') {
      out[f.name] = remapFields(f.fields ?? [], v)
    } else if (f.type === 'array') {
      if (Array.isArray(v)) out[f.name] = v.map((row) => remapFields(f.fields ?? [], row))
    } else if (f.type === 'blocks') {
      if (Array.isArray(v)) {
        out[f.name] = v.map((row) => {
          const b = (f.blocks ?? []).find((bl) => bl.slug === row?.blockType)
          return b ? remapFields(b.fields ?? [], row) : row
        })
      }
    } else if (f.type === 'richText') {
      out[f.name] = deepRemapJson(v)
    }
  }
  return out
}

let inserted = 0,
  failed = 0
const failures = []

for (const slug of ORDER) {
  let docs
  try {
    docs = JSON.parse(readFileSync(`${SNAP}/${slug}.json`, 'utf8'))
  } catch {
    continue
  }
  const cfg = payload.config.collections.find((c) => c.slug === slug)
  idMap[slug] = {}
  let ok = 0,
    fail = 0
  let firstErr = null

  for (const doc of docs) {
    const { id: oldId, url, thumbnailURL, ...rest } = doc
    const data = remapFields(cfg.fields, normalizeLocales(rest))
    try {
      const created = await payload.db.create({ collection: slug, data })
      idMap[slug][oldId] = created.id
      ok++
    } catch (e) {
      fail++
      const c = e?.cause || e
      if (!firstErr) firstErr = [c?.message, c?.detail].filter(Boolean).join(' | ')
      failures.push({ slug, oldId })
    }
  }
  inserted += ok
  failed += fail
  console.log(`${slug.padEnd(20)} ok=${String(ok).padEnd(5)} fail=${fail}`)
  if (firstErr) console.log(`   ERR: ${firstErr.slice(0, 260)}`)
}

console.log(
  `\ninserted: ${inserted}  failed: ${failed}  refs dropped (unimportable targets): ${dropped}`,
)
process.exit(0)
