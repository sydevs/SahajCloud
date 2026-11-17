import type { CollectionSlug, File, Payload, RequestContext } from 'payload'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { SUBMISSION_MACHINE } from '@/collections/UserSubmissions/machine'
import { EVENT_MACHINE } from '@/lib/eventVerification/machine'
import { withActor } from '@/lib/stateMachine/actor'

import { ID } from './ids'
import { fixtureOrder } from './order'
import {
  FIXTURE_ID_FLOOR,
  type CollectionFixture,
  type FixtureEntry,
  type FixtureSlug,
} from './types'

import { FIXTURES } from '.'

/** Where a fixture's `file` lives. Traced into the standalone build by `next.config.ts`. */
export const FIXTURE_FILES_DIR = path.resolve(process.cwd(), 'src/fixture/files')

const MIME_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

/**
 * Every write the load makes carries this. `fixture` is what the hooks with an
 * outside effect — mail, a queued job, a vendor call — return early on. The two
 * actors let a row land on any lifecycle state: `import` is the writer for a
 * file that decides (`tests/AGENTS.md`).
 */
export const FIXTURE_CONTEXT: RequestContext = withActor(
  withActor({ fixture: true }, EVENT_MACHINE, 'import'),
  SUBMISSION_MACHINE,
  'import',
)

const kvKey = (slug: string, id: number): string => `fixture:${slug}:${id}`

/** JSON with sorted keys, so a hash moves only when content does. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** The ISO week a date falls in, as `2026-W47`. */
function isoWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * A row's hash: its content, plus its file's bytes and the week for an upload.
 *
 * Relative dates are already resolved into `data`, so a new day moves the hash
 * of exactly the rows that use one. ⚠ The week is there because a preview's
 * upload is reaped by `cleanup-preview-assets` after 7 days whatever row still
 * points at it, so an upload is re-sent at least once a week.
 */
export function entryHash<S extends FixtureSlug>(
  entry: FixtureEntry<S>,
  file: Buffer | null,
  now: Date,
): string {
  const { id: _id, ...content } = entry
  return createHash('sha256')
    .update(
      stableStringify({
        ...content,
        file: file && createHash('sha256').update(file).digest('hex'),
        week: file ? isoWeek(now) : undefined,
      }),
    )
    .digest('hex')
}

async function loadFile(name: string): Promise<{ data: Buffer; file: File }> {
  const data = await readFile(path.join(FIXTURE_FILES_DIR, name))
  const mimetype = MIME_TYPES[path.extname(name).toLowerCase()]
  if (!mimetype) throw new Error(`No MIME type known for fixture file ${name}`)
  return { data, file: { data, mimetype, name, size: data.length } }
}

export interface LoadReport {
  created: number
  updated: number
  unchanged: number
  deleted: number
  errors: { slug: string; id: number; error: unknown }[]
}

type AnyEntry = FixtureEntry<FixtureSlug>

/**
 * ⚠ Collections whose rich text holds blocks with relationship fields, written
 * as the fixture's admin. Lexical gives every such field a `filterOptions`
 * that refuses a collection whose `admin.hidden` hides it from `req.user`
 * (`applyBaseFilterToFields`), and validates it with no `overrideAccess` — so
 * with no user every block relationship is refused as an invalid selection.
 * The admin is read in All Content (`currentProject: null`), where nothing is
 * hidden.
 */
const WRITTEN_AS_ADMIN: ReadonlySet<FixtureSlug> = new Set(['pages'])

const fixtureAdmin = async (payload: Payload) => ({
  ...(await payload.findByID({
    collection: 'managers',
    id: ID.managers.admin,
    depth: 0,
    overrideAccess: true,
  })),
  collection: 'managers' as const,
  currentProject: null,
})

/** Write one entry, and add its id to `ids` the moment its row exists. */
async function writeEntry(
  payload: Payload,
  slug: FixtureSlug,
  entry: AnyEntry,
  ids: Set<number>,
  file: File | undefined,
): Promise<void> {
  const exists = ids.has(entry.id)
  const collection = slug as CollectionSlug
  const data = entry.data as Record<string, unknown>
  const common = {
    collection,
    context: FIXTURE_CONTEXT,
    depth: 0,
    overrideAccess: true,
    ...(WRITTEN_AS_ADMIN.has(slug) ? { user: await fixtureAdmin(payload) } : {}),
  } as const
  const draft = data._status === 'draft'

  if (entry.direct) {
    // Beneath every hook, as `entry.direct` explains.
    if (exists) {
      await payload.db.updateOne({ collection, where: { id: { equals: entry.id } }, data })
    } else {
      await payload.db.create({ collection, data: { ...data, id: entry.id } })
    }
  } else if (exists) {
    await payload.update({ ...common, id: entry.id, data, draft, file, trash: true } as never)
  } else {
    await payload.create({ ...common, data: { ...data, id: entry.id }, draft, file } as never)
  }
  ids.add(entry.id)

  for (const [locale, patch] of Object.entries(entry.locales ?? {})) {
    const published = (patch as Record<string, unknown>)._status === 'published'
    await payload.update({
      ...common,
      id: entry.id,
      locale,
      data: patch,
      trash: true,
      ...(published ? { publishSpecificLocale: locale } : {}),
    } as never)
  }
}

