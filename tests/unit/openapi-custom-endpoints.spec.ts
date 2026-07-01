import { describe, expect, it } from 'vitest'

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
