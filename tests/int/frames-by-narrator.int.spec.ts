import type { RestClient } from '../utils/restRequest'
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { framesByNarrator } from '@/collections/Frames/endpoints/byNarrator'
import type { Client, Frame, Narrator } from '@/payload-types'

import { createRestClientAs } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type EndpointResponse = { status: number; body: any }

type CallerUser = {
  id: number | string
  collection: string
  type?: string
  _status?: 'published' | 'draft'
  roles?: unknown
} | null

// Default authorized caller for the behavioral tests: an admin manager. The
// admin bypass grants `frames` read for both the auth gate and the
// `overrideAccess: false` reads. The `auth gate` suite passes explicit users
// (incl. `null`) to exercise the rejection paths.
const ADMIN_USER: CallerUser = { id: 0, collection: 'managers', type: 'admin' }

async function callEndpoint(
  payload: Payload,
  narratorId: string | undefined,
  user: CallerUser = ADMIN_USER,
): Promise<EndpointResponse> {
  const req = {
    payload,
    user,
    locale: 'en',
    routeParams: narratorId === undefined ? {} : { narratorId },
    headers: new Headers(),
    query: {},
    context: {},
  } as unknown as PayloadRequest

  const response = (await framesByNarrator.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('framesByNarrator endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let env: Awaited<ReturnType<typeof createTestEnvironment>>

  let maleNarrator: Narrator
  let femaleNarrator: Narrator

  let maleImage: Frame
  let maleVideo: Frame
  let femaleImage: Frame

  let framesClient: Client

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    maleNarrator = await testData.createNarrator(payload, {
      name: 'Male Narrator',
      gender: 'male',
    })
    femaleNarrator = await testData.createNarrator(payload, {
      name: 'Female Narrator',
      gender: 'female',
    })

    // Seed an image-frame and a video-frame for the male imageSet so the
    // mimeType sort has something to order, plus a female-imageSet frame
    // so the gender filter has something to exclude.
    maleImage = await testData.createFrame(payload, { imageSet: 'male', label: 'Male Image' })
    maleVideo = await testData.createFrame(
      payload,
      { imageSet: 'male', label: 'Male Video' },
      'video-30s.mp4',
    )
    femaleImage = await testData.createFrame(payload, {
      imageSet: 'female',
      label: 'Female Image',
    })

    // A published client whose role's project (wemeditate-app) includes frames.
    framesClient = (await testData.createClient(payload, env.adminUser.id, {
      name: 'Frames Reader Client',
      roles: ['wemeditate-app-client'],
    })) as Client
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('auth gate', () => {
    it('rejects unauthenticated callers with 403', async () => {
      const { status, body } = await callEndpoint(payload, String(maleNarrator.id), null)
      expect(status).toBe(403)
      expect(body).toEqual({
        errors: [{ message: 'You are not allowed to perform this action.' }],
      })
    })

    it('rejects authenticated callers whose project excludes frames with 403', async () => {
      // sahaj-atlas-client has no `frames` in its project → no read access.
      const { status } = await callEndpoint(payload, String(maleNarrator.id), {
        id: 1,
        collection: 'clients',
        _status: 'published',
        roles: ['sahaj-atlas-client'],
      })
      expect(status).toBe(403)
    })

    it('rejects clients with no roles with 403', async () => {
      const { status } = await callEndpoint(payload, String(maleNarrator.id), {
        id: 1,
        collection: 'clients',
        _status: 'published',
        roles: [],
      })
      expect(status).toBe(403)
    })

    it('allows a non-admin manager whose project includes frames (the FrameInserter caller)', async () => {
      // meditations-editor → wemeditate-app project → implicit `frames` read.
      const { status } = await callEndpoint(payload, String(maleNarrator.id), {
        id: 0,
        collection: 'managers',
        type: 'manager',
        roles: { en: ['meditations-editor'] },
      })
      expect(status).toBe(200)
    })

    it('allows a published client whose project includes frames', async () => {
      const { status, body } = await callEndpoint(payload, String(maleNarrator.id), {
        id: framesClient.id,
        collection: 'clients',
        _status: 'published',
        roles: ['wemeditate-app-client'],
      })
      expect(status).toBe(200)
      expect(Array.isArray(body.docs)).toBe(true)
    })
  })

  describe('access-controlled reads', () => {
    it('runs narrator + frames reads with overrideAccess: false and the trusted req', async () => {
      const findByIdSpy = vi.spyOn(payload, 'findByID')
      const findSpy = vi.spyOn(payload, 'find')
      try {
        const { status } = await callEndpoint(payload, String(maleNarrator.id))
        expect(status).toBe(200)

        const narratorCall = findByIdSpy.mock.calls.find(
          ([args]) => (args as { collection?: string }).collection === 'narrators',
        )
        expect(narratorCall).toBeDefined()
        expect((narratorCall![0] as { overrideAccess?: boolean }).overrideAccess).toBe(false)

        const framesCall = findSpy.mock.calls.find(
          ([args]) => (args as { collection?: string }).collection === 'frames',
        )
        expect(framesCall).toBeDefined()
        const framesArgs = framesCall![0] as {
          overrideAccess?: boolean
          req?: { context?: Record<string, unknown> }
        }
        expect(framesArgs.overrideAccess).toBe(false)
        // asTrustedReq marks the forwarded req so client query-param validation
        // (which requires `select`) is skipped for this server-built query.
        expect(framesArgs.req?.context?.['skipClientQueryValidation']).toBe(true)
      } finally {
        findByIdSpy.mockRestore()
        findSpy.mockRestore()
      }
    })
  })

  it('rejects an empty narratorId with 400', async () => {
    const { status, body } = await callEndpoint(payload, '')
    expect(status).toBe(400)
    expect(body.errors).toBeDefined()
  })

  it('returns 404 when the narrator does not exist', async () => {
    const { status, body } = await callEndpoint(payload, '999999')
    expect(status).toBe(404)
    expect(body.errors?.[0]?.message).toBe('Narrator not found')
  })

  it('returns only frames whose imageSet matches the narrator gender', async () => {
    const { status, body } = await callEndpoint(payload, String(maleNarrator.id))
    expect(status).toBe(200)

    const ids = (body.docs as Frame[]).map((d) => d.id)
    expect(ids).toContain(maleImage.id)
    expect(ids).toContain(maleVideo.id)
    expect(ids).not.toContain(femaleImage.id)
  })

  it('sorts results by mimeType so images come before videos', async () => {
    const { body } = await callEndpoint(payload, String(maleNarrator.id))
    const docs = body.docs as Frame[]

    const imageIdx = docs.findIndex((d) => d.id === maleImage.id)
    const videoIdx = docs.findIndex((d) => d.id === maleVideo.id)
    // image/jpeg sorts before video/mp4 alphabetically.
    expect(imageIdx).toBeGreaterThanOrEqual(0)
    expect(videoIdx).toBeGreaterThanOrEqual(0)
    expect(imageIdx).toBeLessThan(videoIdx)
  })

  it('hydrates subtleSystemNode at depth 1 when present', async () => {
    const node = await testData.createSubtleSystemNode(payload, {}, { slug: 'anahat' })
    await testData.createFrame(payload, {
      imageSet: 'female',
      label: 'Female Image With Node',
      subtleSystemNode: node.id,
    })

    const { body } = await callEndpoint(payload, String(femaleNarrator.id))
    const docWithNode = (body.docs as Frame[]).find(
      (d) => typeof d.subtleSystemNode === 'object' && d.subtleSystemNode !== null,
    )
    expect(docWithNode).toBeDefined()
    expect((docWithNode!.subtleSystemNode as { slug?: string }).slug).toBe('anahat')
  })

  /**
   * The handler-level cases above build `req` by hand and hardcode
   * `locale: 'en'`, so none of them can see how `req.locale` is DERIVED. That
   * is where #701 lived: the admin's hand-rolled fetch sent no `?locale=`,
   * Payload resolved the default locale, and the gate read the manager's
   * English roles — empty for a French-only manager, so 403.
   *
   * These drive Payload's real REST pipeline instead, as that manager.
   */
  describe('REST path — locale resolution gates a non-default-locale manager', () => {
    let rest: RestClient
    let path: string

    beforeAll(async () => {
      const frenchManager = await testData.createManager(payload, {
        type: 'manager',
        roles: { fr: ['meditations-editor'] },
      })
      rest = await createRestClientAs(env, frenchManager)
      path = `/api/frames/by-narrator/${maleNarrator.id}`
    })

    it('denies a request naming no locale, because it resolves to the default', async () => {
      const { status } = await rest(path)
      expect(status).toBe(403)
    })

    it('allows the same request under the locale the manager holds roles in', async () => {
      const { status, body } = await rest(`${path}?locale=fr`)
      expect(status).toBe(200)
      expect(Array.isArray(body.docs)).toBe(true)
    })

    it('denies it under a locale the manager holds no roles in', async () => {
      const { status } = await rest(`${path}?locale=en`)
      expect(status).toBe(403)
    })
  })
})