/** The fixture ids already in a collection: every row at or above the floor. */
async function existingIds(payload: Payload, slug: FixtureSlug): Promise<Set<number>> {
  const { docs } = await payload.db.find<{ id: number }>({
    collection: slug,
    where: { id: { greater_than_equal: FIXTURE_ID_FLOOR } },
    limit: 0,
    pagination: false,
    select: { id: true },
  })
  return new Set(docs.map((doc) => Number(doc.id)))
}

/**
 * Bring the database's fixture rows level with `src/fixture/`.
 *
 * A row whose stored hash matches is left alone, so a boot with nothing changed
 * writes nothing, and a reviewer's edit to a fixture row survives the next
 * deploy. A missing row is created at its pinned id, a changed one is updated,
 * and a row at or above the floor that the fixture no longer names is deleted.
 * A row below the floor is never read or written.
 *
 * One Postgres advisory lock serialises loads, so two boots — a dev reload, two
 * replicas — never write at once; the second finds nothing to do.
 */
export async function loadFixture(
  payload: Payload,
  fixtures: CollectionFixture[] = FIXTURES,
  now: Date = new Date(),
): Promise<LoadReport> {
  const report: LoadReport = { created: 0, updated: 0, unchanged: 0, deleted: 0, errors: [] }
  const order = fixtureOrder(
    payload.config.collections,
    fixtures.map((f) => f.slug),
  )
  const bySlug = new Map(fixtures.map((f) => [f.slug, f]))

  const client = await payload.db.pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['sahaj-fixture'])

    const present = new Map<FixtureSlug, Set<number>>()
    for (const slug of order) present.set(slug, await existingIds(payload, slug))

    // ⚠ A relationship inside rich text or a block is no column, so the order
    // above cannot see it, and such references can run both ways (a page
    // listing meditations, a node pointing at its page). A row refused for
    // naming one not written yet is retried once the rest are in, until a pass
    // writes nothing more; what is still refused then is a real error.
    let pending = order.flatMap((slug) =>
      (bySlug.get(slug)?.entries ?? []).map((entry) => ({ slug, entry: entry as AnyEntry })),
    )
    let failed: ((typeof pending)[number] & { error: unknown })[] = []
    while (pending.length) {
      failed = []
      for (const { slug, entry } of pending) {
        const ids = present.get(slug)!
        try {
          const loaded = entry.file ? await loadFile(entry.file) : undefined
          const hash = entryHash(entry, loaded?.data ?? null, now)
          const exists = ids.has(entry.id)
          if (exists && (await payload.kv.get<string>(kvKey(slug, entry.id))) === hash) {
            report.unchanged++
            continue
          }
          await writeEntry(payload, slug, entry, ids, loaded?.file)
          await payload.kv.set(kvKey(slug, entry.id), hash)
          report[exists ? 'updated' : 'created']++
        } catch (error) {
          failed.push({ slug, entry, error })
        }
      }
      if (failed.length === pending.length) break
      pending = failed
    }
    for (const { slug, entry, error } of failed) report.errors.push({ slug, id: entry.id, error })

    // Prune in reverse order, so a row goes before whatever it points at.
    for (const slug of [...order].reverse()) {
      const named = new Set((bySlug.get(slug)?.entries ?? []).map((e) => e.id))
      for (const id of present.get(slug) ?? []) {
        if (named.has(id)) continue
        try {
          await payload.delete({
            collection: slug as CollectionSlug,
            id,
            context: FIXTURE_CONTEXT,
            overrideAccess: true,
            trash: true,
          })
          await payload.kv.delete(kvKey(slug, id))
          report.deleted++
        } catch (error) {
          report.errors.push({ slug, id, error })
        }
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['sahaj-fixture']).catch(() => {})
    client.release()
  }
  return report
}
