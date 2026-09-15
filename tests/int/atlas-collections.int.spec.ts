import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Region } from '@/payload-types'


import { createData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Custom-logic coverage for the Phase 2 Atlas collections:
 * - Events `title` auto-fill from the street address (beforeChange hook)
 *
 * Built-in Payload behavior (joins, relationships, drafts, nested-docs
 * breadcrumbs) is intentionally not re-tested.
 */
describe('Atlas collections', () => {
  let payload: Payload
  let cleanup: (() => Promise<void>) | undefined
  let managerId: number

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    managerId = env.adminUser.id
  })

  afterAll(async () => {
    await cleanup?.()
  })

  describe('Regions slug', () => {
    it('auto-generates a transliterated slug from a non-Latin (Cyrillic) name', async () => {
      const region = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: createData<'regions'>({
          name: 'Москва',
          level: 'city',
          mapboxId: 'slug-cyrillic-city',
          managers: [managerId],
        }),
      })
      expect(region.slug).toBe('moskva')
    })
  })

  describe('Regions parent rules', () => {
    it('limits parents to one level up, except City (Country or Region)', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: createData<'regions'>({
          name: 'PR Country',
          level: 'country',
          mapboxId: 'pr.country',
          managers: [managerId],
        }),
      })
      const city = await payload.create({
        collection: 'regions',
        data: createData<'regions'>({
          name: 'PR City',
          level: 'city',
          mapboxId: 'pr.city',
          parent: country.id, // City may nest directly under a Country (Region optional)
          managers: [managerId],
        }),
      })

      // A Venue may only nest under a City — not directly under a Country.
      await expect(
        payload.create({
          collection: 'regions',
          data: createData<'regions'>({
            name: 'Bad Venue',
            level: 'venue',
            mapboxId: 'pr.venue.bad',
            parent: country.id,
            managers: [managerId],
          }),
        }),
      ).rejects.toThrow()
      const venueNode = await payload.create({
        collection: 'regions',
        data: createData<'regions'>({
          name: 'Good Venue',
          level: 'venue',
          mapboxId: 'pr.venue.good',
          parent: city.id,
          managers: [managerId],
        }),
      })
      expect(venueNode.id).toBeTruthy()

      // A Region may only nest under a Country — not a City.
      await expect(
        payload.create({
          collection: 'regions',
          data: createData<'regions'>({
            name: 'Bad Region',
            level: 'region',
            mapboxId: 'pr.region',
            parent: city.id,
            managers: [managerId],
          }),
        }),
      ).rejects.toThrow()
    })
  })

  describe('Events title auto-fill', () => {
    it('auto-fills an empty title from the first segment of the street address', async () => {
      const event = await payload.create({
        collection: 'events',
        // draft: the now-required title and schedule are validated only on
        // publish. The title beforeChange hook still runs and auto-fills from the street.
        draft: true,
        data: createData<'events'>({
          eventType: 'offline',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          address: { street: 'Hall A, Wing 2' },
        }),
      })

      expect(event.title).toBe('Meditation at Hall A')
    })

    it('keeps an explicitly provided title', async () => {
      const event = await payload.create({
        collection: 'events',
        draft: true,
        data: createData<'events'>({
          title: 'Diwali Special',
          eventType: 'offline',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          address: { street: 'Hall A' },
        }),
      })

      expect(event.title).toBe('Diwali Special')
    })

    it('leaves the title empty when there is no street to build from', async () => {
      const event = await payload.create({
        collection: 'events',
        draft: true,
        data: createData<'events'>({
          eventType: 'online',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
        }),
      })

      expect(event.title ?? null).toBeNull()
    })

    // The auto-fill names the time of day, so a blank title is preferable to a
    // hand-written generic one — it localizes, and a venue running several
    // classes a week stops producing identical titles. The slot comes from the
    // *local* start hour, via `schedule.firstDate_tz`.
    const autoTitle = (
      schedule: Record<string, unknown> | undefined,
      street = 'Beethovenstraße 12',
    ) =>
      payload
        .create({
          collection: 'events',
          draft: true,
          data: createData<'events'>({
            eventType: 'offline',
            registrationMode: 'sahaj-atlas',
            manager: managerId,
            address: { street },
            ...(schedule ? { schedule } : {}),
          }),
        })
        .then((e) => e.title)

    // `firstDate_tz` is a Postgres enum baked from the *test* config's timezone
    // list, which is Payload's narrow curated default — so these cases use zones
    // from that list (2024-09-06 is CEST, UTC+2). See the note in AGENTS.md
    // about the wider list the real config uses.
    it('names the time of day from the local start hour', async () => {
      await expect(
        autoTitle({ firstDate: '2024-09-06T07:00:00.000Z', firstDate_tz: 'Europe/Berlin' }),
      ).resolves.toBe('Morning Meditation at Beethovenstraße 12')
      await expect(
        autoTitle({ firstDate: '2024-09-06T12:00:00.000Z', firstDate_tz: 'Europe/Berlin' }),
      ).resolves.toBe('Afternoon Meditation at Beethovenstraße 12')
      await expect(
        autoTitle({ firstDate: '2024-09-06T17:30:00.000Z', firstDate_tz: 'Europe/Berlin' }),
      ).resolves.toBe('Evening Meditation at Beethovenstraße 12')
    })

    it('resolves the slot through the timezone, not the UTC hour', async () => {
      // 19:00 in Auckland is 07:00 UTC — a UTC read would call this a morning class.
      await expect(
        autoTitle({ firstDate: '2021-07-27T07:00:00.000Z', firstDate_tz: 'Pacific/Auckland' }),
      ).resolves.toBe('Evening Meditation at Beethovenstraße 12')
    })

    it('drops the time of day for a late start or no schedule at all', async () => {
      // An `inactive` listing has no schedule, and naming a time would be wrong.
      await expect(autoTitle(undefined)).resolves.toBe('Meditation at Beethovenstraße 12')
      await expect(
        autoTitle({ firstDate: '2024-09-06T21:30:00.000Z', firstDate_tz: 'Europe/Berlin' }),
      ).resolves.toBe('Meditation at Beethovenstraße 12')
    })

    it('re-runs the auto-fill when a title is explicitly cleared', async () => {
      // This is what lets the importer retire a title: it sends `title: ''`,
      // which falls through, where null/undefined would keep the old value.
      const created = await payload.create({
        collection: 'events',
        draft: true,
        data: createData<'events'>({
          title: 'Hand-written generic name',
          eventType: 'offline',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          address: { street: 'Hall A' },
          schedule: { firstDate: '2024-09-06T17:30:00.000Z', firstDate_tz: 'Europe/Berlin' },
        }),
      })
      expect(created.title).toBe('Hand-written generic name')

      const cleared = await payload.update({
        collection: 'events',
        id: created.id,
        draft: true,
        data: createData<'events'>({ title: '' }),
      })
      expect(cleared.title).toBe('Evening Meditation at Hall A')
    })
  })

  // #575 — the Live Preview tab appears iff the sanitized collection config
  // carries `admin.livePreview`.
  //
  // ⚠ **This block was rewritten when preview moved onto real paths.** It used
  // to call `url()` with a bare `{ data: { id: 42 } }` and assert a literal
  // `/preview?collection=…&id=…&secret=…`. Both halves are gone: the URL is now
  // the document's own map path, composed by the same builder `webPath`
  // publishes, and composing it reads the region tree — so the call needs a
  // real `req` and real rows. A spec that kept passing a bare object would
  // resolve no path and silently assert the "unavailable" page instead.
  describe('Live preview', () => {
    let country: Region

    beforeAll(async () => {
      country = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: createData<'regions'>({
          name: 'Preview Country',
          level: 'country',
          mapboxId: 'lp.country',
          managers: [managerId],
        }),
      })
    })

    /** A request as the admin panel makes one: real payload, one locale. */
    const req = () => ({ payload, locale: 'cs', context: {} }) as unknown as PayloadRequest

    const resolve = async (slug: 'events' | 'regions', data: Record<string, unknown>) => {
      const { livePreview } = payload.collections[slug].config.admin
      if (typeof livePreview?.url !== 'function') {
        throw new Error('expected livePreview.url to be a function')
      }
      return (await livePreview.url({
        data,
        locale: { code: 'cs' },
        req: req(),
      } as unknown as Parameters<typeof livePreview.url>[0])) as string
    }

    it('points a region at its own map path, with a token and the edited locale', async () => {
      const url = new URL(await resolve('regions', { id: country.id }))

      expect(url.origin).toBe(new URL(process.env.SAHAJATLAS_URL!).origin)
      expect(url.pathname).toBe(`/${country.slug}`)
      expect(url.searchParams.get('locale')).toBe('cs')
      expect(url.searchParams.get('live-preview')).toBeTruthy()
      // The retired shape, asserted absent so a revert is loud.
      expect(url.searchParams.get('secret')).toBeNull()
      expect(url.searchParams.get('collection')).toBeNull()
    })

    it('points an event at its region path plus its id', async () => {
      // No Event row: the composer reads `data.region` and `data.id` and
      // resolves the region tree, so a real event would only add a dozen
      // required fields to satisfy and nothing to the assertion.
      const url = new URL(await resolve('events', { id: 4242, region: country.id }))

      expect(url.pathname).toBe(`/${country.slug}/4242`)
      expect(url.searchParams.get('live-preview')).toBeTruthy()
      expect(url.searchParams.get('locale')).toBe('cs')
    })

    it('sends an event with no region to the explanation, never to null', async () => {
      // `region` is nominally required, but drafts skip validation — so a
      // region-less event draft is ordinary, and it is exactly the document an
      // editor is most likely to be previewing. Returning `null` here would
      // close the panel AND persist "live preview off" as their preference.
      const url = new URL(await resolve('events', { id: 999_999 }))

      expect(url.pathname).toBe('/live-preview-unavailable')
      expect(url.searchParams.get('reason')).toBe('no-region')
    })

    it.each(['events', 'regions'] as const)('%s keeps its phone breakpoint', (slug) => {
      expect(payload.collections[slug].config.admin.livePreview?.breakpoints).toEqual([
        { label: 'Mobile', name: 'mobile', width: 390, height: 844 },
      ])
    })
  })
})
