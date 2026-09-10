// Pull readable prod content to local JSON snapshots.
// READ-ONLY against prod: GETs only, via the app's clients API key.
// Deliberately EXCLUDES `managers` and `clients` (credential-bearing) and
// payload-internal collections. depth=0 keeps raw relationship IDs so the
// importer can remap them.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'

import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

const PROD = 'https://cloud.sydevelopers.com'
const KEY = (process.env.WM_PAYLOAD_CMS_API_KEY || '').replace(/[\s",]/g, '')
const OUT = 'temp_scripts/prod-snapshot'

// readable + safe to mirror (from probe-prod-readable.mjs)
const COLLECTIONS = [
  'narrators',
  'subtle-system-nodes',
  'audiences',
  'song-tags',
  'user-choices',
  'images',
  'files',
  'videos',
  'frames',
  'albums',
  'songs',
  'meditations',
  'lessons',
  'lectures',
  'pages',
  'app-cards',
  'forms',
]

const payload = await getPayload({ config })

const topLevelFields = (fields) => {
  const out = []
  for (const f of fields) {
    if (f.name) out.push(f.name)
    else if (f.type === 'tabs')
      for (const t of f.tabs ?? []) {
        if (t.name) out.push(t.name)
        else out.push(...topLevelFields(t.fields ?? []))
      }
    else if (f.type === 'row' || f.type === 'collapsible')
      out.push(...topLevelFields(f.fields ?? []))
  }
  return [...new Set(out)]
}

mkdirSync(OUT, { recursive: true })
const summary = []

for (const slug of COLLECTIONS) {
  const cfg = payload.config.collections.find((c) => c.slug === slug)
  if (!cfg) {
    console.log(`SKIP ${slug} (not in config)`)
    continue
  }
  const sel = topLevelFields(cfg.fields)
    .map((n) => `select[${encodeURIComponent(n)}]=true`)
    .join('&')

  const docs = []
  let page = 1
  for (;;) {
    const url = `${PROD}/api/${slug}?${sel}&depth=0&limit=100&page=${page}&locale=all`
    const r = await fetch(url, { headers: { Authorization: `clients API-Key ${KEY}` } })
    if (!r.ok) {
      console.log(`${slug}: HTTP ${r.status} on page ${page} — ${(await r.text()).slice(0, 80)}`)
      break
    }
    const j = await r.json()
    docs.push(...(j.docs ?? []))
    if (!j.hasNextPage) break
    page++
  }

  writeFileSync(`${OUT}/${slug}.json`, JSON.stringify(docs, null, 2))
  summary.push({ slug, count: docs.length })
  console.log(`${slug.padEnd(22)} pulled ${docs.length}`)
}

writeFileSync(`${OUT}/_summary.json`, JSON.stringify(summary, null, 2))
console.log(`\ntotal docs: ${summary.reduce((a, b) => a + b.count, 0)} -> ${OUT}/`)
process.exit(0)
