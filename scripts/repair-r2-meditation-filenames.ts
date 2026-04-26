#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Reconcile production meditation filenames with the actual R2 object keys.
 *
 * Dry run:
 *   pnpm tsx scripts/repair-r2-meditation-filenames.ts
 *
 * Apply updates:
 *   pnpm tsx scripts/repair-r2-meditation-filenames.ts --force
 *
 * R2 listing uses the configured Wrangler remote R2 binding by default.
 * If that is unavailable, the script falls back to S3-compatible R2 env vars:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_R2_ACCESS_KEY_ID
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY
 *
 * D1 reads/updates use the local Wrangler auth context.
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { config as loadEnv } from 'dotenv'
import slugify from 'slugify'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

loadEnv({ path: path.join(PROJECT_ROOT, '.env.local') })

const D1_DATABASE = process.env.D1_DATABASE || 'sahajcloud'
const R2_BUCKET = process.env.R2_BUCKET || 'sahajcloud'
const AUDIO_EXTENSIONS = new Set(['.aac', '.mp3', '.ogg'])

interface MeditationRow {
  filesize: number | null
  id: number
  label: string | null
  filename: string
}

interface R2AudioObject {
  key: string
  size?: number
  uploaded?: string
}

interface RepairCandidate {
  id: number
  label: string | null
  currentFilename: string
  r2Key: string
}

interface PlatformProxy {
  env?: Record<string, unknown>
  dispose?: () => Promise<void>
}

interface R2BucketBinding {
  list: (options?: { cursor?: string; limit?: number }) => Promise<{
    cursor?: string
    objects: Array<{ key: string; size?: number; uploaded?: Date | string }>
    truncated: boolean
  }>
}

const hasFlag = (flag: string): boolean => process.argv.includes(flag)

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`

const GENERATED_SUFFIX_PATTERN = /-([a-z0-9]{6})$/i
const DURATION_TOKEN_PATTERN = /^\d{1,3}mins?$/i

const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const normalizeForMatch = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase()
  const base = path.basename(filename, ext)
  const withoutGeneratedSuffix = base.replace(GENERATED_SUFFIX_PATTERN, (match, suffix: string) =>
    DURATION_TOKEN_PATTERN.test(suffix) ? match : '',
  )
  const slug = slugify(withoutGeneratedSuffix, { lower: true, strict: true })
  return `${slug}${ext}`
}

const extractRowsFromWranglerJson = (output: string): MeditationRow[] => {
  const parsed = JSON.parse(output) as unknown
  const wrappers = Array.isArray(parsed) ? parsed : [parsed]
  const rows: MeditationRow[] = []

  for (const wrapper of wrappers) {
    if (
      typeof wrapper === 'object' &&
      wrapper !== null &&
      'results' in wrapper &&
      Array.isArray(wrapper.results)
    ) {
      rows.push(...(wrapper.results as MeditationRow[]))
    }
  }

  return rows
}

const getMeditationRows = (): MeditationRow[] => {
  const output = execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      D1_DATABASE,
      '--remote',
      '--json',
      '--command',
      'SELECT id, label, filename, filesize FROM meditations WHERE filename IS NOT NULL ORDER BY id;',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )

  return extractRowsFromWranglerJson(output).filter(
    (row): row is MeditationRow =>
      typeof row.id === 'number' && typeof row.filename === 'string' && row.filename.length > 0,
  )
}

const createR2Client = (): S3Client => {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    },
  })
}

const listR2AudioObjectsWithS3 = async (): Promise<R2AudioObject[]> => {
  const client = createR2Client()
  const objects: R2AudioObject[] = []
  let continuationToken: string | undefined

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    )

    for (const object of response.Contents ?? []) {
      if (!object.Key) continue
      if (AUDIO_EXTENSIONS.has(path.extname(object.Key).toLowerCase())) {
        objects.push({
          key: object.Key,
          size: object.Size,
          uploaded: object.LastModified?.toISOString(),
        })
      }
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return objects
}

const listR2AudioObjectsWithPlatformProxy = async (): Promise<R2AudioObject[]> => {
  const { getPlatformProxy } = (await import('wrangler')) as {
    getPlatformProxy: (options: { remoteBindings: boolean }) => Promise<PlatformProxy>
  }

  const proxy = await getPlatformProxy({ remoteBindings: true })

  try {
    const bucket = proxy.env?.R2 as R2BucketBinding | undefined
    if (!bucket?.list) {
      throw new Error('Wrangler platform proxy did not provide an R2 binding named "R2".')
    }

    const objects: R2AudioObject[] = []
    let cursor: string | undefined

    do {
      const result = await bucket.list({ cursor, limit: 1000 })

      for (const object of result.objects) {
        if (AUDIO_EXTENSIONS.has(path.extname(object.key).toLowerCase())) {
          objects.push({
            key: object.key,
            size: object.size,
            uploaded: object.uploaded ? String(object.uploaded) : undefined,
          })
        }
      }

      cursor = result.truncated ? result.cursor : undefined
    } while (cursor)

    return objects
  } finally {
    await proxy.dispose?.()
  }
}

const listR2AudioObjects = async (): Promise<R2AudioObject[]> => {
  try {
    return await listR2AudioObjectsWithPlatformProxy()
  } catch (error) {
    console.warn(
      `Wrangler R2 binding listing failed; falling back to S3 credentials: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  try {
    return await listR2AudioObjectsWithS3()
  } catch (error) {
    throw new Error(
      `Unable to list R2 objects with Wrangler binding or S3 credentials. Check Wrangler login and/or CLOUDFLARE_R2_ACCESS_KEY_ID/CLOUDFLARE_R2_SECRET_ACCESS_KEY in .env.local. Last error: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const buildR2MatchIndex = (objects: R2AudioObject[]): Map<string, R2AudioObject[]> => {
  const index = new Map<string, R2AudioObject[]>()

  for (const object of objects) {
    const normalized = normalizeForMatch(object.key)
    const matches = index.get(normalized) ?? []
    matches.push(object)
    index.set(normalized, matches)
  }

  return index
}

const formatR2Object = (object: R2AudioObject): string =>
  [
    object.key,
    typeof object.size === 'number' ? `size=${object.size}` : undefined,
    object.uploaded ? `uploaded=${object.uploaded}` : undefined,
  ]
    .filter(Boolean)
    .join(' ')

const selectMatch = (row: MeditationRow, matches: R2AudioObject[]): R2AudioObject[] => {
  if (row.filesize == null || matches.length <= 1) return matches

  const sizeMatches = matches.filter((match) => match.size === row.filesize)
  return sizeMatches.length > 0 ? sizeMatches : matches
}

const findRepairCandidates = (
  rows: MeditationRow[],
  r2Objects: R2AudioObject[],
): RepairCandidate[] => {
  const r2KeySet = new Set(r2Objects.map((object) => object.key))
  const r2MatchIndex = buildR2MatchIndex(r2Objects)
  const dbFilenameOwners = new Map(rows.map((row) => [row.filename, row.id]))
  const candidates: RepairCandidate[] = []
  const missingRows: MeditationRow[] = []

  let alreadyValid = 0
  let ambiguous = 0
  let missing = 0
  let conflicts = 0

  for (const row of rows) {
    if (r2KeySet.has(row.filename)) {
      alreadyValid += 1
      continue
    }

    const matches = r2MatchIndex.get(normalizeForMatch(row.filename)) ?? []

    if (matches.length === 0) {
      missing += 1
      missingRows.push(row)
      continue
    }

    const selectedMatches = selectMatch(row, matches)

    if (selectedMatches.length > 1) {
      ambiguous += 1
      console.warn(
        `Ambiguous R2 match for meditation ${row.id} (${row.filename}, filesize=${row.filesize ?? 'unknown'}):`,
      )
      for (const match of matches) console.warn(`  - ${formatR2Object(match)}`)
      continue
    }

    const r2Key = selectedMatches[0].key
    const owner = dbFilenameOwners.get(r2Key)
    if (owner !== undefined && owner !== row.id) {
      conflicts += 1
      console.warn(
        `Skipping meditation ${row.id}: matched R2 key already belongs to meditation ${owner}: ${r2Key}`,
      )
      continue
    }

    candidates.push({
      id: row.id,
      label: row.label,
      currentFilename: row.filename,
      r2Key,
    })
  }

  console.log(`Meditations checked: ${rows.length}`)
  console.log(`Already valid: ${alreadyValid}`)
  console.log(`Repair candidates: ${candidates.length}`)
  console.log(`Missing R2 match: ${missing}`)
  console.log(`Ambiguous R2 match: ${ambiguous}`)
  console.log(`Conflicts: ${conflicts}`)

  if (missingRows.length > 0) {
    console.log('\nMissing R2 matches:')
    for (const row of missingRows.slice(0, 25)) {
      console.log(
        `- #${row.id} ${row.label ?? '(untitled)'}\n  ${row.filename}\n  normalized=${normalizeForMatch(row.filename)} filesize=${row.filesize ?? 'unknown'}`,
      )
    }
    if (missingRows.length > 25) {
      console.log(`...and ${missingRows.length - 25} more`)
    }
  }

  return candidates
}

