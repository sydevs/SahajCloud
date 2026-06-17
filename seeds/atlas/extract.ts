/**
 * One-shot Atlas → JSON extractor (Phase 1 of the Atlas migration).
 *
 * Reads the legacy Sahaj Atlas data from a scratch local Postgres (restored
 * from `atlas.dump`) and writes one target-shaped JSON file per imported table
 * into `seeds/atlas/data/`. This is throwaway tooling — the importer that
 * consumes these files is a separate ticket (see seeds/atlas/MIGRATION_PLAN.md).
 *
 * Usage:
 *   1. createdb atlas_scratch && pg_restore --no-owner --no-privileges \
 *        -d atlas_scratch atlas.dump
 *   2. ATLAS_DB_URL=postgres://localhost/atlas_scratch pnpm tsx seeds/atlas/extract.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { Client, types } from 'pg'

import { dedupeAtlasFiles } from './dedupe'

// node-postgres returns int8/bigint as strings (to avoid precision loss) but
// int4 as numbers. Atlas mixes the two across FK columns (e.g. managers.id is
// bigint, managed_records.manager_id is int4), so relationship keys would not
// match. All Atlas ids are well under 2^53 — parse int8 as a JS number for a
// single consistent numeric id type everywhere.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)))

const DB_URL = process.env.ATLAS_DB_URL ?? 'postgres://localhost:5432/atlas_scratch'
const OUT_DIR = path.resolve(process.cwd(), 'seeds/atlas/data')

const EVENT_CATEGORY: Record<number, string> = {
  1: 'dropin',
  2: 'single',
  3: 'course',
  4: 'festival',
  5: 'concert',
  6: 'inactive',
}
const REGISTRATION_MODE: Record<number, string> = {
  0: 'native',
  1: 'external',
  2: 'meetup',
  3: 'eventbrite',
  4: 'facebook',
}
const REGISTRATION_NOTIFICATION: Record<number, string> = {
  0: 'digest',
  1: 'immediate',
  2: 'disabled',
}
const CONTACT_METHOD: Record<number, string> = {
  0: 'email',
  1: 'whatsapp',
  2: 'telegram',
  3: 'wechat',
}
// Ruby `flag` bitmask fields, least-significant bit first (from the Atlas
// models). Each decodes to an array of the enabled flag names.
const NOTIFICATION_FLAGS = [
  'new_managed_record',
  'event_verification',
  'event_registrations',
  'place_summary',
  'country_summary',
  'application_summary',
  'client_summary',
] as const
const REGISTRATION_QUESTION_FLAGS = ['questions', 'experience', 'aspirations', 'referral'] as const

type Row = Record<string, any>

const enumMap = (map: Record<number, string>, v: number | null): string | null =>
  v == null ? null : (map[v] ?? String(v))

/** Decode a Ruby `flag` bitmask into the enabled flag names. */
function decodeFlags(flags: readonly string[], mask: number | null): string[] {
  if (mask == null) return []
  return flags.filter((_, i) => (mask & (1 << i)) !== 0)
}

/**
 * Parse the country `mailing_list` Ruby-YAML blob down to just which mailing
 * service was used (e.g. `brevo`). The rest — api_key (a live secret), list_id,
 * and opt-in copy — is intentionally dropped.
 */
function parseMailingService(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw : null
  if (!text || text === '{}') return null
  const m = text.match(/(?:^|\n)service:\s*([^\n]+)/)
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') || null : null
}

