#!/usr/bin/env node
/**
 * One-off ETL: copy all data from the production Cloudflare D1 (SQLite) into the
 * Railway Postgres created by the baseline migration. **Read-only on D1.**
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm tsx scripts/etl-d1-to-postgres.ts [--dry-run] [--truncate]
 *
 * Env (read directly, per .claude/rules/scripts.md):
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY  (D1 read) — from .env.local or shell
 *   DATABASE_URL                                — target Postgres (Railway public URL)
 *
 * Strategy: introspect the PG column types, read each D1 table read-only, coerce
 * SQLite values to PG types (0/1→bool, JSON text→jsonb, ISO strings→timestamptz),
 * bulk-insert preserving ids with FK triggers disabled, reset sequences, then
 * verify row counts table-by-table.
 */
import { readFileSync } from 'fs'

import pg from 'pg'

const { Client } = pg

// Tables that must NOT be copied 1:1.
const EXCLUDE = new Set([
  'payload_migrations', // PG keeps its own baseline migration record
  'managers_sessions', // auth sessions — force a clean re-login at cutover
  'payload_jobs', // job queue — transient runtime state
  'payload_jobs_stats',
  'payload_locked_documents', // admin edit-locks — transient
  'payload_locked_documents_rels',
])

/**
 * Remap legacy enum values that the current Payload config no longer allows.
 * D1 (SQLite) doesn't enforce enums, so old select-option values lingered; the
 * Postgres enums (generated from the current config) reject them.
 *   table -> column -> { oldValue: newValue }
 * - app_cards.type: legacy non-event types collapsed into the new default
 *   'standard' (old default was 'app-page'); 'event' rows are already tagged.
 * - _meditations_v.version_type: 'realization' is a removed option; only 2
 *   version-history rows — map to the most common current type 'daily'.
 */
const VALUE_REMAP: Record<string, Record<string, Record<string, string>>> = {
  app_cards: { type: { 'app-page': 'standard', content: 'standard' } },
  _meditations_v: { version_type: { realization: 'daily' } },
}

const DRY = process.argv.includes('--dry-run')
const TRUNCATE = process.argv.includes('--truncate')
const INSERT_BATCH = 500

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i)
      const v = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* no .env.local — rely on shell env */
  }
}
loadEnvLocal()

const ACC = process.env.CLOUDFLARE_ACCOUNT_ID
const KEY = process.env.CLOUDFLARE_API_KEY
const PGURL = process.env.DATABASE_URL
if (!ACC || !KEY) throw new Error('Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_KEY')
if (!PGURL) throw new Error('Missing DATABASE_URL (target Postgres)')

let D1UUID = ''

async function cf(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!json.success) throw new Error(`CF ${path} failed: ${JSON.stringify(json.errors)}`)
  return json
}

async function d1(sql: string): Promise<any[]> {
  const json = await cf(`/accounts/${ACC}/d1/database/${D1UUID}/query`, { sql })
  return json.result[0].results
}

function coerce(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null
  if (type === 'boolean') {
    if (value === 1 || value === '1' || value === true || value === 'true' || value === 't')
      return true
    if (value === 0 || value === '0' || value === false || value === 'false' || value === 'f')
      return false
    return value
  }
  if (type === 'jsonb' || type === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value)
  }
  return value
}

