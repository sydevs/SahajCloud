// Discovery only: for each collection in the local Payload config, ask prod
// what this API key is allowed to read, and how many docs exist.
// READ-ONLY: issues GETs with limit=1 only. Writes nothing anywhere.
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

const PROD = 'https://cloud.sydevelopers.com'
const KEY = (process.env.WM_PAYLOAD_CMS_API_KEY || '').replace(/[\s",]/g, '')
if (!KEY) throw new Error('WM_PAYLOAD_CMS_API_KEY missing')

const payload = await getPayload({ config })

// top-level field names -> select[a]=true&select[b]=true
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

const results = []
for (const c of payload.config.collections) {
  const slug = c.slug
  const names = topLevelFields(c.fields)
  const sel = names.map((n) => `select[${encodeURIComponent(n)}]=true`).join('&')
  const url = `${PROD}/api/${slug}?${sel}&depth=0&limit=1`
  let status,
    total = null,
    err = null
  try {
    const r = await fetch(url, { headers: { Authorization: `clients API-Key ${KEY}` } })
    status = r.status
    if (r.ok) {
      const j = await r.json()
      total = j.totalDocs ?? null
    } else {
      const t = await r.text()
      err = t.slice(0, 90)
    }
  } catch (e) {
    status = 'ERR'
    err = String(e).slice(0, 90)
  }
  results.push({ slug, status, total, fields: names.length, err })
  console.log(
    `${String(status).padEnd(4)} ${slug.padEnd(28)} docs=${String(total ?? '-').padEnd(6)} fields=${names.length}${err ? '  ' + err : ''}`,
  )
}

const ok = results.filter((r) => r.status === 200)
console.log(
  `\nreadable: ${ok.length}/${results.length} collections, total docs=${ok.reduce((a, b) => a + (b.total || 0), 0)}`,
)
process.exit(0)
