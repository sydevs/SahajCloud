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

import type { Client, Manager } from '@/payload-types'

import { createRestClientAs, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
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

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminManager = env.adminUser

    listedManager = await testData.createManager(payload, { name: 'Listed', roles: [] })
    outsideManager = await testData.createManager(payload, { name: 'Outside', roles: [] })
    listedRest = await createRestClientAs(env, listedManager)
    outsideRest = await createRestClientAs(env, outsideManager)

    regionId = await testData.createRegionNode(payload, {
      prefix: 'clients-preview',
      slug: 'previewland',
      level: 'country',
    })

    atlasService = await testData.createClient(payload, adminManager.id, {
      apiKey: 'clients-preview-atlas-key',
      label: 'Atlas Service',
      managers: [listedManager.id],
      region: regionId,
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
