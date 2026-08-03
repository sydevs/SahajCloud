import { describe, expect, it } from 'vitest'

import { depthParameter } from '../../src/plugins/openapi/clientReadParametersDocs'
import {
  CUSTOM_ENDPOINT_PATHS,
  CUSTOM_ENDPOINT_SCHEMAS,
} from '../../src/plugins/openapi/customEndpoints'
import { filterSpec, type OpenAPISpec } from '../../src/plugins/openapi/specFilter'

describe('Atlas events custom endpoints (OpenAPI)', () => {
  it('registers geojson GET + register POST paths and their schemas', () => {
    expect(CUSTOM_ENDPOINT_PATHS['/api/events/geojson']?.get).toBeDefined()
    expect(
      (CUSTOM_ENDPOINT_PATHS['/api/events/{id}/register'] as { post?: unknown }).post,
    ).toBeDefined()
    for (const schema of [
      'EventFeatureCollection',
      'EventFeature',
      'GeoJsonPoint',
      'EventRegistrationRequest',
      'EventRegistrationResponse',
    ]) {
      expect(CUSTOM_ENDPOINT_SCHEMAS[schema]).toBeDefined()
    }
  })

  // The feed's contract has to be discoverable — an existing client that starts
  // seeing fewer events needs to find out why from /api/docs, not from the source.
  it('documents the finished-event exclusion + its opt-out on the geojson feed', () => {
    const description = (
      CUSTOM_ENDPOINT_PATHS['/api/events/geojson']?.get as { description?: string }
    ).description
    expect(description).toContain('Finished events are excluded')
    // The definition, the timezone rule, and that `where` can't override it here.
    expect(description).toContain('schedule.lastDate')
    expect(description).toContain('own timezone')
    expect(description).toContain('cannot re-include')
    // …and where the opt-out does work, plus the single-doc read staying open.
    expect(description).toContain('GET /api/events')
    expect(description).toContain('GET /api/events/{id}')
  })

  it('documents the 409 refusal for registering on an event that has ended', () => {
    const post = (
      CUSTOM_ENDPOINT_PATHS['/api/events/{id}/register'] as {
        post?: { responses?: Record<string, { description?: string }> }
      }
    ).post
    expect(post?.responses?.['409']).toBeDefined()
    expect(post?.responses?.['409']?.description).toContain('run out')
  })

  it('documents the optional subscribe consent flag on the register request body', () => {
    const schema = CUSTOM_ENDPOINT_SCHEMAS.EventRegistrationRequest as {
      required?: string[]
      properties?: Record<string, { type?: string }>
    }
    expect(schema.properties?.subscribe?.type).toBe('boolean')
    // Opt-in → optional, never in `required`.
    expect(schema.required ?? []).not.toContain('subscribe')
  })

  it('documents the optional locale, enumerating the configured app locales', () => {
    const schema = CUSTOM_ENDPOINT_SCHEMAS.EventRegistrationRequest as {
      required?: string[]
      properties?: Record<string, { enum?: string[]; type?: string }>
    }
    const locale = schema.properties?.locale

    expect(locale?.type).toBe('string')
    // Enumerated so a widget can't send a language the CMS has no translation
    // for; sourced from LOCALES, so adding a locale updates the spec for free.
    expect(locale?.enum).toContain('en')
    expect(locale?.enum).toContain('pt-BR')
    expect(locale?.enum).not.toContain('xx')
    expect(schema.required ?? []).not.toContain('locale')
  })

  describe('filterSpec POST visibility', () => {
    // Minimal spec: the auto-generated events CRUD plus the hand-authored custom
    // subpaths, filtered for the project that owns `events`.
    const build = (): OpenAPISpec =>
      ({
        openapi: '3.1.0',
        info: { title: 't', version: '1' },
        paths: {
          '/api/events': {
            get: { operationId: 'eventsList' },
            post: { operationId: 'eventsCreate' },
          },
          ...CUSTOM_ENDPOINT_PATHS,
        },
        components: { schemas: { ...CUSTOM_ENDPOINT_SCHEMAS } },
      }) as unknown as OpenAPISpec

    const filtered = filterSpec(build(), { project: 'sahaj-atlas' })
    const op = (path: string, method: 'get' | 'post'): Record<string, unknown> | undefined =>
      (filtered.paths?.[path] as Record<string, Record<string, unknown> | undefined>)?.[method]

    it('keeps the hand-authored register POST visible', () => {
      expect(op('/api/events/{id}/register', 'post')?.['x-internal']).toBeFalsy()
    })

    it('hides the auto-generated base-collection POST (create)', () => {
      expect(op('/api/events', 'post')?.['x-internal']).toBe(true)
    })

    it('keeps the geojson GET and the standard events list GET visible', () => {
      expect(op('/api/events/geojson', 'get')?.['x-internal']).toBeFalsy()
      expect(op('/api/events', 'get')?.['x-internal']).toBeFalsy()
    })
  })
})

describe('Lectures related-meditations custom endpoint (OpenAPI)', () => {
  const get = CUSTOM_ENDPOINT_PATHS['/api/lectures/{id}/related-meditations']?.get as
    | { parameters?: Array<{ name: string; required?: boolean }> }
    | undefined

  it('registers the related-meditations GET path and its card schema', () => {
    expect(get).toBeDefined()
    expect(CUSTOM_ENDPOINT_SCHEMAS['MeditationCardData']).toBeDefined()
  })

  it('documents limit (required) + excludedMeditationIds (optional) and no select/populate', () => {
    const byName = new Map((get?.parameters ?? []).map((p) => [p.name, p]))
    expect(byName.get('limit')?.required).toBe(true)
    expect(byName.get('excludedMeditationIds')?.required).toBe(false)
    // Shaped endpoint — fixed card output, so no passthrough read params.
    expect(byName.has('select')).toBe(false)
    expect(byName.has('populate')).toBe(false)
  })
})

describe('depth parameter (OpenAPI)', () => {
  // The documented `maximum` must track the server `maxDepth` in
  // src/payload.config.ts (currently 3) so REST clients see the real cap.
  it('caps depth at the server maxDepth (3)', () => {
    expect(depthParameter.schema.maximum).toBe(3)
    expect(depthParameter.schema.default).toBe(2)
    expect(depthParameter.schema.minimum).toBe(0)
  })
})
