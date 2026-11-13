/**
 * `pnpm atlas:sync <step>` — the repeatable Atlas → SahajCloud data refresh.
 *
 *   fetch [--backup bNNN]   Capture (or reuse) a Heroku backup of the legacy Atlas
 *                           database, download it, restore it to a scratch
 *                           Postgres, and extract it to local/raw/<backup>/.
 *   bootstrap --baseline bNNN --curated <dir>
 *                           One-time: record the grooming overlay from a curated
 *                           data set and the raw extraction it was groomed against.
 *   build [--backup bNNN]   Lay the overlay and the merge decisions over a raw
 *                           extraction and write seeds/atlas/data/ (the importer's
 *                           input), a delta report, and a grooming worksheet.
 *   groom --patch <file> [--backup bNNN]
 *                           Clean the worksheet rows mechanically (sync/clean.ts),
 *                           then apply a hand-written patch of grooming decisions:
 *                           { "events": { "<legacyId>": { field: value } }, "venues": {…} }.
 *   record --groomed [--backup bNNN]
 *                           After grooming seeds/atlas/data/, record it as the new
 *                           overlay. Then build again, then check.
 *   check                   Grooming and contract invariants over seeds/atlas/data/.
 *
 * Everything this reads or writes is personal data and stays local: under
 * seeds/atlas/local/ and seeds/atlas/data/, both gitignored. See
 * seeds/atlas/AGENTS.md ("The sync pipeline") for the procedure around it.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { ATLAS_DUMP_NAMES, type AtlasDumpName, atlasDataFile } from '../../lib/dataFiles'
import { dedupeAtlasData, type DedupeData } from '../dedupe'
import { extractAtlas } from '../extract'
import { checkAtlasData, type CheckData, missingMergeSurvivors } from './check'
import { cleanEventRow } from './clean'
import { deriveExpectedCounts, type CountInput } from './counts'
import { applyClientDecisions, EXCLUDED_EVENT_LEGACY_IDS, MERGED_EVENT_TARGETS } from './merges'
import {
  applyOverlay,
  OVERLAY_SPECS,
  type OverlayEntry,
  recordOverlay,
  type Row,
  type RowOutcome,
} from './overlay'
import { buildReport } from './report'

/** The eight extracted tables — every data file but the manifest. */
const TABLES = ATLAS_DUMP_NAMES.filter(
  (n): n is Exclude<AtlasDumpName, 'manifest'> => n !== 'manifest',
)
type Table = (typeof TABLES)[number]
type Tables = Record<Table, Row[]>

const ROOT = process.cwd()
const LOCAL = path.join(ROOT, 'seeds/atlas/local')
const dir = (...parts: string[]) => path.join(LOCAL, ...parts)
const HEROKU_APP = process.env.ATLAS_HEROKU_APP ?? 'sahajatlas'
const SCRATCH_BASE = process.env.ATLAS_SCRATCH_URL ?? 'postgres://localhost:5432'

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
const writeJson = (file: string, value: unknown): void => {
  mkdirSync(path.dirname(file), { recursive: true })
  // The extractor's own formatting, so a rebuild diffs cleanly against a groomed file.
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
const run = (cmd: string, args: string[]): string =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const readTables = (from: string): Tables =>
  Object.fromEntries(
    TABLES.map((t) => [t, readJson<Row[]>(path.join(from, `${t}.json`))]),
  ) as Tables

/** The newest raw extraction, by Heroku's monotonic backup id. */
function latestRaw(): string {
  const ids = existsSync(dir('raw'))
    ? readdirSync(dir('raw')).filter((d) => /^[a-z]\d+$/.test(d))
    : []
  if (!ids.length) throw new Error('No raw extraction yet. Run `pnpm atlas:sync fetch` first.')
  return ids.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).at(-1)!
}

// ─── fetch ──────────────────────────────────────────────────────────────────

