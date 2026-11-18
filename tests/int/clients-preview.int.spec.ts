/**
 * The Atlas tab's live preview (#1110): where the panel points, and the sample
 * email beside the logo.
 *
 * ⚠ **Never `null` from `livePreview.url`.** Payload reads a falsy URL as
 * "close the panel" and persists that as the editor's preference for the whole
 * collection, so every refusal has to be the explanation page instead.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Client, Event, Manager } from '@/payload-types'

import { createRestClientAs, type RestClient } from '../utils/restRequest'
import { type FixtureOverrides, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Clients live preview', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminManager: Manager
  let listedManager: Manager
  let outsideManager: Manager
  let atlasService: Client
  let worldwideService: Client
  let plainService: Client
  let emptyService: Client
  let finishedService: Client
  let regionId: number
  let listedRest: RestClient
  let outsideRest: RestClient

  const previewUrl = async (client: Client): Promise<string> => {
    const url = payload.collections.clients.config.admin.livePreview?.url
    if (typeof url !== 'function') throw new Error('clients declares no livePreview.url')

    return String(
      await url({
        collectionConfig: payload.collections.clients.config,
        data: client as unknown as Record<string, unknown>,
        locale: { code: 'en', label: 'English' },
        payload,
        req: { context: {}, payload } as unknown as PayloadRequest,
      } as never),
    )
  }

  /**
   * A country holding one published class, and its id.
   *
   * The class goes on a city beneath it, never on the country itself: that is
   * what `events.region` accepts, and it is why the panel's emptiness check
   * walks the subtree.
   */
  const countryWithClass = async (
    slug: string,
    overrides: FixtureOverrides<Event> = {},
  ): Promise<number> => {
    const node = (level: string, nodeSlug: string, parent?: number) =>
      testData.createRegionNode(payload, {
        prefix: 'clients-preview',
        slug: nodeSlug,
        level,
        parent,
      })

    const country = await node('country', slug)
    await testData.createEvent(payload, {
      _status: 'published',
      manager: adminManager.id,
      region: await node('city', `${slug}-city`, country),
      title: `${slug} class`,
      ...overrides,
    })

    return country
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminManager = env.adminUser

    listedManager = await testData.createManager(payload, { name: 'Listed', roles: [] })
    outsideManager = await testData.createManager(payload, { name: 'Outside', roles: [] })
    listedRest = await createRestClientAs(env, listedManager)
    outsideRest = await createRestClientAs(env, outsideManager)

    // The panel opens on the map only where there is something to draw, so a
    // service that expects one needs a published class in its region.
    regionId = await countryWithClass('previewland')

    atlasService = await testData.createClient(payload, adminManager.id, {
      apiKey: 'clients-preview-atlas-key',
      label: 'Atlas Service',
      managers: [listedManager.id],
      region: regionId,
      roles: ['sahaj-atlas-client'],
    })
    emptyService = await testData.createClient(payload, adminManager.id, {
      apiKey: 'clients-preview-empty-key',
      label: 'Empty Region Service',
      region: await testData.createRegionNode(payload, {
        prefix: 'clients-preview',
        slug: 'emptyland',
        level: 'country',
      }),
      roles: ['sahaj-atlas-client'],
    })
    finishedService = await testData.createClient(payload, adminManager.id, {
      apiKey: 'clients-preview-finished-key',
      label: 'Finished Classes Service',
      region: await countryWithClass('pastland', {
        eventType: 'online',
        repeats: 'once',
        onlineUrl: 'https://example.invalid/meet',
        registrationMode: 'sahaj-atlas',
        schedule: { firstDate: '2020-05-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
      }),
      roles: ['sahaj-atlas-client'],
    })
    worldwideService = await testData.createClient(payload, adminManager.id, {
      apiKey: 'clients-preview-worldwide-key',
      label: 'Worldwide Service',
      roles: ['sahaj-atlas-client'],
    })
    plainService = await testData.createClient(payload, adminManager.id, {
      apiKey: 'clients-preview-plain-key',
      label: 'App Key',
      roles: ['wemeditate-web-client'],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('where the panel points', () => {
    it('opens an atlas service on its own region, in the clients scope', async () => {
      const url = new URL(await previewUrl(atlasService))

      expect(url.pathname).toBe('/previewland')
      expect(url.searchParams.get('scope')).toBe('clients')
      expect(url.searchParams.get('locale')).toBe('en')
    })

    it('opens a Worldwide service on the atlas root', async () => {
      const url = new URL(await previewUrl(worldwideService))

      expect(url.pathname).toBe('/')
      expect(url.searchParams.get('scope')).toBe('clients')
    })

    it('judges the root’s own emptiness when the region has no path', async () => {
      // A region whose slug chain cannot resolve has no page, so the panel
      // opens the atlas root — which draws every region. Asking the empty
      // subtree would refuse a preview that had plenty to show.
      const url = new URL(await previewUrl({ ...atlasService, region: 9_999_999 }))

      expect(url.pathname).toBe('/')
    })

    it('explains a region with nothing published in it', async () => {
      const url = await previewUrl(emptyService)

      expect(url).toContain('/live-preview-unavailable')
      expect(url).toContain('reason=no-classes')
    })

    it('counts a finished class as nothing to show', async () => {
      // It stays published so its own page keeps resolving (#603), and drops
      // off every feed the map draws from — so the region is empty here too.
      const url = await previewUrl(finishedService)

      expect(url).toContain('reason=no-classes')
    })

    it('explains itself for a service with no atlas, rather than closing', async () => {
      const url = await previewUrl(plainService)

      expect(url).toContain('/live-preview-unavailable')
      expect(url).toContain('reason=no-atlas-role')
    })
  })

  describe('the sample registrant email', () => {
    it('renders this service’s own colours for a listed manager', async () => {
      const { body, status } = await listedRest(`/api/clients/${atlasService.id}/email-preview`, {
        json: { color1: '#ffff00', color2: '#ffffe0', name: 'Preview Service' },
        method: 'POST',
      })

      expect(status).toBe(200)
      const html = (body as { html: string }).html
      expect(html).toContain('#ffff00')
      expect(html).toContain('Preview Service')
      // The text rule: white is unreadable on that gradient's light end.
      expect(html).toContain('color:#000000')
    })

    it('refuses a manager who does not manage the service', async () => {
      const { status } = await outsideRest(`/api/clients/${atlasService.id}/email-preview`, {
        json: { color1: '#ffff00' },
        method: 'POST',
      })

      expect(status).toBe(404)
    })
  })
})
