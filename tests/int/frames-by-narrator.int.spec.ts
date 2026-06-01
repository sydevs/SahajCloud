import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { framesByNarrator } from '@/endpoints'
import type { Frame, Narrator } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type EndpointResponse = { status: number; body: any }

async function callEndpoint(
  payload: Payload,
  narratorId: string | undefined,
): Promise<EndpointResponse> {
  const req = {
    payload,
    routeParams: narratorId === undefined ? {} : { narratorId },
    headers: new Headers(),
    query: {},
  } as unknown as PayloadRequest

  const response = (await framesByNarrator.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, body }
}

describe('framesByNarrator endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let maleNarrator: Narrator
  let femaleNarrator: Narrator

  let maleImage: Frame
  let maleVideo: Frame
  let femaleImage: Frame

  beforeAll(async () => {
    const env = await createTestEnvironment()
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
  })

  afterAll(async () => {
    await cleanup()
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
})