async function fetchStep(backup?: string): Promise<void> {
  let id = backup
  if (!id) {
    console.log(`Capturing a fresh backup of ${HEROKU_APP}…`)
    // The Heroku CLI prints "Backing up … to bNNN" on stderr and only the
    // progress hints on stdout, so the id has to be read from both.
    const capture = spawnSync('heroku', ['pg:backups:capture', '--app', HEROKU_APP], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const out = [capture.stdout, capture.stderr].filter(Boolean).join('\n')
    if (capture.status !== 0) {
      // A CLI that never ran leaves `status` and both streams null and puts the reason in
      // `error`, so without it a missing `heroku` reports an empty failure.
      throw new Error(`heroku pg:backups:capture failed:\n${capture.error?.message ?? out}`)
    }
    id = out.match(/ to (b\d+)/)?.[1]
    if (!id) throw new Error(`Could not read the backup id from:\n${out}`)
  }
  const info = run('heroku', ['pg:backups:info', id, '--app', HEROKU_APP])
  const finishedAt = info.match(/Finished at:\s+(.+)/)?.[1]?.trim() ?? null
  if (!/Status:\s+Completed/.test(info)) throw new Error(`Backup ${id} is not complete:\n${info}`)

  const dumpPath = dir('dumps', `${id}.dump`)
  if (!existsSync(dumpPath)) {
    const url = run('heroku', ['pg:backups:url', id, '--app', HEROKU_APP]).trim()
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Downloading ${id} failed: HTTP ${res.status}`)
    mkdirSync(path.dirname(dumpPath), { recursive: true })
    writeFileSync(dumpPath, Buffer.from(await res.arrayBuffer()))
  }
  const sha256 = createHash('sha256').update(readFileSync(dumpPath)).digest('hex')

  const db = `atlas_scratch_${id}`
  console.log(`Restoring ${id} into ${db}…`)
  run('dropdb', ['--if-exists', db])
  run('createdb', [db])
  run('pg_restore', ['--no-owner', '--no-privileges', '-d', db, dumpPath])

  const counts = await extractAtlas(`${SCRATCH_BASE}/${db}`, dir('raw', id))
  writeJson(dir('raw', id, 'source.json'), {
    backupId: id,
    herokuApp: HEROKU_APP,
    finishedAt,
    sha256,
    extractedAt: new Date().toISOString(),
    counts,
  })
  console.log(`\n✓ ${id} extracted to ${path.relative(ROOT, dir('raw', id))}`)
}

// ─── bootstrap / record ─────────────────────────────────────────────────────

/**
 * A raw extraction as both build and record see it: de-duplicated, then with
 * the merge decisions applied — excluded rows gone, a removed duplicate's
 * registrants on its survivor, a split service's second site its own row. Applying them here, ahead of the overlay, is
 * what keeps them out of it: a merge is decided in code, never frozen in as
 * a curated value.
 */
function prepareRaw(rawId: string): Tables {
  const raw = readTables(dir('raw', rawId))
  dedupeAtlasData(raw as unknown as DedupeData)
  raw.events = raw.events.filter((e) => !EXCLUDED_EVENT_LEGACY_IDS.has(e.legacyId))
  raw.registrations = raw.registrations.map((reg) => {
    const survivor = MERGED_EVENT_TARGETS[reg.eventId as number]
    return survivor == null ? reg : { ...reg, eventId: survivor }
  })
  raw.clients = applyClientDecisions(raw.clients, raw.regions)
  return raw
}

function writeOverlay(curatedDir: string, rawId: string, note: string): void {
  const curated = readTables(curatedDir)
  const raw = prepareRaw(rawId)
  const summary: Record<string, { entries: number; curatedFields: number }> = {}
  for (const table of TABLES) {
    const { entries, orphans } = recordOverlay(curated[table], raw[table], OVERLAY_SPECS[table])
    if (orphans.length) {
      throw new Error(
        `${table}: ${orphans.length} curated row(s) have no row in raw/${rawId} ` +
          `(${orphans.slice(0, 10).join(', ')}). Record against the extraction they were groomed from.`,
      )
    }
    writeJson(dir('overlay', `${table}.json`), entries)
    summary[table] = {
      entries: entries.length,
      curatedFields: entries.reduce((n, e) => n + Object.keys(e.set).length, 0),
    }
  }
  writeJson(dir('overlay', 'meta.json'), {
    recordedAgainst: rawId,
    recordedAt: new Date().toISOString(),
    note,
  })
  console.table(summary)
}

function bootstrapStep(baseline: string, curatedDir: string): void {
  writeOverlay(path.resolve(curatedDir), baseline, `bootstrapped from ${curatedDir}`)
  console.log(`\n✓ Overlay recorded against ${baseline}. Next: pnpm atlas:sync build`)
}

function recordStep(rawId: string, groomed: boolean): void {
  const worksheet = dir('groom', `${rawId}.json`)
  const pending = existsSync(worksheet) ? readJson<unknown[]>(worksheet).length : 0
  if (pending > 0 && !groomed) {
    throw new Error(
      `${pending} row(s) in ${path.relative(ROOT, worksheet)} were waiting for grooming. Recording ` +
        'marks every row of seeds/atlas/data/ as reviewed, so pass --groomed once they are done.',
    )
  }
  writeOverlay(
    path.join(ROOT, 'seeds/atlas/data'),
    rawId,
    `recorded from seeds/atlas/data after grooming ${rawId}`,
  )
  console.log('\n✓ Overlay recorded. Next: pnpm atlas:sync build && pnpm atlas:sync check')
}

// ─── build ──────────────────────────────────────────────────────────────────

function buildStep(rawId: string): void {
  const source = readJson<Record<string, unknown>>(dir('raw', rawId, 'source.json'))
  const raw = prepareRaw(rawId)

  const meta = existsSync(dir('overlay', 'meta.json'))
    ? readJson<{ recordedAgainst: string }>(dir('overlay', 'meta.json'))
    : null
  if (!meta) throw new Error('No overlay yet. Run `pnpm atlas:sync bootstrap` (once) first.')

  const built = {} as Tables
  const outcomes: Partial<Record<Table, RowOutcome[]>> = {}
  const deletedUpstream: Partial<Record<Table, string[]>> = {}
  for (const table of TABLES) {
    const entries = readJson<OverlayEntry[]>(dir('overlay', `${table}.json`))
    const result = applyOverlay(raw[table], entries, OVERLAY_SPECS[table])
    built[table] = result.rows
    outcomes[table] = result.outcomes
    deletedUpstream[table] = result.deletedUpstream
  }

  const reviewable = outcomes.events ?? []

  const expectedCounts = deriveExpectedCounts(built as unknown as CountInput)
  const dataDir = path.join(ROOT, 'seeds/atlas/data')
  for (const table of TABLES) writeJson(path.join(ROOT, atlasDataFile(table)), built[table])
  writeJson(path.join(ROOT, atlasDataFile('manifest')), {
    source,
    overlayRecordedAgainst: meta.recordedAgainst,
    builtAt: new Date().toISOString(),
    rows: Object.fromEntries(TABLES.map((t) => [t, built[t].length])),
    expectedCounts,
  })

  // Rows owing a review, with what a three-way groom needs beside each.
  const entriesById = new Map(
    readJson<OverlayEntry[]>(dir('overlay', 'events.json')).map((e) => [e.legacyId, e]),
  )
  const builtById = new Map(built.events.map((e) => [e.legacyId, e]))
  const worksheet = [...reviewable, ...(outcomes.venues ?? [])]
    .filter((o) => o.status !== 'unchanged')
    .map((o) => {
      const isVenue = (outcomes.venues ?? []).includes(o)
      const entry = isVenue ? undefined : entriesById.get(o.legacyId)
      return {
        table: isVenue ? 'venues' : 'events',
        ...o,
        previousMechanical: entry?.basis ?? null,
        previousCurated: entry ? { ...entry.basis, ...entry.set } : null,
        current: isVenue
          ? built.venues.find((v) => v.legacyId === o.legacyId)
          : builtById.get(o.legacyId),
      }
    })
  writeJson(dir('groom', `${rawId}.json`), worksheet)

  const previousRaw = meta.recordedAgainst !== rawId ? prepareRaw(meta.recordedAgainst) : null
  const report = buildReport({
    rawId,
    previousRawId: meta.recordedAgainst,
    built,
    previousRaw,
    outcomes: reviewable,
    venueOutcomes: outcomes.venues ?? [],
    deletedUpstream,
    expectedCounts,
  })
  writeJson(dir('reports', `${rawId}.json`), report.json)
  writeFileSync(dir('reports', `${rawId}.md`), report.markdown)

  console.log(
    `✓ Built ${path.relative(ROOT, dataDir)} from raw/${rawId} (overlay of ${meta.recordedAgainst})`,
  )
  console.table(Object.fromEntries(TABLES.map((t) => [t, built[t].length])))
  console.log('Expected counts:', expectedCounts)
  console.log(
    `${worksheet.length} row(s) to groom → ${path.relative(ROOT, dir('groom', `${rawId}.json`))}\n` +
      `Report → ${path.relative(ROOT, dir('reports', `${rawId}.md`))}`,
  )
}

// ─── groom ──────────────────────────────────────────────────────────────────

type Patch = Partial<Record<'events' | 'venues', Record<string, Record<string, unknown>>>>

function groomStep(rawId: string, patchFile: string): void {
  const worksheet = readJson<{ table: string; legacyId: number }[]>(dir('groom', `${rawId}.json`))
  const patch = readJson<Patch>(path.resolve(patchFile))
  const dataDir = path.join(ROOT, 'seeds/atlas/data')
  const pending = new Set(worksheet.filter((w) => w.table === 'events').map((w) => w.legacyId))

  const summary: Record<string, number> = {}
  for (const table of ['events', 'venues'] as const) {
    const file = path.join(ROOT, atlasDataFile(table))
    const rows = readJson<Row[]>(file)
    const byId = new Map(rows.map((r) => [String(r.legacyId), r]))
    let cleaned = 0
    if (table === 'events') {
      for (let i = 0; i < rows.length; i++) {
        if (!pending.has(rows[i].legacyId)) continue
        rows[i] = cleanEventRow(rows[i])
        byId.set(String(rows[i].legacyId), rows[i])
        cleaned++
      }
    }
    const edits = patch[table] ?? {}
    const unknown = Object.keys(edits).filter((id) => !byId.has(id))
    if (unknown.length)
      throw new Error(`Patch names ${table} absent from the data: ${unknown.join(', ')}`)
    for (const [id, fields] of Object.entries(edits)) Object.assign(byId.get(id)!, fields)
    writeJson(file, rows)
    summary[`${table} cleaned`] = cleaned
    summary[`${table} patched`] = Object.keys(edits).length
  }
  console.table(summary)
  console.log(
    `\n✓ Groomed ${path.relative(ROOT, dataDir)}. Next: pnpm atlas:sync check, then ` +
      'record --groomed, build, check.',
  )
}

// ─── check ──────────────────────────────────────────────────────────────────

function checkStep(): void {
  const data = readTables(path.join(ROOT, 'seeds/atlas/data'))
  const manifest = readJson<{ expectedCounts: Record<string, number> }>(
    path.join(ROOT, atlasDataFile('manifest')),
  )
  const failures = checkAtlasData(data as unknown as CheckData, new Date().getFullYear())

  const derived = deriveExpectedCounts(data as unknown as CountInput)
  const drift = Object.entries(derived).filter(([k, v]) => manifest.expectedCounts[k] !== v)
  if (drift.length)
    failures.push({ rule: 'manifest counts are stale — rebuild', offenders: drift.map(([k]) => k) })

  const missing = missingMergeSurvivors(data.events)
  if (missing.length) {
    console.warn(
      `⚠ Merge survivors missing from the data (deleted upstream?): ${missing.join(', ')}. ` +
        'Their removed duplicates’ registrations will skip — review MERGED_EVENT_TARGETS.',
    )
  }

  if (!failures.length) {
    console.log(
      `✓ ${data.events.length} events, ${data.registrations.length} registrations — all checks pass`,
    )
    return
  }
  for (const f of failures) {
    console.error(`✗ ${f.rule} (${f.offenders.length}): ${f.offenders.slice(0, 25).join(', ')}`)
  }
  process.exitCode = 1
}

// ─── entry ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      backup: { type: 'string' },
      baseline: { type: 'string' },
      curated: { type: 'string' },
      groomed: { type: 'boolean', default: false },
      patch: { type: 'string' },
    },
  })
  const step = positionals[0]
  switch (step) {
    case 'fetch':
      return fetchStep(values.backup)
    case 'bootstrap':
      if (!values.baseline || !values.curated)
        throw new Error('bootstrap needs --baseline and --curated')
      return bootstrapStep(values.baseline, values.curated)
    case 'build':
      return buildStep(values.backup ?? latestRaw())
    case 'groom':
      if (!values.patch) throw new Error('groom needs --patch <file>')
      return groomStep(values.backup ?? latestRaw(), values.patch)
    case 'record':
      return recordStep(values.backup ?? latestRaw(), values.groomed ?? false)
    case 'check':
      return checkStep()
    default:
      console.error(
        'Usage: pnpm atlas:sync <fetch|bootstrap|build|groom|record|check> — see seeds/atlas/sync/cli.ts',
      )
      process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
