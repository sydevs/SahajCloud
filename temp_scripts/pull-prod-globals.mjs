// Pull readable prod GLOBALS into the local DB. READ-ONLY against prod.
// Globals were missed by import-prod-snapshot.mjs (collections only), which is
// why wm-app-translations rendered empty locally.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'

import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

const PROD = 'https://cloud.sydevelopers.com'
const KEY = (process.env.WM_PAYLOAD_CMS_API_KEY || '').replace(/[\s",]/g, '')
const OUT = 'temp_scripts/prod-snapshot/globals'
const APPLY = process.argv.includes('--apply')

const payload = await getPayload({ config })
mkdirSync(OUT, { recursive: true })

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

const LOCALE_ALIAS = { 'pt-BR': 'pt-br' }
const normalizeLocales = (node) => {
  if (Array.isArray(node)) return node.map(normalizeLocales)
  if (!node || typeof node !== 'object') return node
  const out = {}
  for (const [k, v] of Object.entries(node)) out[LOCALE_ALIAS[k] ?? k] = normalizeLocales(v)
  return out
}

for (const g of payload.config.globals) {
  const slug = g.slug
  const sel = topLevelFields(g.fields)
    .map((n) => `select[${encodeURIComponent(n)}]=true`)
    .join('&')
  const url = `${PROD}/api/globals/${slug}?${sel}&depth=0&locale=all`
  let r
  try {
    r = await fetch(url, { headers: { Authorization: `clients API-Key ${KEY}` } })
  } catch (e) {
    console.log(`${slug.padEnd(22)} FETCH ERR ${String(e).slice(0, 60)}`)
    continue
  }
  if (!r.ok) {
    console.log(`${slug.padEnd(22)} HTTP ${r.status}  ${(await r.text()).slice(0, 70)}`)
    continue
  }
  const doc = await r.json()
  const bytes = JSON.stringify(doc).length
  writeFileSync(`${OUT}/${slug}.json`, JSON.stringify(doc, null, 2))
  console.log(`${slug.padEnd(22)} HTTP 200  ${bytes} bytes${APPLY ? '' : '  (dry-run)'}`)

  if (APPLY) {
    const { id, createdAt, updatedAt, globalType, _status, ...rest } = doc
    try {
      await payload.db.updateGlobal({ slug, data: normalizeLocales(rest) })
      console.log(`   -> imported into local`)
    } catch (e) {
      const c = e?.cause || e
      console.log(`   -> IMPORT FAIL: ${String(c.message || c).slice(0, 140)}`)
    }
  }
}
process.exit(0)