async function main(): Promise<void> {
  const dbs = await cf(`/accounts/${ACC}/d1/database`)
  const found = dbs.result.find((d: any) => d.name === 'sahajcloud')
  if (!found) throw new Error("D1 database 'sahajcloud' not found")
  D1UUID = found.uuid

  const client = new Client({ connectionString: PGURL })
  await client.connect()

  // PG schema: table -> Map(column -> data_type)
  const colRows = (
    await client.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    )
  ).rows as { table_name: string; column_name: string; data_type: string }[]
  const pgCols = new Map<string, Map<string, string>>()
  for (const r of colRows) {
    if (!pgCols.has(r.table_name)) pgCols.set(r.table_name, new Map())
    pgCols.get(r.table_name)!.set(r.column_name, r.data_type)
  }

  const d1Tables = (
    await d1(
      `SELECT name FROM sqlite_master WHERE type='table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'
       ORDER BY name`,
    )
  ).map((r: any) => r.name as string)

  const toCopy = d1Tables.filter((t) => !EXCLUDE.has(t) && pgCols.has(t))
  const missingInPg = d1Tables.filter((t) => !EXCLUDE.has(t) && !pgCols.has(t))
  if (missingInPg.length) console.warn('WARN: in D1 but not PG (skipped):', missingInPg)

  console.log(`${DRY ? '[DRY RUN] ' : ''}copying ${toCopy.length} tables → Postgres\n`)

  if (!DRY) {
    try {
      await client.query(`SET session_replication_role = 'replica'`)
    } catch (e: any) {
      console.warn(`Could not disable FK triggers (${e.message}); inserts must be FK-ordered.`)
    }
  }

  if (TRUNCATE && !DRY) {
    const list = toCopy.map((t) => `"${t}"`).join(', ')
    await client.query(`TRUNCATE TABLE ${list} CASCADE`)
    console.log(`truncated ${toCopy.length} tables\n`)
  }

  const report: { table: string; d1: number; inserted: number }[] = []
  for (const t of toCopy) {
    const colTypes = pgCols.get(t)!
    const rows = await d1(`SELECT * FROM "${t}"`)
    if (rows.length === 0) {
      report.push({ table: t, d1: 0, inserted: 0 })
      continue
    }
    const useCols = Object.keys(rows[0]).filter((c) => colTypes.has(c))
    let inserted = 0
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const chunk = rows.slice(i, i + INSERT_BATCH)
      const params: unknown[] = []
      const tuples: string[] = []
      for (const row of chunk) {
        const ph: string[] = []
        for (const c of useCols) {
          const type = colTypes.get(c)!
          let raw = row[c]
          const remap = VALUE_REMAP[t]?.[c]
          if (remap && typeof raw === 'string' && raw in remap) raw = remap[raw]
          params.push(coerce(raw, type))
          ph.push(
            type === 'jsonb' || type === 'json' ? `$${params.length}::jsonb` : `$${params.length}`,
          )
        }
        tuples.push(`(${ph.join(',')})`)
      }
      const sql = `INSERT INTO "${t}" (${useCols.map((c) => `"${c}"`).join(', ')}) VALUES ${tuples.join(', ')}`
      if (!DRY) await client.query(sql, params)
      inserted += chunk.length
    }
    report.push({ table: t, d1: rows.length, inserted })
    console.log(`  ${t.padEnd(42)} ${rows.length}`)
  }

  if (!DRY) {
    await client.query(`SET session_replication_role = 'origin'`)
    // Reset id sequences so future inserts don't collide with copied ids.
    for (const t of toCopy) {
      if (!pgCols.get(t)!.has('id')) continue
      try {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('"${t}"','id'),
             GREATEST((SELECT COALESCE(MAX(id),1) FROM "${t}"),1),
             (SELECT COUNT(*) > 0 FROM "${t}"))`,
        )
      } catch {
        /* table has no id sequence */
      }
    }
  }

  // Verify counts D1 vs PG.
  console.log(`\n=== verification (D1 vs PG)${DRY ? ' — DRY, PG unchanged' : ''} ===`)
  let mismatches = 0
  for (const { table } of report) {
    const d1n = (await d1(`SELECT COUNT(*) AS n FROM "${table}"`))[0].n as number
    const pgn = (await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`)).rows[0]
      .n as number
    if (d1n !== pgn) {
      console.log(`  MISMATCH ${table}: D1=${d1n} PG=${pgn}`)
      mismatches++
    }
  }
  const totalRows = report.reduce((s, r) => s + r.d1, 0)
  console.log(
    mismatches
      ? `\n${mismatches} table(s) mismatch — investigate above.`
      : `\nAll ${report.length} table counts match ✓ (${totalRows} rows)`,
  )
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
