import { describe, expect, it } from 'vitest'

import { ROUTING_MODES } from '../../src/lib/clients/canonical'
import { EMBED_MODES, MAX_MOUNT_KEY_LENGTH } from '../../src/lib/clients/embedMetadata'
import { depthParameter } from '../../src/plugins/openapi/clientReadParametersDocs'
import {
  CUSTOM_ENDPOINT_PATHS,
  CUSTOM_ENDPOINT_SCHEMAS,
} from '../../src/plugins/openapi/customEndpoints'
import {
  filterSpec,
  rootEndpointPathsFrom,
  type OpenAPISpec,
} from '../../src/plugins/openapi/specFilter'

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

  it('documents the 409 state-based registration rejection codes', () => {
    const post = (
      CUSTOM_ENDPOINT_PATHS['/api/events/{id}/register'] as {
        post?: { responses?: Record<string, { description?: string }> }
      }
    ).post
    const conflict = post?.responses?.['409']
    expect(conflict).toBeDefined()
    // The widget maps each code to its registration-state UI, so the contract
    // must name every one it can send.
    for (const code of [
      'external_registration',
      'event_ended',
      'registration_closed',
      'event_full',
    ]) {
      expect(conflict?.description).toContain(code)
    }
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
    // Assert the operation exists before reading `x-internal` off it. Without
    // this, a path that vanished from the spec entirely would read as
    // `undefined` → falsy → "visible", and every visibility check below would
    // pass vacuously.
    const op = (path: string, method: 'get' | 'post'): Record<string, unknown> => {
      const operation = (
        filtered.paths?.[path] as Record<string, Record<string, unknown> | undefined> | undefined
      )?.[method]
      expect(
        operation,
        `${method.toUpperCase()} ${path} is missing from the filtered spec`,
      ).toBeDefined()
      return operation!
    }

    it('keeps the hand-authored register POST visible', () => {
      expect(op('/api/events/{id}/register', 'post')['x-internal']).toBeFalsy()
    })

    it('hides the auto-generated base-collection POST (create)', () => {
      expect(op('/api/events', 'post')['x-internal']).toBe(true)
    })

    it('keeps the geojson GET and the standard events list GET visible', () => {
      expect(op('/api/events/geojson', 'get')['x-internal']).toBeFalsy()
      expect(op('/api/events', 'get')['x-internal']).toBeFalsy()
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

describe('clients embed-report custom endpoint (OpenAPI)', () => {
  const post = CUSTOM_ENDPOINT_PATHS['/api/clients/report']?.post as
    | { description?: string; responses?: Record<string, { description?: string }> }
    | undefined

  it('registers the POST path and both hand-authored schemas', () => {
    expect(post).toBeDefined()
    expect(CUSTOM_ENDPOINT_SCHEMAS['ClientEmbedReportRequest']).toBeDefined()
    expect(CUSTOM_ENDPOINT_SCHEMAS['ClientEmbedReportResponse']).toBeDefined()
  })

  it('sources its enums from the collection constants, so they cannot drift', () => {
    const schema = CUSTOM_ENDPOINT_SCHEMAS['ClientEmbedReportRequest'] as {
      required?: string[]
      properties?: Record<string, { enum?: string[]; maxLength?: number }>
    }
    expect(schema.properties?.mode?.enum).toEqual([...EMBED_MODES])
    expect(schema.properties?.routing?.enum).toEqual([...ROUTING_MODES])
    // The whole point of the ticket's routing decision — a canonical URL a
    // crawler can't follow is not a canonical URL.
    expect(schema.properties?.routing?.enum).not.toContain('hash')
    expect(schema.properties?.origin?.maxLength).toBe(MAX_MOUNT_KEY_LENGTH)
    expect(schema.properties?.pathname?.maxLength).toBe(MAX_MOUNT_KEY_LENGTH)
    // Two fields, not one URL — the shipped widget sends them apart, and the
    // endpoint can only check the path on its own if it arrives on its own.
    expect(schema.required).toEqual([
      'origin',
      'pathname',
      'mode',
      'topLevel',
      'urlWritable',
      'paramPersisted',
      'routing',
    ])
  })

  it('documents the machine codes a rejected url carries', () => {
    // The widget distinguishes "I sent a bad URL" from "this host isn't mine",
    // so both refusals have to be discoverable from the spec.
    for (const code of ['query_or_fragment', 'invalid_url', 'unsupported_scheme']) {
      expect(post?.responses?.['400']?.description).toContain(code)
    }
    expect(post?.responses?.['403']?.description).toContain('allowedDomains')
  })

  // `clients` is in ALWAYS_HIDDEN_COLLECTIONS and belongs to no project, so
  // filterSpec marks this x-internal. Deliberate — it is the first-party
  // widget's telemetry channel, not a third-party integration surface — and
  // pinned here so a future filter change doesn't publish it by accident.
  it('stays x-internal in the public spec', () => {
    const filtered = filterSpec(
      {
        openapi: '3.1.0',
        info: { title: 't', version: '1' },
        paths: { ...CUSTOM_ENDPOINT_PATHS },
        components: { schemas: { ...CUSTOM_ENDPOINT_SCHEMAS } },
      } as unknown as OpenAPISpec,
      { project: 'sahaj-atlas' },
    )
    const operation = (
      filtered.paths?.['/api/clients/report'] as Record<string, Record<string, unknown>>
    )?.post
    expect(operation, 'POST /api/clients/report is missing from the filtered spec').toBeDefined()
    expect(operation['x-internal']).toBe(true)
  })
})

describe('contact-admin root endpoint (OpenAPI)', () => {
  const post = CUSTOM_ENDPOINT_PATHS['/api/contact-admin']?.post as
    | { description?: string; responses?: Record<string, { description?: string }> }
    | undefined

  it('registers the POST path and both hand-authored schemas', () => {
    expect(post).toBeDefined()
    expect(CUSTOM_ENDPOINT_SCHEMAS['ContactAdminRequest']).toBeDefined()
    expect(CUSTOM_ENDPOINT_SCHEMAS['ContactAdminResponse']).toBeDefined()
  })

  it('documents the bounds a public caller must respect', () => {
    // The bounds are the contract — mirrors the Zod schema in the handler.
    const schema = CUSTOM_ENDPOINT_SCHEMAS['ContactAdminRequest'] as {
      required?: string[]
      properties?: Record<string, { minLength?: number; maxLength?: number }>
    }
    expect(schema.required).toEqual(['message', 'turnstileToken'])
    expect(schema.properties?.message).toMatchObject({ minLength: 10, maxLength: 5000 })
    expect(schema.properties?.turnstileToken?.maxLength).toBe(2048)
    // Optional by design: an anonymous message is allowed, it just can't be replied to.
    expect(schema.required ?? []).not.toContain('email')
  })

  it('documents the distinguishable captcha code and the 502 delivery failure', () => {
    // A caller resets its widget on `captcha_failed` rather than treating the
    // 403 as fatal, so the code has to be discoverable from /api/docs.
    expect(post?.responses?.['403']?.description).toContain('captcha_failed')
    // And 502 means the message is gone — nothing was persisted to retry from.
    expect(post?.responses?.['502']).toBeDefined()
    expect(post?.description).toContain('502')
  })

  const build = () =>
    JSON.parse(
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 't', version: '1' },
        paths: { ...CUSTOM_ENDPOINT_PATHS },
        components: { schemas: { ...CUSTOM_ENDPOINT_SCHEMAS } },
      }),
    ) as unknown as OpenAPISpec

  // Asserts presence first — a vanished path would otherwise read as falsy and
  // pass the "stays visible" check without the endpoint being in the spec at all.
  const contactAdminOp = (spec: OpenAPISpec): Record<string, unknown> => {
    const operation = (
      spec.paths?.['/api/contact-admin'] as Record<string, Record<string, unknown>> | undefined
    )?.post
    expect(operation, 'POST /api/contact-admin is missing from the filtered spec').toBeDefined()
    return operation!
  }

  // What the route handler passes in production: derived from the live
  // `config.endpoints`, so registering an endpoint is the only edit needed.
  const rootEndpointPaths = rootEndpointPathsFrom([{ path: '/contact-admin' }])

  it('stays visible in every project spec despite owning no collection', () => {
    for (const project of ['sahaj-atlas', 'wemeditate-web', 'wemeditate-app'] as const) {
      const filtered = filterSpec(build(), { project, rootEndpointPaths })
      expect(contactAdminOp(filtered)['x-internal'], `hidden for ${project}`).toBeFalsy()
    }
  })

  it('is hidden when the caller does not declare it as a root path', () => {
    // The failure mode the exemption exists to prevent: `/api/contact-admin`'s
    // first segment names no collection, so the project tier reads it as "not in
    // this project" and hides a live endpoint from every /docs page.
    const filtered = filterSpec(build(), { project: 'sahaj-atlas' })
    expect(contactAdminOp(filtered)['x-internal']).toBe(true)
  })
})

describe('rootEndpointPathsFrom', () => {
  it('prefixes each root endpoint path with the API route', () => {
    expect(rootEndpointPathsFrom([{ path: '/contact-admin' }, { path: '/og' }])).toEqual([
      '/api/contact-admin',
      '/api/og',
    ])
  })

  it('treats absent or disabled endpoints as none', () => {
    expect(rootEndpointPathsFrom(undefined)).toEqual([])
    expect(rootEndpointPathsFrom(false)).toEqual([])
  })
})
