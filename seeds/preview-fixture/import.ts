/**
 * The preview fixture: the made-up content CI puts into every preview of this
 * repo, so a reviewer opens a change's pages on data rather than empty lists.
 *
 * A Railway PR preview forks service configuration and variables, never volume
 * data, so it boots with one row anywhere — the admin `previewAdmin` reconciles.
 * Before this existed the only thing a change could do about that was admit it
 * in a line of its own description (sydevs/SahajCloud#1073), and three defects
 * in #874's pages were found within a minute of filling them by hand.
 *
 * ⚠ **Everything it writes is invented, and every address ends in the reserved
 * `.invalid` TLD.** That promise is about what CI puts there and nothing else: a
 * reviewer may still point the `atlas` script at a preview and load real
 * coordinators, which this says nothing about.
 *
 * Idempotent through `BaseImporter.upsert`, which is the whole of it — running
 * the fixture twice leaves the same row counts.
 *
 * Usage:
 *   pnpm seed preview-fixture --dry-run
 *   pnpm seed preview-fixture
 */
import * as path from 'path'

import { SUBMISSION_MACHINE } from '@/collections/UserSubmissions/machine'
import { makeManualMapboxId } from '@/lib/mapbox/manualLocation'
import { withActor } from '@/lib/stateMachine/actor'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

import { BaseImporter, type BaseImportOptions } from '../lib'
import { PREVIEW_FIXTURE_DATA_FILE } from '../lib/dataFiles'

/** The `.json` beside this file, keyed the way the importer reads it. */
interface Fixture {
  contacts: { message: string; status: string; uuid: string }[]
  events: {
    description: string
    endTime: string
    firstDate: string
    key: string
    manager: string
    region: string
    title: string
    weekdays: string[]
  }[]
  form: { recipient: string; title: string }
  managers: { email: string; key: string; name: string; type: string }[]
  regions: {
    key: string
    latitude: number
    level: string
    longitude: number
    managers?: string[]
    name: string
    parent: null | string
    radius: number
    slug: string
    subtitle?: string
  }[]
  registrations: { event: string; status: string; user: string; uuid: string }[]
  users: { email: string; key: string; name: string }[]
}

/**
 * Every timestamp the fixture writes sits in one zone, and it must be one both
 * configurations hold: production configures the full IANA set, while the
 * integration lane's schema push bakes in Payload's narrow 47-zone default, so
 * an Atlas-style zone fails there with an enum error (`seeds/atlas/AGENTS.md`).
 */
const TIMEZONE = 'Europe/London'

type Id = number | string