/** Normalize a recurrence date ("2023-07-26" or "August 19, 2023") to ISO YYYY-MM-DD. */
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  // Use local components — `trimmed` is a date-only value, avoid TZ day-shift.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const normalizeTime = (raw: string | null): string | null => {
  if (!raw) return null
  const v = raw.trim().replace(/^['"]|['"]$/g, '')
  return /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null
}

/**
 * Parse the event `recurrence_data` Ruby-YAML into a structured schedule.
 * Handles both dialects: old `:symbol:` keys with ISO dates, and newer string
 * keys (`type:`, `'on':`) with human dates. Returns null for inactive events
 * with no real recurrence.
 */
function parseSchedule(raw: unknown): Row | null {
  const text = typeof raw === 'string' ? raw : null
  if (!text) return null
  const get = (key: string): string | null => {
    // Match `:key: value` or `key: value` or `'key': value`.
    const m = text.match(new RegExp(`(?:^|\\n)\\s*:?'?${key}'?:\\s*([^\\n]*)`))
    return m
      ? m[1]
          .trim()
          .replace(/^:/, '')
          .replace(/^['"]|['"]$/g, '')
      : null
  }
  const type = get('type')
  if (!type) return null

  let frequency: 'daily' | 'weekly' | 'monthly'
  let interval = 1
  let weekNumber: number | null = null
  if (type.startsWith('daily')) frequency = 'daily'
  else if (type.startsWith('weekly')) {
    frequency = 'weekly'
    const m = type.match(/weekly_(\d+)/)
    if (m) interval = parseInt(m[1], 10)
  } else if (type.startsWith('monthly')) {
    frequency = 'monthly'
    weekNumber = 1 // only `monthly_1st` is present in the data
  } else return null

  const weekday = get('on') || null
  return {
    frequency,
    interval,
    weekNumber,
    weekday: weekday || null,
    startDate: normalizeDate(get('start_date')),
    startTime: normalizeTime(get('start_time')),
    endDate: normalizeDate(get('end_date')),
    endTime: normalizeTime(get('end_time')),
  }
}

/** Map an Atlas polymorphic record_type to a regions-tree level. */
function recordTypeToLevel(recordType: string): 'country' | 'region' | 'area' | null {
  switch (recordType) {
    case 'Country':
      return 'country'
    case 'Region':
      return 'region'
    case 'Area':
    case 'LocalArea':
      return 'area'
    default:
      return null
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const db = new Client({ connectionString: DB_URL })
  await db.connect()
  const all = async (sql: string): Promise<Row[]> => (await db.query(sql)).rows

  // --- Reference sets for orphan pruning ---
  const regionIds = new Set((await all('select id from regions')).map((r) => r.id))
  const referencedVenueIds = new Set(
    (await all('select distinct venue_id from events where venue_id is not null')).map(
      (r) => r.venue_id,
    ),
  )

  const written: Record<string, number> = {}
  const write = (name: string, data: unknown[]) => {
    writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2) + '\n')
    written[name] = data.length
  }

  // --- regions.json (countries + regions + areas as a nested tree) ---
  const countries = await all('select * from countries')
  const regions = await all('select * from regions')
  const areas = await all('select * from areas order by id')

  const geoNodes: Row[] = []
  for (const c of countries) {
    geoNodes.push({
      legacyId: c.id,
      level: 'country',
      parent: null,
      name: c.name,
      countryCode: c.country_code,
      defaultLanguageCode: c.default_language_code,
      enableRegions: c.enable_regions,
      mailingService: parseMailingService(c.mailing_list),
      osmId: c.osm_id,
    })
  }
  // Region parent = the country sharing its country_code.
  const countryByCode = new Map(countries.map((c) => [c.country_code, c.id]))
  for (const r of regions) {
    geoNodes.push({
      legacyId: r.id,
      level: 'region',
      parent: countryByCode.has(r.country_code)
        ? { level: 'country', legacyId: countryByCode.get(r.country_code) }
        : null,
      name: r.name,
      countryCode: r.country_code,
      osmId: r.osm_id,
    })
  }
  // Area parent = its region (if region_id set & valid), else its country by code.
  for (const a of areas) {
    let parent: Row | null = null
    if (a.region_id != null && regionIds.has(a.region_id)) {
      parent = { level: 'region', legacyId: a.region_id }
    } else if (countryByCode.has(a.country_code)) {
      parent = { level: 'country', legacyId: countryByCode.get(a.country_code) }
    }
    geoNodes.push({
      legacyId: a.id,
      level: 'area',
      parent,
      name: a.name,
      countryCode: a.country_code,
      subtitle: a.subtitle,
      latitude: a.latitude,
      longitude: a.longitude,
      radius: a.radius,
      timeZone: a.time_zone,
    })
  }
  write('regions', geoNodes)

  // --- venues.json (pruned to event-referenced) ---
  const venues = await all('select * from venues order by id')
  write(
    'venues',
    venues
      .filter((v) => referencedVenueIds.has(v.id))
      .map((v) => ({
        legacyId: v.id,
        placeId: v.place_id,
        name: v.name,
        street: v.street,
        city: v.city,
        countryCode: v.country_code,
        postCode: v.post_code,
        regionCode: v.region_code,
        latitude: v.latitude,
        longitude: v.longitude,
        timeZone: v.time_zone,
      })),
  )

  // --- events.json ---
  // The raw Atlas status integer is preserved verbatim (`0` and `6` are the only
  // values in the dump); the importer maps it to #484's `verificationStage`
  // (`0 → verified`, `6 → finished`). The full raw row rides along in
  // `legacyData` so the deferred verification/expiry state machine (#484) can
  // read the lifecycle timestamps (`verified_at`, `expiration_period`,
  // `should_update_status_at`, …) without re-accessing `atlas.dump`. Events carry
  // no secrets, so keeping the entire row is safe.
  const events = await all('select * from events order by id')
  write(
    'events',
    events.map((e) => ({
      legacyId: e.id,
      eventType: e.type === 'OnlineEvent' ? 'online' : 'offline',
      category: enumMap(EVENT_CATEGORY, e.category),
      status: e.status,
      customName: e.custom_name,
      room: e.room,
      description: e.description,
      published: e.published,
      languageCode: e.language_code,
      onlineUrl: e.online_url,
      registrationMode: enumMap(REGISTRATION_MODE, e.registration_mode),
      registrationUrl: e.registration_url,
      registrationLimit: e.registration_limit,
      registrationNotification: enumMap(REGISTRATION_NOTIFICATION, e.registration_notification),
      registrationQuestions: decodeFlags(REGISTRATION_QUESTION_FLAGS, e.registration_question),
      contactInfo: e.contact_info && Object.keys(e.contact_info).length ? e.contact_info : null,
      verificationStreak: e.verification_streak,
      managerId: e.manager_id,
      venueId: e.venue_id,
      areaId: e.area_id,
      finishDate: e.finish_date ? normalizeDate(String(e.finish_date)) : null,
      schedule: parseSchedule(e.recurrence_data),
      createdAt: e.created_at,
      // Full raw Atlas row (all columns, jsonb parsed) for the deferred #484
      // lifecycle work — keeps `verified_at`, `expiration_period`, etc.
      legacyData: e,
    })),
  )

  // --- registrations.json ---
  const registrations = await all('select * from registrations order by id')
  write(
    'registrations',
    registrations.map((r) => ({
      legacyId: r.id,
      eventId: r.event_id,
      userId: r.user_id,
      startingAt: r.starting_at,
      timeZone: r.time_zone,
      questions: r.questions && Object.keys(r.questions).length ? r.questions : null,
      uuid: r.uuid,
      mailingListSubscribedAt: r.mailing_list_subscribed_at,
      createdAt: r.created_at,
    })),
  )

  // --- users.json ---
  const users = await all('select * from users order by id')
  write(
    'users',
    users.map((u) => ({ legacyId: u.id, email: u.email, name: u.name, createdAt: u.created_at })),
  )

  // --- managers.json (with folded managed_records → customResourceAccess) ---
  // Atlas `managed_records` is each manager's geographic responsibility. It's
  // folded onto the manager here as `customResourceAccess` so the Phase-3
  // importer (which only sees these JSON files, not `atlas.dump`) can resolve
  // each ref to a `regions` doc and add the manager to that region's `managers`
  // — the owning side of geo responsibility post-#476. The name is historical
  // (the Payload `Managers.customResourceAccess` field was dropped in #476); the
  // importer never writes it back to a manager.
  const countryIds = new Set(countries.map((c) => c.id))
  const areaIds = new Set(areas.map((a) => a.id))
  const managedRecords = await all('select * from managed_records order by id')
  const craByManager = new Map<number, Row[]>()
  const seenCra = new Set<string>()
  for (const mr of managedRecords) {
    const level = recordTypeToLevel(mr.record_type)
    if (!level) continue
    // Drop refs whose target no longer exists (1 orphan LocalArea → area 59).
    const exists =
      (level === 'country' && countryIds.has(mr.record_id)) ||
      (level === 'region' && regionIds.has(mr.record_id)) ||
      (level === 'area' && areaIds.has(mr.record_id))
    if (!exists) continue
    const key = `${mr.manager_id}:${level}:${mr.record_id}`
    if (seenCra.has(key)) continue
    seenCra.add(key)
    const list = craByManager.get(mr.manager_id) ?? []
    list.push({ level, legacyId: mr.record_id })
    craByManager.set(mr.manager_id, list)
  }

  const managers = await all('select * from managers order by id')
  write(
    'managers',
    managers.map((m) => ({
      legacyId: m.id,
      name: m.name,
      email: m.email,
      type: m.administrator ? 'admin' : 'manager',
      languageCode: m.language_code,
      phone: m.phone,
      phoneVerified: m.phone_verified,
      emailVerified: m.email_verified,
      contactMethod: enumMap(CONTACT_METHOD, m.contact_method),
      notifications: decodeFlags(NOTIFICATION_FLAGS, m.notifications),
      lastLoginAt: m.last_login_at,
      customResourceAccess: craByManager.get(m.id) ?? [],
    })),
  )

  // --- clients.json (public_key → clientId; secret dropped; geo scope → regions ref) ---
  const clients = await all('select * from clients order by id')
  write(
    'clients',
    clients.map((c) => {
      const level = c.location_type ? recordTypeToLevel(c.location_type) : null
      return {
        legacyId: c.id,
        label: c.label,
        config: c.config && Object.keys(c.config).length ? c.config : null,
        managerId: c.manager_id,
        clientId: c.public_key,
        enabled: c.enabled,
        location: level && c.location_id != null ? { level, legacyId: c.location_id } : null,
        createdAt: c.created_at,
      }
    }),
  )

  // --- pictures.json (event images → constructed GCS source URL) ---
  // Prune pictures whose parent event was deleted (8 orphans across events
  // 12/20/29/537) — they cannot be linked to anything on import.
  const eventIds = new Set(events.map((e) => e.id))
  const pictures = (
    await all("select * from pictures where parent_type = 'Event' order by id")
  ).filter((p) => eventIds.has(p.parent_id))
  write(
    'pictures',
    pictures.map((p) => {
      const filename = typeof p.file === 'string' ? p.file : (p.file?.toString() ?? null)
      return {
        legacyId: p.id,
        eventId: p.parent_id,
        filename,
        sourceUrl: filename
          ? `https://storage.googleapis.com/sahaj-atlas/uploads/picture/file/${p.id}/${filename}`
          : null,
      }
    }),
  )

  await db.end()
  console.log('Wrote JSON files to', OUT_DIR)
  for (const [name, count] of Object.entries(written)) console.log(`  ${name}.json: ${count}`)

  // De-duplicate same-place regions/venues so every node resolves to a distinct
  // (unique) mapboxId on import — repeatable on every refetch. See dedupe.ts.
  const dedupe = dedupeAtlasFiles(OUT_DIR)
  console.log('De-duplicated:', JSON.stringify(dedupe))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
