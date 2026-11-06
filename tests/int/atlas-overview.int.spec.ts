import type { Payload, PayloadRequest } from 'payload'

import { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAtlasAdminData } from '@/components/admin/Dashboard/AtlasAdmin/data'
import { getAtlasManagerData } from '@/components/admin/Dashboard/AtlasManager/data'
import { getAtlasRegionData } from '@/components/admin/Dashboard/AtlasRegion/data'
import type { DashboardQuery } from '@/components/admin/Dashboard/shared/model'
import { countEventsByRegion, RecordAtlasSnapshot } from '@/jobs/AtlasSnapshot/RecordAtlasSnapshot'

import { storeInvalidEvent } from '../utils/storeInvalidEvent'
import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const QUERY: DashboardQuery = { filter: 'all', limit: 50, page: 1, region: 0, section: 'items' }

const query_ = (overrides: Partial<DashboardQuery> = {}): DashboardQuery => ({
  ...QUERY,
  ...overrides,
})

/** ⚠ Every loader runs with `overrideAccess: false`, so a passing case is one the reader's access admits. */
describe('Atlas overview', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  type AuthManager = Awaited<ReturnType<typeof testData.authUser>>
  let regionManager: AuthManager
  let programManager: AuthManager
  let admin: Awaited<ReturnType<typeof createTestEnvironment>>['adminUser']
  let countryId: number
  let managedCityId: number
  let orphanCityId: number

  const systemReq = () =>
    ({
      context: { skipWriteGuard: true },
      headers: new Headers(),
      payload,
    }) as unknown as PayloadRequest

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    const listed = await testData.createManager(payload, {
      currentProject: 'sahaj-atlas',
      roles: [],
      type: 'manager',
    })
    const assigned = await testData.createManager(payload, {
      currentProject: 'sahaj-atlas',
      roles: [],
      type: 'manager',
    })

    const country = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        level: 'country',
        managers: [listed.id],
        mapboxId: 'country.overview',
        name: 'Overview Country',
      }),
    })
    countryId = country.id
    const managedCity = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        level: 'city',
        mapboxId: 'city.overview-managed',
        name: 'Managed City',
        parent: country.id,
      }),
    })
    managedCityId = managedCity.id
    // Nobody manages this city or anything above it, so it is the admin's.
    const orphanCountry = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        level: 'country',
        mapboxId: 'country.overview-orphan',
        name: 'Orphan Country',
      }),
    })
    const orphanCity = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        level: 'city',
        mapboxId: 'city.overview-orphan',
        name: 'Orphan City',
        parent: orphanCountry.id,
      }),
    })
    orphanCityId = orphanCity.id

    // The program manager's own listing, inside the region manager's subtree.
    const own = await testData.createEvent(payload, {
      manager: assigned.id,
      region: managedCity.id,
      title: 'Assigned program',
    })
    // ⚠ Published: `stampEventQuality` skips a draft, so only a published fixture has recommendations.
    await payload.update({
      collection: 'events',
      context: { skipVerifyHook: true },
      data: { _status: 'published', verificationStage: 'urgent' },
      id: own.id,
    })

    // Another manager's listing, far enough up the ladder for a region
    // manager to be pulled into.
    const other = await testData.createManager(payload, { roles: [], type: 'manager' })
    const escalated = await testData.createEvent(payload, {
      manager: other.id,
      region: managedCity.id,
      title: 'Escalated elsewhere',
    })
    await payload.update({
      collection: 'events',
      context: { skipVerifyHook: true },
      data: { _status: 'published', verificationStage: 'escalated' },
      id: escalated.id,
    })

    // Unadopted, in the subtree.
    await testData.createEvent(payload, {
      manager: null,
      region: managedCity.id,
      title: 'Unadopted listing',
      verificationStage: 'unverified',
    })

    // Verified and quiet, in the subtree: on nobody's list but "all".
    await testData.createEvent(payload, {
      manager: other.id,
      region: managedCity.id,
      title: 'Quiet listing',
    })

    // Escalated, with nobody above it at all — the admin's own row.
    const orphanEvent = await testData.createEvent(payload, {
      manager: other.id,
      region: orphanCity.id,
      title: 'Orphan escalated',
    })
    await payload.update({
      collection: 'events',
      context: { skipVerifyHook: true },
      data: { _status: 'published', verificationStage: 'urgent' },
      id: orphanEvent.id,
    })

    const secondCity = await payload.create({
      collection: 'regions',
      data: createData<'regions'>({
        level: 'city',
        mapboxId: 'city.overview-second',
        name: 'Second City',
        parent: country.id,
      }),
    })
    const regionOwn = await testData.createEvent(payload, {
      manager: listed.id,
      region: secondCity.id,
      title: 'Region manager own program',
    })
    await payload.update({
      collection: 'events',
      context: { skipVerifyHook: true },
      data: { _status: 'published' },
      id: regionOwn.id,
    })

    regionManager = await testData.authUser(payload, listed)
    programManager = await testData.authUser(payload, assigned)
  })
  afterAll(async () => cleanup())

  const reqAs = (user: AuthManager | typeof admin) =>
    createLocalReq({ locale: 'en', user: { ...user, collection: 'managers' } }, payload)

  const titles = (rows: { title: string }[]) => rows.map((row) => row.title).sort()

  describe('a program manager', () => {
    it('sees every event they manage, and nothing of the region', async () => {
      const data = await getAtlasManagerData(await reqAs(programManager), QUERY)
      expect(titles(data.items.rows.docs)).toEqual(['Assigned program'])
      // Overdue places it; the recommendations ride along on the same row.
      expect(data.items.rows.docs[0]!.statuses.map((status) => status.key)).toEqual([
        'overdue',
        'recommendations',
      ])
    })

    /** Recommendations are advice, so they never move the meter. */
    it('counts the overdue listing against progress and the recommendations against nothing', async () => {
      const data = await getAtlasManagerData(await reqAs(programManager), QUERY)
      expect(data.items.progress).toMatchObject({ open: 1, total: 1 })
      const recommendations = await getAtlasManagerData(
        await reqAs(programManager),
        query_({ filter: 'recommendations' }),
      )
      expect(titles(recommendations.items.rows.docs)).toEqual(['Assigned program'])
    })
  })

  /** ⚠ A join carries at most its own `limit` (default 10), so every owned set comes from a query. */
  describe('a manager with more events than a join carries', () => {
    it('sees all of them', async () => {
      const busy = await testData.createManager(payload, {
        currentProject: 'sahaj-atlas',
        roles: [],
        type: 'manager',
      })
      const city = await payload.create({
        collection: 'regions',
        data: createData<'regions'>({
          level: 'city',
          mapboxId: 'city.overview-busy',
          name: 'Busy City',
          parent: countryId,
        }),
      })
      for (let index = 0; index < 13; index += 1) {
        await testData.createEvent(payload, {
          manager: busy.id,
          region: city.id,
          title: `Busy program ${index}`,
        })
      }
      const user = await testData.authUser(payload, busy)
      const data = await getAtlasManagerData(await reqAs(user), query_({ limit: 100 }))
      expect(data.items.counts.all).toBe(13)
      expect(data.items.rows.docs).toHaveLength(13)
    })
  })

  describe('a region manager', () => {
    /** The home, with the refusal narrowed away; the refusal has its own case. */
    const load = async (query: Partial<DashboardQuery> = {}) => {
      const data = await getAtlasRegionData(await reqAs(regionManager), query_(query))
      if (!data.allowed) throw new Error('expected the region home, not the refusal')
      return data
    }

    it('sees escalated listings, unadopted ones, and their own — not a quiet one', async () => {
      const data = await load()
      expect(titles(data.items.rows.docs)).toEqual([
        'Assigned program',
        'Escalated elsewhere',
        'Region manager own program',
        'Unadopted listing',
      ])
    })

    /** ⚠ A region manager sees recommendations on their own events only. */
    it("shows recommendations on nobody else's events", async () => {
      const data = await load()
      const mine = data.items.rows.docs.find((row) => row.title === 'Region manager own program')
      const theirs = data.items.rows.docs.find((row) => row.title === 'Escalated elsewhere')
      expect(mine?.statuses.map((status) => status.key)).toContain('recommendations')
      expect(theirs?.statuses.map((status) => status.key)).not.toContain('recommendations')
      // The program manager still sees them on their own listing.
      const asProgram = await getAtlasManagerData(await reqAs(programManager), QUERY)
      expect(asProgram.items.rows.docs[0]!.statuses.map((status) => status.key)).toContain(
        'recommendations',
      )
    })

    it('offers "Your programs" for the events they manage themselves', async () => {
      const data = await load({ filter: 'mine' })
      expect(titles(data.items.rows.docs)).toEqual(['Region manager own program'])
      expect(data.items.counts.mine).toBe(1)
    })

    it('scopes to one region of its own subtree', async () => {
      const data = await load({ region: managedCityId })
      expect(data.description).toMatch(/^Managed City · \d+ programs? · \d+ managers?$/)
      expect(data.breadcrumbs.map((crumb) => crumb.label)).toEqual([
        'Your regions',
        'Overview Country',
        'Managed City',
      ])
    })

    /** ⚠ `?region=` is a URL anyone can type, so the refusal carries no data at all. */
    it('refuses a region outside its subtree, and reads nothing from it', async () => {
      const data = await getAtlasRegionData(
        await reqAs(regionManager),
        query_({ region: orphanCityId }),
      )
      expect(data.allowed).toBe(false)
      expect(Object.keys(data)).toEqual(['allowed'])
    })

    it('lists its subtree in the regions overview, with the scoped region as the header', async () => {
      const data = await load({ region: countryId, section: 'regions' })
      const names = data.regions.docs.map((row) => row.name)
      expect(names).toContain('Managed City')
      expect(names).not.toContain('Overview Country')
      const city = data.regions.docs.find((row) => row.name === 'Managed City')!
      // The city lists nobody itself; its cover comes from the country above.
      expect(city).toMatchObject({ managers: 0, overdue: 2, unverified: 1 })
      // Healthy = managed and not overdue, over everything not finished: the
      // quiet listing alone, out of four.
      expect(city.healthy).toBe(25)
    })
  })

  describe('an admin', () => {
    const load = async (query: Partial<DashboardQuery> = {}) =>
      getAtlasAdminData(await reqAs(admin), query_(query))

    /** ⚠ Only what nobody below them covers. */
    it('sees only the listings with no region manager above them', async () => {
      const data = await load()
      expect(titles(data.items.rows.docs)).toEqual(['Orphan escalated'])
      expect(data.items.progress).toBeNull()
    })

    it('sees the new-class proposals routed nowhere or under no manager, and no others', async () => {
      const propose = (name: string, routingRegion: null | number) =>
        payload.create({
          collection: 'user-submissions',
          data: {
            proposed: { eventType: 'offline' },
            routingRegion,
            senderEmail: 'proposer@example.com',
            submissionData: [{ field: 'name', value: name }],
            type: 'proposal',
          } as never,
          overrideAccess: true,
          req: systemReq(),
        })
      await propose('Proposed nowhere', null)
      await propose('Proposed in the orphan city', orphanCityId)
      await propose('Proposed in the managed city', managedCityId)

      const adminTitles = titles((await load()).items.rows.docs)
      expect(adminTitles).toEqual(
        expect.arrayContaining(['Proposed nowhere', 'Proposed in the orphan city']),
      )
      expect(adminTitles).not.toContain('Proposed in the managed city')

      const region = await getAtlasRegionData(await reqAs(regionManager), QUERY)
      if (!region.allowed) throw new Error('expected the region home')
      expect(titles(region.items.rows.docs)).toContain('Proposed in the managed city')
    })

    /** Live tiles count what a snapshot counts, so an event with no region counts on neither. */
    it('totals the Countries rows in the Total programs tile, leaving out an event with no region', async () => {
      const stray = await testData.createEvent(payload, {
        manager: admin.id,
        region: orphanCityId,
        title: 'Stray listing',
      })
      await storeInvalidEvent(payload, stray.id, { region: null })

      const data = await load({ limit: 100, section: 'regions' })
      const total = data.statistics.analytics.find((tile) => tile.key === 'programs')!
      expect(total.value).toBe(data.countries.docs.reduce((sum, row) => sum + row.programs, 0))
    })

    it('offers to add a region manager rather than to verify', async () => {
      const data = await load()
      const row = data.items.rows.docs[0]!
      expect(row.statuses[0]!.line).toMatch(/· no region manager$/)
      expect(row.action).toMatchObject({
        href: expect.stringContaining('/admin/collections/regions/'),
        label: 'Add region manager',
      })
    })

    it('lists countries only, in the countries overview', async () => {
      const data = await load({ section: 'regions' })
      const levels = new Set(data.countries.docs.map((row) => row.level))
      expect([...levels]).toEqual(['country'])
      expect(data.countries.docs.map((row) => row.name)).toContain('Orphan Country')
    })

    it('lists a registration the spam check refused, and loses it once it is settled', async () => {
      const refused = await payload.create({
        collection: 'user-submissions',
        data: {
          senderEmail: 'spammer@example.com',
          status: 'spam',
          submissionData: [{ field: 'name', value: 'Nadia Haddad' }],
          type: 'registration',
        } as never,
        overrideAccess: true,
        req: systemReq(),
      })
      expect(titles((await load()).items.rows.docs)).toContain('Nadia Haddad')
      const { spamSignups } = await load()
      expect(spamSignups?.text).toMatch(/^\d+ sign-ups? filed as spam in the last 7 days$/)
      expect(decodeURIComponent(spamSignups!.href)).toContain(
        '/admin/collections/user-submissions?where[and][0][type][equals]=registration&where[and][1][status][equals]=spam',
      )

      await payload.update({
        collection: 'user-submissions',
        data: { status: 'confirmed_spam' } as never,
        id: refused.id,
        overrideAccess: true,
        req: systemReq(),
      })
      expect(titles((await load()).items.rows.docs)).not.toContain('Nadia Haddad')

      // Releasing it takes it off the list too: `spam` is what the list selects.
      await payload.update({
        collection: 'user-submissions',
        data: { status: 'pending' } as never,
        id: refused.id,
        overrideAccess: true,
        req: systemReq(),
      })
      expect(titles((await load()).items.rows.docs)).not.toContain('Nadia Haddad')
    })

    /** ⚠ A tile with no snapshot shows no change line, never "+0". */
    it('shows no change line until a snapshot 30 days old exists', async () => {
      const before = await load()
      for (const tile of [...before.statistics.health, ...before.statistics.analytics]) {
        if (tile.key === 'registrations') continue // dated rows, not a snapshot
        expect(tile.change).toBeNull()
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      await runTaskHandler(RecordAtlasSnapshot, {
        context: { now: thirtyDaysAgo },
        payload,
      })
      // A snapshot of today's map: a change of zero, which is still a line.
      const after = await load()
      const verified = after.statistics.health.find((tile) => tile.key === 'verified')!
      expect(verified.change).toBe(0)
    })

    it('prunes snapshots older than 45 days, and keeps the rest', async () => {
      const day = 24 * 60 * 60 * 1000
      const now = new Date()
      const key = (daysAgo: number) =>
        `atlas-snapshot:${new Date(now.getTime() - daysAgo * day).toISOString().slice(0, 10)}`
      await payload.kv.set(key(46), {})
      await payload.kv.set(key(44), {})

      await runTaskHandler(RecordAtlasSnapshot, { context: { now }, payload })
      expect(await payload.kv.has(key(46))).toBe(false)
      expect(await payload.kv.has(key(44))).toBe(true)
      expect(await payload.kv.has(key(0))).toBe(true)
    })

    it('counts each region only for its own events, so a rollup cannot double count', async () => {
      const counts = await countEventsByRegion(await reqAs(admin))
      expect(counts[String(countryId)]).toBeUndefined()
      expect(Object.values(counts[String(managedCityId)] ?? {}).reduce((a, b) => a + b, 0)).toBe(4)
    })
  })
})