export class PreviewFixtureImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Preview fixture'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/preview-fixture')

  private readonly events = new Map<string, Id>()
  private formId: Id | undefined
  private readonly managers = new Map<string, Id>()
  private readonly regions = new Map<string, Id>()
  private readonly users = new Map<string, Id>()

  protected async setup(): Promise<void> {
    // ⚠ **Never production, whatever credential the caller holds.** The seed
    // route's only gate is "an admin manager", and this script is in
    // `VALID_SCRIPTS` like every other — so an operator with a production
    // `ADMIN_TOKEN` could write two `_verified` managers holding real region
    // and event grants into the live site. They could not sign in (every
    // address is `.invalid`), but they would be real rows. The test lanes name
    // no deployment, so they are unaffected.
    if (isProductionDeployment()) {
      throw new Error(
        'The preview fixture refuses to run against production: it writes manager accounts ' +
          'holding real region and event grants. Target a preview instead.',
      )
    }

    await this.preloadCollection('managers', 'email')
    await this.preloadCollection('regions', 'mapboxId')
    await this.preloadCollection('forms', 'title')
    await this.preloadCollection('events', 'title')
    await this.preloadCollection('users', 'email')
    await this.preloadCollection('user-submissions', 'uuid')
  }

  protected async import(): Promise<void> {
    const data = await this.load()

    // Managers first: a region lists them and an event names one, and both are
    // what the sign-in picker shows a reviewer to choose between.
    await this.importManagers(data)
    await this.importRegions(data)
    await this.importForm(data)
    await this.importEvents(data)
    await this.importUsers(data)
    await this.importSubmissions(data)
  }

  private async load(): Promise<Fixture> {
    const { loadJsonData } = await import('../lib/dataLoader')
    return loadJsonData<Fixture>({
      localPath: PREVIEW_FIXTURE_DATA_FILE,
      inlineContent: this.options.inlineData?.[PREVIEW_FIXTURE_DATA_FILE],
    })
  }

  private async importManagers(data: Fixture): Promise<void> {
    await this.logger.info('\n=== Managers ===')
    for (const [index, manager] of data.managers.entries()) {
      // ⚠ `_verified: true` is not optional. `Managers.auth.verify` is
      // configured and the JWT strategy yields no user while that flag is
      // false, so an unaccepted manager is offered by the picker and signs
      // nobody in — `issueMagicLink` refuses rather than minting a token that
      // authenticates nobody.
      const result = await this.upsert<{ id: Id }>(
        'managers',
        { email: { equals: manager.email } },
        { _verified: true, email: manager.email, name: manager.name, type: manager.type },
        { current: index + 1, identifier: manager.email, total: data.managers.length },
      )
      this.managers.set(manager.key, result.doc.id)
    }
  }

  private async importRegions(data: Fixture): Promise<void> {
    await this.logger.info('\n=== Regions ===')
    for (const [index, region] of data.regions.entries()) {
      // ⚠ A warning, never an error, and never a `continue`. A dry run's
      // `upsert` returns the data it was given rather than a document, so no id
      // is mapped and every child region's parent is unresolved — reported as
      // an error, that made `--dry-run` exit 1 with two defects that do not
      // exist. `seeds/atlas/import.ts` warns here for the same reason.
      const parentId = region.parent ? this.regions.get(region.parent) : undefined
      if (region.parent && parentId == null) {
        this.addWarning(`Region "${region.name}": parent ${region.parent} unresolved`)
      }

      const result = await this.upsert<{ id: Id }>(
        'regions',
        { mapboxId: { equals: makeManualMapboxId(`preview-fixture-${region.key}`) } },
        {
          latitude: region.latitude,
          level: region.level,
          longitude: region.longitude,
          managers: region.managers
            ?.map((key) => this.managers.get(key))
            .filter((id) => id != null),
          mapboxId: makeManualMapboxId(`preview-fixture-${region.key}`),
          name: region.name,
          parent: parentId,
          radius: region.radius,
          slug: region.slug,
          // Pin the fixture's slug. `slugField`'s generateSlug hook would
          // otherwise rewrite it to slugify(name) on every update, and the
          // country's is deliberately an ISO-shaped code the widget reads.
          generateSlug: false,
          subtitle: region.subtitle,
        },
        {
          current: index + 1,
          identifier: `${region.level}:${region.name}`,
          total: data.regions.length,
        },
      )
      this.regions.set(region.key, result.doc.id)
    }
  }

  private async importForm(data: Fixture): Promise<void> {
    await this.logger.info('\n=== Contact form ===')
    // The five contact messages need one, because `user-submissions` requires a
    // form for every form-backed intake, and `recipient` is what decides which
    // manager reads them (`managerSubmissionScope`).
    const result = await this.upsert<{ id: Id }>(
      'forms',
      { title: { equals: data.form.title } },
      {
        actionType: 'contact',
        confirmationType: 'redirect',
        fields: [
          { blockType: 'email', label: 'Email', name: 'email' },
          { blockType: 'textarea', label: 'Message', name: 'message' },
        ],
        recipient: this.managers.get(data.form.recipient),
        redirect: { url: '/thanks' },
        title: data.form.title,
      },
      { identifier: data.form.title },
    )
    this.formId = result.doc.id
  }

  private async importEvents(data: Fixture): Promise<void> {
    await this.logger.info('\n=== Events ===')
    for (const [index, event] of data.events.entries()) {
      const result = await this.upsert<{ id: Id }>(
        'events',
        { title: { equals: event.title } },
        {
          _status: 'published',
          description: event.description,
          eventType: 'offline',
          // A real weekly schedule, not `inactive: true`: an event with no
          // schedule shows nothing on the map, the calendar or the listing,
          // which are the pages most changes here are about.
          inactive: false,
          languages: ['en'],
          manager: this.managers.get(event.manager),
          region: this.regions.get(event.region),
          registrationMode: 'sahaj-atlas',
          schedule: {
            endTime: event.endTime,
            firstDate: event.firstDate,
            firstDate_tz: TIMEZONE,
            interval: 1,
            recurrenceType: 'WEEKLY',
            weekdays: event.weekdays,
          },
          title: event.title,
          verificationStage: 'verified',
        },
        { current: index + 1, identifier: event.title, total: data.events.length },
      )
      this.events.set(event.key, result.doc.id)
    }
  }

  private async importUsers(data: Fixture): Promise<void> {
    await this.logger.info('\n=== Registrants ===')
    for (const [index, user] of data.users.entries()) {
      const result = await this.upsert<{ id: Id }>(
        'users',
        { email: { equals: user.email } },
        { email: user.email, name: user.name },
        { current: index + 1, identifier: user.email, total: data.users.length },
      )
      this.users.set(user.key, result.doc.id)
    }
  }

  /**
   * The registrations and contact messages, in every status.
   *
   * ⚠ **A `pending` row cannot be created `pending`, and the mechanism is not
   * what it looks like.** A created-`pending` row queues screening; a screening
   * **pass leaves it `pending`**, and then delivery writes `accepted`, because
   * `registration`'s `deliveredStatus` is `accepted`. Both guards are keyed on
   * the status at **create** time, so every row is authored with a terminal
   * status — which skips screening outright — and a `pending` one is reached by
   * a second, update pass, since an update queues nothing.
   *
   * `EXPECTED_COUNTS` therefore states a `countWhere` floor for the surviving
   * `pending` registration rather than trusting the count.
   */
  private async importSubmissions(data: Fixture): Promise<void> {
    await this.logger.info('\n=== Registrations and messages ===')

    const rows = [
      ...data.registrations.map((row) => ({
        data: {
          event: this.events.get(row.event),
          type: 'registration',
          user: this.users.get(row.user),
          uuid: row.uuid,
        },
        status: row.status,
      })),
      ...data.contacts.map((row) => ({
        data: {
          form: this.formId,
          submissionData: [{ field: 'message', value: row.message }],
          type: 'contact',
          uuid: row.uuid,
        },
        status: row.status,
      })),
    ]

    for (const [index, row] of rows.entries()) {
      const created = await this.upsert<{ id: Id }>(
        'user-submissions',
        { uuid: { equals: row.data.uuid } },
        // `accepted` stands in for `pending` at create, so the row skips
        // screening; the update below is what makes it pending.
        { ...row.data, status: row.status === 'pending' ? 'accepted' : row.status },
        {
          current: index + 1,
          identifier: row.data.uuid,
          total: rows.length,
          // ⚠ The fixture file decides the status, and the lifecycle guard
          // refuses a status change naming no writer — which a re-run of this
          // seed makes, since it writes each row's authored status back.
          context: withActor(undefined, SUBMISSION_MACHINE, 'import'),
        },
      )

      // ⚠ Guarded on the id, not on `dryRun` alone. `upsert` also returns the
      // bare data — with no id — on its error and slug-collision paths, and an
      // `update` with no id routes to Payload's BULK operation, which throws
      // and takes the whole run down. `upsert`'s contract is that an import
      // continues past one failed row.
      if (row.status !== 'pending' || created.doc?.id == null) continue
      await this.payload.update({
        collection: 'user-submissions',
        id: created.doc.id,
        data: { status: 'pending' },
        overrideAccess: true,
        context: withActor(undefined, SUBMISSION_MACHINE, 'import'),
      })
    }
  }
}

export default PreviewFixtureImporter
