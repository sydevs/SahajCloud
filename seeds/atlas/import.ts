#!/usr/bin/env tsx

/**
 * Atlas Import Script (Phase 3 of the Sahaj Atlas → Payload migration).
 *
 * Reads the 8 pre-extracted JSON files in `seeds/atlas/data/` and imports them
 * into the Phase-2 collections, idempotently keyed on the hidden indexed
 * `legacyId`. See seeds/atlas/MIGRATION_PLAN.md for the full design.
 *
 * Highlights:
 * - Relationships rewired via `legacyId` maps (regions keyed by `level:legacyId`
 *   since countries/regions/areas share an id space).
 * - Venues have no collection: a venue used by >1 event becomes a Regions
 *   `center`; a single-use venue's address is lifted onto the event.
 * - `mapboxId` resolved via the server-side Search Box geocoder (src/lib/mapbox).
 * - Event status → #484 `verificationStage` (0→verified / 6→finished) with the
 *   verification backfill seeded under `context.skipVerifyHook`.
 * - Event pictures re-uploaded from GCS into Images and linked to their event.
 *
 * Usage: `pnpm seed atlas [--dry-run] [--update]`
 */

import type { Payload } from 'payload'

import { randomUUID } from 'node:crypto'
import * as path from 'path'

import {
  type RegionLevel,
  resolveRegionLocation,
  geocodeRegion,
  MANUAL_LOCATION,
} from '@/lib/mapbox/geocoder'
import { makeManualMapboxId } from '@/lib/mapbox/manualLocation'

import { BaseImporter, type BaseImportOptions, fetchAsset, MediaUploader } from '../lib'
import { plainTextToLexical } from './helpers/lexical'
import {
  mapContactDetails,
  mapLanguageCode,
  managerVerificationCadence,
  mapNotificationPreferences,
  type NotificationPreferences,
} from './helpers/managerMapper'
import { type AtlasSchedule, mapSchedule } from './helpers/scheduleMapper'
import {
  type AtlasVenue,
  multiUseVenueIds,
  venueDisplayName,
  venueParentAreaId,
  venueToEventAddress,
} from './helpers/venueRouter'
import { buildImportVerification } from './helpers/verification'

// ============================================================================
// SOURCE DATA TYPES (shape of seeds/atlas/data/*.json)
// ============================================================================

type GeoRef = { level: 'country' | 'region' | 'area'; legacyId: number }

interface AtlasUser {
  legacyId: number
  email: string
  name: string
  createdAt: string
}

interface AtlasManager {
  legacyId: number
  name: string
  email: string
  type: 'admin' | 'manager'
  languageCode: string | null
  phone: string | null
  phoneVerified: boolean | null
  emailVerified: boolean | null
  contactMethod: string | null
  notifications: string[]
  lastLoginAt: string | null
  customResourceAccess: GeoRef[]
}

interface AtlasRegion {
  legacyId: number
  level: 'country' | 'region' | 'area'
  parent: { level: 'country' | 'region'; legacyId: number } | null
  name: string
  countryCode: string | null
  defaultLanguageCode?: string | null
  subtitle?: string | null
  latitude?: number | null
  longitude?: number | null
  radius?: number | null
  timeZone?: string | null
}

interface AtlasEvent {
  legacyId: number
  eventType: 'offline' | 'online'
  category: string
  status: number | null
  customName: string | null
  room: string | null
  description: string | null
  published: boolean
  languageCode: string | null
  onlineUrl: string | null
  registrationMode: string | null
  registrationUrl: string | null
  registrationLimit: number | null
  registrationQuestions: string[]
  contactInfo: { phone_name?: string; phone_number?: string } | null
  managerId: number | null
  venueId: number | null
  areaId: number | null
  schedule: AtlasSchedule | null
  createdAt: string
  legacyData: Record<string, unknown>
}

interface AtlasRegistration {
  legacyId: number
  eventId: number
  userId: number
  startingAt: string | null
  timeZone: string | null
  questions: Record<string, unknown> | null
  uuid: string
  mailingListSubscribedAt: string | null
  createdAt: string
}

interface AtlasClient {
  legacyId: number
  label: string
  config: Record<string, string> | null
  managerId: number | null
  clientId: string | null
  enabled: boolean
  location: GeoRef | null
  createdAt: string
}

interface AtlasPicture {
  legacyId: number
  eventId: number
  filename: string | null
  sourceUrl: string | null
}