const printCandidates = (candidates: RepairCandidate[]): void => {
  for (const candidate of candidates.slice(0, 25)) {
    console.log(
      `- #${candidate.id} ${candidate.label ?? '(untitled)'}\n  ${candidate.currentFilename}\n  -> ${candidate.r2Key}`,
    )
  }

  if (candidates.length > 25) {
    console.log(`...and ${candidates.length - 25} more`)
  }
}

const applyCandidates = (candidates: RepairCandidate[]): void => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'r2-meditation-repair-'))
  const sqlPath = path.join(tempDir, 'repair.sql')
  const statements = [
    'PRAGMA foreign_keys=OFF;',
    ...candidates.flatMap((candidate) => [
      `UPDATE meditations SET filename = ${sqlString(candidate.r2Key)} WHERE id = ${candidate.id} AND filename = ${sqlString(candidate.currentFilename)};`,
      `UPDATE _meditations_v SET version_filename = ${sqlString(candidate.r2Key)} WHERE parent_id = ${candidate.id} AND version_filename = ${sqlString(candidate.currentFilename)};`,
    ]),
    'PRAGMA foreign_keys=ON;',
  ]

  writeFileSync(sqlPath, statements.join('\n'))

  console.warn(
    `Applying ${candidates.length} production D1 filename repairs to ${D1_DATABASE}. This is irreversible except by another SQL update.`,
  )
  execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', D1_DATABASE, '--remote', '--file', sqlPath],
    {
      stdio: 'inherit',
    },
  )
}

async function main(): Promise<void> {
  const force = hasFlag('--force')

  console.log(`D1 database: ${D1_DATABASE}`)
  console.log(`R2 bucket: ${R2_BUCKET}`)
  console.log(force ? 'Mode: apply (--force)' : 'Mode: dry run')

  const rows = getMeditationRows()
  const r2Objects = await listR2AudioObjects()
  const candidates = findRepairCandidates(rows, r2Objects)

  if (candidates.length === 0) return

  printCandidates(candidates)

  if (!force) {
    console.log('\nDry run only. Re-run with --force to apply these D1 updates.')
    return
  }

  applyCandidates(candidates)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