interface AtlasData {
  users: AtlasUser[]
  managers: AtlasManager[]
  regions: AtlasRegion[]
  venues: AtlasVenue[]
  events: AtlasEvent[]
  registrations: AtlasRegistration[]
  clients: AtlasClient[]
  pictures: AtlasPicture[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Atlas region level → Payload region level (`area` is renamed to `city`). */
const ATLAS_TO_PAYLOAD_LEVEL: Record<GeoRef['level'], RegionLevel> = {
  country: 'country',
  region: 'region',
  area: 'city',
}

/**
 * The `idMaps.regions` key for an Atlas geo-ref, applying the area→city rename.
 * Centralised so the transform can't be forgotten at one call site. (Node keys
 * built from an already-Payload level — `city:areaId`, `center:venueId` — are
 * written inline since there's no ref to translate.)
 */
const geoRefKey = (ref: { level: GeoRef['level']; legacyId: number }): string =>
  `${ATLAS_TO_PAYLOAD_LEVEL[ref.level]}:${ref.legacyId}`

/**
 * Best-effort map of Atlas registration-question flags → the Events
 * `registrationQuestions` checkbox group. The legacy flags don't fully line up
 * with the placeholder question set, so unmapped flags are warned about for the
 * real registration flow to reconcile.
 */
const REGISTRATION_QUESTION_MAP: Record<string, string> = {
  experience: 'priorExperience',
  referral: 'referralSource',
}

const DEFAULT_LOCALE = 'en'

// ============================================================================
// ATLAS IMPORTER
// ============================================================================

export class AtlasImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Atlas'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/atlas')

  private mediaUploader!: MediaUploader
  private cachedData?: AtlasData

  /** legacyId → Payload id. Regions key on `${level}:${legacyId}` (shared id space). */
  private idMaps = {
    users: new Map<number, number | string>(),
    managers: new Map<number, number | string>(),
    regions: new Map<string, number | string>(),
    events: new Map<number, number | string>(),
  }

  /** Venue legacyId → resolved address `mapboxId` (geocoded once, reused per event). */
  private venueMapbox = new Map<number, string>()

  static async runFromMigration(payload: Payload): Promise<void> {
    const importer = new AtlasImporter({ dryRun: false, clearCache: false, payload })
    await importer.run()
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  protected async setup(): Promise<void> {
    if (this.options.dryRun) return
    this.mediaUploader = new MediaUploader(this.payload, this.logger)
    await Promise.all([
      this.preloadCollection('managers', 'legacyId'),
      this.preloadCollection('events', 'legacyId'),
      this.preloadCollection('registrations', 'legacyId'),
      this.preloadCollection('clients', 'legacyId'),
      // Users are NOT preloaded: they dedupe on a normalized (lowercased) email
      // and the dump has 166 case-insensitive duplicates, so upsert's
      // find-then-create path (which re-checks the DB per row) is what catches
      // them — a stale preload cache would let same-email rows collide.
    ])
  }

  /**
   * Rebuild the legacyId→id maps from the DB for paginated batches (each HTTP
   * request is a fresh importer). Regions key on `level:legacyId`; users map
   * every Atlas legacyId (including email-duplicates) to the one stored user.
   */
  protected async reconstructIdMaps(): Promise<void> {
    // Each paginated batch is a fresh importer, so rebuild the legacyId→id maps
    // from the DB — but only the ones the targeted collection consumes:
    // managers ← regions/events/clients; regions ← events/clients;
    // events ← registrations/pictures; users ← registrations.
    const need = (slug: string): boolean => !this.isPaginated() || this.isCollectionTargeted(slug)

    const rebuildLegacyIdMap = async (slug: 'managers' | 'events'): Promise<void> => {
      const docs = await this.payload.find({
        collection: slug,
        limit: 100000,
        depth: 0,
        select: { legacyId: true },
      })
      this.idMaps[slug].clear()
      for (const doc of docs.docs) {
        if (doc.legacyId != null) this.idMaps[slug].set(doc.legacyId, doc.id)
      }
    }

    if (need('regions') || need('events') || need('clients')) await rebuildLegacyIdMap('managers')
    if (need('registrations') || need('pictures')) await rebuildLegacyIdMap('events')

    if (need('events') || need('clients')) {
      const regions = await this.payload.find({
        collection: 'regions',
        limit: 100000,
        depth: 0,
        select: { legacyId: true, level: true },
      })
      this.idMaps.regions.clear()
      for (const region of regions.docs) {
        if (region.legacyId != null)
          this.idMaps.regions.set(`${region.level}:${region.legacyId}`, region.id)
      }
    }

    if (need('registrations')) {
      const data = await this.getData()
      const users = await this.payload.find({
        collection: 'users',
        limit: 100000,
        depth: 0,
        select: { legacyId: true, email: true },
      })
      const idByEmail = new Map<string, number | string>()
      for (const user of users.docs) {
        if (user.email) idByEmail.set(user.email.toLowerCase(), user.id)
      }
      this.idMaps.users.clear()
      for (const user of data.users) {
        const id = idByEmail.get(user.email.trim().toLowerCase())
        if (id != null) this.idMaps.users.set(user.legacyId, id)
      }
    }
  }

  protected async import(): Promise<void> {
    const data = await this.getData()

    if (this.options.dryRun) {
      this.validateDryRun(data)
      return
    }

    const targeted = (slug: string): boolean =>
      !this.isPaginated() || this.isCollectionTargeted(slug)

    if (targeted('managers')) await this.importManagers(data)
    if (targeted('regions')) await this.importRegions(data)
    if (targeted('users')) await this.importUsers(data)
    if (targeted('events')) await this.importEvents(data)
    if (targeted('registrations')) await this.importRegistrations(data)
    if (targeted('clients')) await this.importClients(data)
    if (targeted('pictures')) await this.importPictures(data)

    if (this.mediaUploader) {
      const stats = this.mediaUploader.getStats()
      await this.logger.info(`\n📁 Media: ${stats.uploaded} uploaded, ${stats.reused} reused`)
    }
  }

  // ─── Data loading ───────────────────────────────────────────────────────

  private async getData(): Promise<AtlasData> {
    if (this.cachedData) return this.cachedData
    const dir = path.resolve(process.cwd(), 'seeds/atlas/data')
    const load = async <T>(name: string): Promise<T> =>
      JSON.parse(await this.loadDataFile(path.join(dir, `${name}.json`))) as T

    const [users, managers, regions, venues, events, registrations, clients, pictures] =
      await Promise.all([
        load<AtlasUser[]>('users'),
        load<AtlasManager[]>('managers'),
        load<AtlasRegion[]>('regions'),
        load<AtlasVenue[]>('venues'),
        load<AtlasEvent[]>('events'),
        load<AtlasRegistration[]>('registrations'),
        load<AtlasClient[]>('clients'),
        load<AtlasPicture[]>('pictures'),
      ])

    this.cachedData = { users, managers, regions, venues, events, registrations, clients, pictures }
    return this.cachedData
  }

  // ─── Dry run: counts + referential-integrity validation (no DB, no network) ─

  private validateDryRun(data: AtlasData): void {
    // Each collection's first batch (offset 0) validates it once; skip the rest.
    if (this.options.pagination?.offset) return
    const t = (slug: string): boolean => !this.isPaginated() || this.isCollectionTargeted(slug)
    const ids = (rows: { legacyId: number }[]): Set<number> => new Set(rows.map((r) => r.legacyId))
    const geoKeys = new Set(data.regions.map((r) => geoRefKey(r)))
    const userIds = ids(data.users)
    const eventIds = ids(data.events)
    const managerIds = ids(data.managers)
    const venueIds = ids(data.venues)

    const count = (slug: string, n: number): void => void this.logger.info(`  ${slug}: ${n}`)
    const dangling = (label: string, n: number): void => {
      if (n > 0) this.addWarning(`${label}: ${n} dangling reference(s)`)
    }

    this.logger.info('\nAtlas dry-run — counts + referential integrity:')

    if (t('managers')) {
      count('managers', data.managers.length)
      dangling(
        'managers.customResourceAccess',
        data.managers
          .flatMap((m) => m.customResourceAccess ?? [])
          .filter((r) => !geoKeys.has(geoRefKey(r))).length,
      )
    }
    if (t('regions')) {
      count('regions', data.regions.length)
      dangling(
        'regions.parent',
        data.regions.filter(
          (r) => r.parent && !geoKeys.has(`${r.parent.level}:${r.parent.legacyId}`),
        ).length,
      )
      count('venues (→ centers / inline)', data.venues.length)
    }
    if (t('users')) count('users', data.users.length)
    if (t('events')) {
      count('events', data.events.length)
      dangling(
        'events.manager',
        data.events.filter((e) => e.managerId != null && !managerIds.has(e.managerId)).length,
      )
      dangling(
        'events.area',
        data.events.filter((e) => e.areaId != null && !geoKeys.has(`city:${e.areaId}`)).length,
      )
      dangling(
        'events.venue',
        data.events.filter((e) => e.venueId != null && !venueIds.has(e.venueId)).length,
      )
    }
    if (t('registrations')) {
      count('registrations', data.registrations.length)
      dangling(
        'registrations.event',
        data.registrations.filter((r) => !eventIds.has(r.eventId)).length,
      )
      dangling(
        'registrations.user',
        data.registrations.filter((r) => !userIds.has(r.userId)).length,
      )
    }
    if (t('clients')) {
      count('clients', data.clients.length)
      dangling(
        'clients.manager',
        data.clients.filter((c) => c.managerId != null && !managerIds.has(c.managerId)).length,
      )
    }
    if (t('pictures')) {
      count('pictures (→ Images)', data.pictures.length)
      dangling('pictures.event', data.pictures.filter((p) => !eventIds.has(p.eventId)).length)
    }
  }

  // ─── Managers ─────────────────────────────────────────────────────────

  private async importManagers(data: AtlasData): Promise<void> {
    await this.logger.info('\n=== Importing Managers ===')
    const total = data.managers.length

    for (let i = 0; i < total; i++) {
      const manager = data.managers[i]
      try {
        const prefs = mapNotificationPreferences(manager.notifications, manager.contactMethod)
        const result = await this.upsert<{ id: number }>(
          'managers',
          { legacyId: { equals: manager.legacyId } },
          {
            name: manager.name,
            email: manager.email,
            type: manager.type,
            language: mapLanguageCode(manager.languageCode),
            contactDetails: mapContactDetails(
              manager.contactMethod,
              manager.phone,
              manager.phoneVerified,
            ),
            notificationPreferences: prefs,
            // Atlas managers authenticate passwordlessly; give a random password
            // they'll never use (reset/passwordless on first login).
            password: randomPassword(),
            _verified: !!manager.emailVerified,
            legacyId: manager.legacyId,
            legacyData: manager,
          },
          // Bulk import: skip the per-manager verification email (mail rate limits).
          { identifier: manager.email, current: i + 1, total, disableVerificationEmail: true },
        )
        this.idMaps.managers.set(manager.legacyId, result.doc.id)
      } catch (error) {
        this.addError(`Manager ${manager.email} (#${manager.legacyId})`, error as Error)
      }
    }
  }

  // ─── Regions (country → region → city → center) ─────────────────────────

  private async importRegions(data: AtlasData): Promise<void> {
    await this.logger.info('\n=== Importing Regions ===')

    // Invert managers' geo responsibility: region key → manager Payload ids.
    const managersByRegion = new Map<string, (number | string)[]>()
    for (const manager of data.managers) {
      const managerId = this.idMaps.managers.get(manager.legacyId)
      if (managerId == null) continue
      for (const ref of manager.customResourceAccess ?? []) {
        const key = geoRefKey(ref)
        const list = managersByRegion.get(key) ?? []
        if (!list.includes(managerId)) list.push(managerId)
        managersByRegion.set(key, list)
      }
    }

    const byLevel = (level: AtlasRegion['level']): AtlasRegion[] =>
      data.regions.filter((r) => r.level === level)

    // Country → region → area in level order so parents resolve first.
    for (const country of byLevel('country')) {
      await this.upsertRegion(country, null, managersByRegion, country.defaultLanguageCode)
    }
    for (const region of byLevel('region')) {
      const parentKey = region.parent ? `${region.parent.level}:${region.parent.legacyId}` : null
      await this.upsertRegion(region, parentKey, managersByRegion)
    }
    for (const area of byLevel('area')) {
      const parentKey = area.parent ? `${area.parent.level}:${area.parent.legacyId}` : null
      await this.upsertRegion(area, parentKey, managersByRegion)
    }

    await this.importCenters(data, managersByRegion)
  }

  /** Upsert one country/region/city node, resolving its mapboxId + parent + managers. */
  private async upsertRegion(
    region: AtlasRegion,
    parentKey: string | null,
    managersByRegion: Map<string, (number | string)[]>,
    languageCode?: string | null,
  ): Promise<void> {
    const level = ATLAS_TO_PAYLOAD_LEVEL[region.level]
    const mapKey = `${level}:${region.legacyId}`
    try {
      const { location, warning } = await resolveRegionLocation({
        name: region.name,
        level,
        latitude: region.latitude,
        longitude: region.longitude,
        countryCode: region.countryCode,
        radius: region.radius,
      })
      if (warning) this.addWarning(`Region "${region.name}" (#${region.legacyId}): ${warning}`)

      const parentId = parentKey ? this.idMaps.regions.get(parentKey) : undefined
      if (parentKey && parentId == null) {
        this.addWarning(
          `Region "${region.name}" (#${region.legacyId}): parent ${parentKey} unresolved`,
        )
      }

      const eventDefaults = this.buildEventDefaults(languageCode, region.timeZone)
      const result = await this.upsert<{ id: number }>(
        'regions',
        { and: [{ legacyId: { equals: region.legacyId } }, { level: { equals: level } }] },
        {
          level,
          name: region.name,
          subtitle: region.subtitle ?? undefined,
          parent: parentId,
          ...this.locationData(location, mapKey),
          managers: managersByRegion.get(mapKey),
          ...(eventDefaults ? { eventDefaults } : {}),
          legacyId: region.legacyId,
          legacyData: region,
        },
        { identifier: `${level}:${region.name}` },
      )
      this.idMaps.regions.set(mapKey, result.doc.id)
    } catch (error) {
      this.addError(`Region "${region.name}" (${level} #${region.legacyId})`, error as Error)
    }
  }

  /** Multi-use venues (>1 event) become `center` nodes under their area/city. */
  private async importCenters(
    data: AtlasData,
    managersByRegion: Map<string, (number | string)[]>,
  ): Promise<void> {
    const venuesById = new Map(data.venues.map((v) => [v.legacyId, v]))
    const centerVenueIds = multiUseVenueIds(data.events)
    await this.logger.info(`\n=== Importing ${centerVenueIds.size} centers (multi-use venues) ===`)

    for (const venueId of centerVenueIds) {
      const venue = venuesById.get(venueId)
      if (!venue) continue
      const areaId = venueParentAreaId(venueId, data.events)
      const parentId = areaId != null ? this.idMaps.regions.get(`city:${areaId}`) : undefined
      const mapKey = `center:${venueId}`
      try {
        const { location, warning } = await resolveRegionLocation({
          name: venueDisplayName(venue),
          level: 'center',
          latitude: venue.latitude,
          longitude: venue.longitude,
          countryCode: venue.countryCode,
        })
        if (warning)
          this.addWarning(`Center "${venueDisplayName(venue)}" (venue #${venueId}): ${warning}`)

        const result = await this.upsert<{ id: number }>(
          'regions',
          { and: [{ legacyId: { equals: venueId } }, { level: { equals: 'center' } }] },
          {
            level: 'center',
            name: venueDisplayName(venue),
            parent: parentId,
            ...this.locationData(location, mapKey),
            managers: managersByRegion.get(mapKey),
            legacyId: venueId,
            legacyData: venue,
          },
          { identifier: `center:${venueDisplayName(venue)}` },
        )
        this.idMaps.regions.set(mapKey, result.doc.id)
      } catch (error) {
        this.addError(`Center for venue #${venueId}`, error as Error)
      }
    }
  }

  // ─── Users (dedupe on email) ────────────────────────────────────────────

  private async importUsers(data: AtlasData): Promise<void> {
    await this.logger.info('\n=== Importing Users ===')
    const batch = this.paginateItems(data.users)
    const total = data.users.length
    const offset = this.options.pagination?.offset ?? 0

    for (let i = 0; i < batch.length; i++) {
      const user = batch[i]
      // Normalize the email: Payload stores it lowercased + uniquely, so
      // case-variant duplicates must collapse to one user (and share its id).
      const email = user.email.trim().toLowerCase()
      try {
        const result = await this.upsert<{ id: number }>(
          'users',
          { email: { equals: email } },
          { name: user.name, email, legacyId: user.legacyId, legacyData: user },
          { identifier: email, current: offset + i + 1, total },
        )
        this.idMaps.users.set(user.legacyId, result.doc.id)
      } catch (error) {
        this.addError(`User ${email} (#${user.legacyId})`, error as Error)
      }
    }
  }

  // ─── Events ───────────────────────────────────────────────────────────

  private async importEvents(data: AtlasData): Promise<void> {
    await this.logger.info('\n=== Importing Events ===')
    const batch = this.paginateItems(data.events)
    const total = data.events.length
    const offset = this.options.pagination?.offset ?? 0
    const now = new Date()

    const venuesById = new Map(data.venues.map((v) => [v.legacyId, v]))
    const centerVenueIds = multiUseVenueIds(data.events)
    const managersByLegacyId = new Map(data.managers.map((m) => [m.legacyId, m]))
    // Area (→ city) timezone, the schedule timezone for venue-less (online) events.
    const areaTimeZoneById = new Map(
      data.regions.filter((r) => r.level === 'area').map((r) => [r.legacyId, r.timeZone]),
    )

    for (let i = 0; i < batch.length; i++) {
      const event = batch[i]
      const identifier = event.customName || `event-${event.legacyId}`
      try {
        await this.importEvent(event, {
          now,
          venuesById,
          centerVenueIds,
          managersByLegacyId,
          areaTimeZoneById,
          current: offset + i + 1,
          total,
        })
      } catch (error) {
        this.addError(`Event "${identifier}" (#${event.legacyId})`, error as Error)
      }
    }
  }

  private async importEvent(
    event: AtlasEvent,
    ctx: {
      now: Date
      venuesById: Map<number, AtlasVenue>
      centerVenueIds: Set<number>
      managersByLegacyId: Map<number, AtlasManager>
      areaTimeZoneById: Map<number, string | null | undefined>
      current: number
      total: number
    },
  ): Promise<void> {
    const managerId =
      event.managerId != null ? this.idMaps.managers.get(event.managerId) : undefined
    if (managerId == null) {
      await this.skip(`event #${event.legacyId}: manager #${event.managerId} unresolved`, {
        collection: 'events',
        identifier: `event-${event.legacyId}`,
      })
      return
    }

    const venue = event.venueId != null ? ctx.venuesById.get(event.venueId) : undefined
    const isCenter = event.venueId != null && ctx.centerVenueIds.has(event.venueId)
    const regionId = isCenter
      ? this.idMaps.regions.get(`center:${event.venueId}`)
      : event.areaId != null
        ? this.idMaps.regions.get(`city:${event.areaId}`)
        : undefined

    const inactive = event.category === 'inactive'
    // Contact is all-or-nothing: contactName is required whenever contactPhone
    // is set, so a lone phone (no name) — ~61 Atlas events — can't satisfy the
    // schema. Import the pair only when both are present (raw values ride along
    // in legacyData regardless).
    const rawContactName = event.contactInfo?.phone_name?.trim() || undefined
    const rawContactPhone = event.contactInfo?.phone_number?.trim() || undefined
    const hasContact = !!rawContactName && !!rawContactPhone
    const contactName = hasContact ? rawContactName : undefined
    const contactPhone = hasContact ? rawContactPhone : undefined

    // Schedule timezone: the venue's (offline) or the event's area's (online).
    const timeZone =
      venue?.timeZone ?? (event.areaId != null ? ctx.areaTimeZoneById.get(event.areaId) : undefined)
    let address: Record<string, unknown> | undefined
    if (event.eventType === 'offline' && venue) {
      const mapboxId = await this.resolveVenueMapbox(venue)
      address = { ...venueToEventAddress(venue, mapboxId), room: event.room?.trim() || undefined }
    }

    const language = mapLanguageCode(event.languageCode)
    if (!language && event.languageCode) {
      this.addWarning(
        `Event #${event.legacyId}: unsupported language "${event.languageCode}" → ${DEFAULT_LOCALE}`,
      )
    }

    const cadence = managerVerificationCadence(
      this.managerPrefs(event.managerId, ctx.managersByLegacyId),
    )
    const verification = buildImportVerification({ status: event.status, cadence, now: ctx.now })

    // Publish state. Inactive events with no contact info can't satisfy the
    // contact requirement, so import them as a draft (drafts skip validation).
    const wantsPublish = event.published
    const draftReason = inactive && !hasContact ? 'inactive event without contact info' : null
    if (draftReason && wantsPublish) {
      this.addWarning(`Event #${event.legacyId}: importing as draft — ${draftReason}`)
    }
    const status = wantsPublish && !draftReason ? 'published' : 'draft'

    const eventData: Record<string, unknown> = {
      title:
        event.customName?.trim() ||
        (event.eventType === 'online' ? 'Online Sahaj Yoga Meditation' : undefined),
      languages: [language ?? DEFAULT_LOCALE],
      contactPhone,
      contactName,
      // Atlas stores descriptions as plain text; the richText field needs Lexical.
      description: plainTextToLexical(event.description),
      inactive,
      ...(inactive ? {} : { schedule: mapSchedule(event.schedule, timeZone) ?? undefined }),
      region: regionId,
      eventType: event.eventType,
      onlineUrl: event.eventType === 'online' ? event.onlineUrl?.trim() || undefined : undefined,
      ...(address ? { address } : {}),
      registrationMode: event.registrationMode === 'native' ? 'sahaj-atlas' : 'external',
      externalRegistrationUrl:
        event.registrationMode !== 'native'
          ? event.registrationUrl?.trim() || undefined
          : undefined,
      registrationLimit: event.registrationLimit ?? undefined,
      registrationQuestions: this.mapRegistrationQuestions(event),
      manager: managerId,
      ...verification,
      _status: status,
      legacyId: event.legacyId,
      legacyData: event.legacyData,
    }
    const upsertOpts = {
      identifier: event.customName || `event-${event.legacyId}`,
      current: ctx.current,
      total: ctx.total,
      // Keep the imported verification snapshot — don't let verifyOnSave reset it.
      context: { skipVerifyHook: true },
    }
    const where = { legacyId: { equals: event.legacyId } }

    let result: { doc: { id: number } }
    try {
      result = await this.upsert<{ id: number }>('events', where, eventData, upsertOpts)
    } catch (error) {
      // Don't drop a published event with incomplete/malformed source data (e.g.
      // a bad onlineUrl) — re-import it as a draft so an admin can fix + publish.
      if (status !== 'published' || (error as Error)?.name !== 'ValidationError') throw error
      this.addWarning(`Event #${event.legacyId}: imported as draft — ${(error as Error).message}`)
      result = await this.upsert<{ id: number }>(
        'events',
        where,
        { ...eventData, _status: 'draft' },
        upsertOpts,
      )
    }
    this.idMaps.events.set(event.legacyId, result.doc.id)
  }

  // ─── Registrations ──────────────────────────────────────────────────────

  private async importRegistrations(data: AtlasData): Promise<void> {
    await this.logger.info('\n=== Importing Registrations ===')
    const batch = this.paginateItems(data.registrations)
    const total = data.registrations.length
    const offset = this.options.pagination?.offset ?? 0

    for (let i = 0; i < batch.length; i++) {
      const reg = batch[i]
      const eventId = this.idMaps.events.get(reg.eventId)
      const userId = this.idMaps.users.get(reg.userId)
      if (eventId == null || userId == null) {
        await this.skip(`registration ${reg.uuid}: event/user unresolved`, {
          collection: 'registrations',
          identifier: reg.uuid,
          current: offset + i + 1,
          total,
        })
        continue
      }
      try {
        await this.upsert(
          'registrations',
          { legacyId: { equals: reg.legacyId } },
          {
            event: eventId,
            user: userId,
            startingAt: reg.startingAt ?? undefined,
            startingAt_tz: reg.timeZone ?? undefined,
            questions: reg.questions ?? undefined,
            uuid: reg.uuid,
            mailingListSubscribedAt: reg.mailingListSubscribedAt ?? undefined,
            legacyId: reg.legacyId,
          },
          { identifier: reg.uuid, current: offset + i + 1, total },
        )
      } catch (error) {
        this.addError(`Registration ${reg.uuid} (#${reg.legacyId})`, error as Error)
      }
    }
  }

  // ─── Clients ──────────────────────────────────────────────────────────

  private async importClients(data: AtlasData): Promise<void> {
    await this.logger.info('\n=== Importing Clients ===')
    const total = data.clients.length

    for (let i = 0; i < total; i++) {
      const client = data.clients[i]
      const managerId =
        client.managerId != null ? this.idMaps.managers.get(client.managerId) : undefined
      if (managerId == null) {
        await this.skip(`client "${client.label}": manager #${client.managerId} unresolved`, {
          collection: 'clients',
          identifier: client.label,
          current: i + 1,
          total,
        })
        continue
      }
      const region = client.location
        ? this.idMaps.regions.get(geoRefKey(client.location))
        : undefined
      try {
        await this.upsert(
          'clients',
          { legacyId: { equals: client.legacyId } },
          {
            name: client.label,
            managers: [managerId],
            primaryContact: managerId,
            roles: ['sahaj-atlas-client'],
            active: client.enabled,
            domains: client.config?.domain || undefined,
            color1: isHexColor(client.config?.primary_color)
              ? client.config?.primary_color
              : undefined,
            locale: mapLanguageCode(client.config?.locale),
            region,
            clientId: client.clientId ?? undefined,
            legacyConfig: client.config
              ? {
                  routing_type: client.config.routing_type,
                  embed_type: client.config.embed_type,
                  default_view: client.config.default_view,
                }
              : undefined,
            legacyId: client.legacyId,
            legacyData: client,
          },
          { identifier: client.label, current: i + 1, total },
        )
      } catch (error) {
        this.addError(`Client "${client.label}" (#${client.legacyId})`, error as Error)
      }
    }
  }

  // ─── Pictures (GCS → Images, linked to events) ──────────────────────────

  private async importPictures(data: AtlasData): Promise<void> {
    await this.logger.info('\n=== Importing Pictures ===')
    const batch = this.paginateItems(data.pictures)
    const total = data.pictures.length
    const offset = this.options.pagination?.offset ?? 0

    // imageIds collected per event in this batch, then linked. Images use
    // numeric ids in Postgres, which is what events.images expects.
    const imagesByEvent = new Map<number, number[]>()

    for (let i = 0; i < batch.length; i++) {
      const picture = batch[i]
      const identifier = picture.filename || `picture-${picture.legacyId}`
      if (!picture.sourceUrl || !picture.filename) {
        await this.skip(`picture #${picture.legacyId}: no source URL`, {
          collection: 'images',
          identifier,
          current: offset + i + 1,
          total,
        })
        continue
      }
      const eventId = this.idMaps.events.get(picture.eventId)
      if (eventId == null) {
        await this.skip(`picture #${picture.legacyId}: event #${picture.eventId} unresolved`, {
          collection: 'images',
          identifier,
          current: offset + i + 1,
          total,
        })
        continue
      }
      try {
        const cachePath = path.join(
          this.cacheDir,
          `picture-${picture.legacyId}-${picture.filename}`,
        )
        const buffer = await fetchAsset(picture.sourceUrl, { cachePath })
        const result = await this.mediaUploader.uploadWithDeduplication(cachePath, {
          buffer,
          sourceUrl: picture.sourceUrl,
          originalFilename: picture.filename,
          alt: 'Event photo',
        })
        const list = imagesByEvent.get(picture.eventId) ?? []
        list.push(result.id as number)
        imagesByEvent.set(picture.eventId, list)
        await this.reportDocument('images', identifier, result.wasReused ? 'skipped' : 'created', {
          current: offset + i + 1,
          total,
        })
      } catch (error) {
        this.addWarning(
          `Picture #${picture.legacyId} (${picture.sourceUrl}): ${(error as Error).message}`,
        )
      }
    }

    // Link the batch's uploaded images to their events (merge with existing).
    for (const [legacyEventId, imageIds] of imagesByEvent) {
      const eventId = this.idMaps.events.get(legacyEventId)
      if (eventId == null) continue
      try {
        const event = await this.payload.findByID({ collection: 'events', id: eventId, depth: 0 })
        const existing = Array.isArray(event.images) ? (event.images as number[]) : []
        const merged = Array.from(new Set([...existing, ...imageIds]))
        await this.payload.update({
          collection: 'events',
          id: eventId,
          data: { images: merged },
          context: { skipVerifyHook: true },
        })
      } catch (error) {
        this.addWarning(`Linking images to event #${legacyEventId}: ${(error as Error).message}`)
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /** Geocode a venue's address `mapboxId` once, reusing the result per venue. */
  private async resolveVenueMapbox(venue: AtlasVenue): Promise<string> {
    const cached = this.venueMapbox.get(venue.legacyId)
    if (cached) return cached
    const id =
      (await geocodeRegion({
        name: venue.name?.trim() || venue.street?.trim() || '',
        level: 'center',
        latitude: venue.latitude,
        longitude: venue.longitude,
        countryCode: venue.countryCode,
      })) ?? MANUAL_LOCATION
    this.venueMapbox.set(venue.legacyId, id)
    return id
  }

  /**
   * Spread a resolved region location into Regions columns (manual → coords).
   * `Regions.mapboxId` is unique, so a manual node can't keep the bare shared
   * `'manual'` sentinel — it gets a unique `manual-<seed>` id keyed on the
   * region's natural key (`level:legacyId`) so re-imports stay idempotent.
   */
  private locationData(
    location: { mapboxId: string; manual: boolean } & Record<string, unknown>,
    manualSeed: string,
  ): Record<string, unknown> {
    if (!location.manual) return { mapboxId: location.mapboxId }
    return {
      mapboxId: makeManualMapboxId(manualSeed),
      latitude: location.latitude ?? undefined,
      longitude: location.longitude ?? undefined,
      radius: location.radius ?? undefined,
    }
  }

  /** Region eventDefaults group (only set when something populates it). */
  private buildEventDefaults(
    languageCode: string | null | undefined,
    timeZone: string | null | undefined,
  ): Record<string, unknown> | undefined {
    const language = mapLanguageCode(languageCode)
    const defaults: Record<string, unknown> = {}
    if (language) defaults.language = language
    if (timeZone) defaults.timeZone = [timeZone]
    return Object.keys(defaults).length > 0 ? defaults : undefined
  }

  /** Compute a manager's notification prefs from the in-memory Atlas record. */
  private managerPrefs(
    managerLegacyId: number | null,
    managersByLegacyId: Map<number, AtlasManager>,
  ): NotificationPreferences {
    const manager = managerLegacyId != null ? managersByLegacyId.get(managerLegacyId) : undefined
    return mapNotificationPreferences(manager?.notifications, manager?.contactMethod)
  }

  /** Map Atlas registration-question flags to the checkbox group (best effort). */
  private mapRegistrationQuestions(event: AtlasEvent): Record<string, boolean> | undefined {
    const result: Record<string, boolean> = {}
    for (const flag of event.registrationQuestions ?? []) {
      const target = REGISTRATION_QUESTION_MAP[flag]
      if (target) result[target] = true
      else this.addWarning(`Event #${event.legacyId}: unmapped registration question "${flag}"`)
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
}

/** A throwaway strong password for an imported (passwordless) manager. */
function randomPassword(): string {
  return `Atlas-${randomUUID()}`
}

/** Whether a value is a #RGB / #RRGGBB hex color (what `colorField` accepts). */
function isHexColor(value: string | null | undefined): boolean {
  return !!value && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value)
}

export default AtlasImporter
