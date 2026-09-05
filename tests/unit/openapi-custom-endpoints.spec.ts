import { describe, expect, it } from 'vitest'

import { ROUTING_MODES } from '../../src/lib/clients/canonical'
import { EMBED_MODES, MAX_MOUNT_KEY_LENGTH } from '../../src/lib/clients/embedMetadata'
import { LOCALES } from '../../src/lib/locales'
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
    // The definition, the timezone rule, and that `where` cannot override it here.
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
    // Enumerated so a widget cannot send a language the CMS has no translation
    // for. Sourced from LOCALES, so adding a locale updates the spec for free.
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
          '/api/user-messages': {
            get: { operationId: 'userMessagesList' },
            post: { operationId: 'userMessagesCreate' },
          },
          '/api/event-submissions': {
            post: { operationId: 'eventSubmissionsCreate' },
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

    it('hides the user-messages POST — ALLOW_POST_FOR is necessary but not sufficient', () => {
      // Two independent tiers can hide a POST, and `user-messages` clears only
      // one of them. `ALLOW_POST_FOR` stops the create-specific rule from
      // hiding it, but tier 2 hides every path whose collection is in no
      // project — and `user-messages` is deliberately in none, because project
      // membership is what grants implicit read to a project's roles.
      //
      // So the public intake is discoverable from the generated types (which is
      // how the Atlas SDK consumes it) rather than from /api/docs. This is the
      // same position `event-submissions` has been in since #625 — asserted
      // below so the two cannot silently diverge, and so anyone who wants this
      // POST documented knows the change is project membership, not this list.
      expect(op('/api/user-messages', 'post')['x-internal']).toBe(true)
      expect(op('/api/event-submissions', 'post')['x-internal']).toBe(true)
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
    // crawler cannot follow is not a canonical URL.
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
    // The widget distinguishes "I sent a bad URL" from "this host is not mine",
    // so both refusals have to be discoverable from the spec.
    for (const code of ['query_or_fragment', 'invalid_url', 'unsupported_scheme']) {
      expect(post?.responses?.['400']?.description).toContain(code)
    }
    expect(post?.responses?.['403']?.description).toContain('allowedDomains')
  })

  // `clients` is in ALWAYS_HIDDEN_COLLECTIONS and belongs to no project, so
  // filterSpec marks this x-internal. Deliberate — it is the first-party
  // widget's telemetry channel, not a third-party integration surface — and
  // pinned here so a future filter change does not publish it by accident.
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

describe('atlas SEO root endpoint (OpenAPI)', () => {
  const get = CUSTOM_ENDPOINT_PATHS['/api/atlas/seo']?.get as
    | {
        description?: string
        parameters?: { name: string; required?: boolean }[]
        responses?: Record<string, unknown>
      }
    | undefined

  it('registers the GET path and every hand-authored schema it references', () => {
    expect(get).toBeDefined()
    for (const schema of [
      'AtlasSeoResponse',
      'AtlasSeoAlternate',
      'AtlasSeoBreadcrumb',
      'AtlasSeoAddress',
      'AtlasSeoSchedule',
      'AtlasSeoImage',
      'AtlasSeoEventCard',
      'AtlasSeoEventContent',
      'AtlasSeoRegionContent',
    ]) {
      expect(CUSTOM_ENDPOINT_SCHEMAS[schema], `${schema} is not registered`).toBeDefined()
    }
  })

  it('takes a required `route` and an optional `locale`, and nothing else', () => {
    expect(get?.parameters?.map((parameter) => parameter.name)).toEqual(['route', 'locale'])
    expect(get?.parameters?.find((p) => p.name === 'route')?.required).toBe(true)
    expect(get?.parameters?.find((p) => p.name === 'locale')?.required).toBeFalsy()
  })

  // A shaped endpoint publishes a fixed structure. `select` and `populate`
  // are meaningless over it, and offering them would invite a caller to try.
  it('exposes no select/populate/depth passthrough', () => {
    const names = get?.parameters?.map((parameter) => parameter.name) ?? []
    for (const forbidden of ['select', 'populate', 'depth', 'where']) {
      expect(names).not.toContain(forbidden)
    }
  })

  // Each of these is a decision a consumer would otherwise have to guess at, and
  // guessing wrong is silent — a double-escaped JSON-LD block, a locale-suffixed
  // canonical, or a region page rendered as if its capped list were complete.
  it('documents the contract choices a consumer cannot infer', () => {
    expect(get?.description).toContain('locale-free')
    expect(get?.description).toContain('already serialized and escaped')
    expect(get?.description).toContain('No HTML crosses')
    expect(get?.description).toContain('eventCount')
    expect(get?.description).toContain('404')
  })

  it('advertises x-default alongside the widget locales', () => {
    const alternate = CUSTOM_ENDPOINT_SCHEMAS['AtlasSeoAlternate'] as {
      properties?: { hreflang?: { enum?: string[] } }
    }
    expect(alternate.properties?.hreflang?.enum).toContain('x-default')
    // The superset, not the enabled set: the effective list lives on the
    // `sy-atlas-config` global and can change without a deploy, so a statically
    // built spec can only name what it is drawn from.
    expect(alternate.properties?.hreflang?.enum).toHaveLength(LOCALES.length + 1)
    expect(get?.description).toContain('operator')
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

  const atlasSeoOp = (spec: OpenAPISpec): Record<string, unknown> => {
    const operation = (
      spec.paths?.['/api/atlas/seo'] as Record<string, Record<string, unknown>> | undefined
    )?.get
    expect(operation, 'GET /api/atlas/seo is missing from the filtered spec').toBeDefined()
    return operation!
  }

  it('stays visible in every project spec despite owning no collection', () => {
    // `atlas` names no collection, so without the root-path exemption the
    // project tier reads this as "not in this project" and hides it everywhere.
    const rootEndpointPaths = rootEndpointPathsFrom([{ path: '/atlas/seo' }])
    for (const project of ['sahaj-atlas', 'wemeditate-web', 'wemeditate-app'] as const) {
      const filtered = filterSpec(build(), { project, rootEndpointPaths })
      expect(atlasSeoOp(filtered)['x-internal'], `hidden for ${project}`).toBeFalsy()
    }
  })

  it('is hidden when the caller does not declare it as a root path', () => {
    expect(atlasSeoOp(filterSpec(build(), { project: 'sahaj-atlas' }))['x-internal']).toBe(true)
  })
})

describe('atlas sitemap root endpoint (OpenAPI)', () => {
  const get = CUSTOM_ENDPOINT_PATHS['/api/atlas/sitemap']?.get as
    | { description?: string; parameters?: { name: string }[]; responses?: Record<string, unknown> }
    | undefined

  it('registers the GET path and both hand-authored schemas it references', () => {
    expect(get).toBeDefined()
    for (const schema of ['AtlasSitemapResponse', 'AtlasSitemapUrl']) {
      expect(CUSTOM_ENDPOINT_SCHEMAS[schema], `${schema} is not registered`).toBeDefined()
    }
  })

  // The whole endpoint is "everything you own". A parameter would imply the
  // caller gets to choose, and the only correct answer is its own subtree.
  it('takes no parameters at all', () => {
    expect(get?.parameters).toEqual([])
  })

  // A client owning no subtree is the case a consumer is most likely to code
  // defensively (and wrongly) against, so the contract has to say it outright.
  it('documents the contract choices a consumer cannot infer', () => {
    expect(get?.description).toContain('nearest')
    expect(get?.description).toContain('not a 404')
    expect(get?.description).toContain('Finished classes are excluded')
    expect(get?.description).toContain('per-client')
  })

  // The point of the endpoint: one `loc` definition, not two. If the schema
  // stops promising byte-identity, a consumer has no reason not to recompose.
  it('promises `loc` is the same value /api/atlas/seo returns as `canonical`', () => {
    const url = CUSTOM_ENDPOINT_SCHEMAS['AtlasSitemapUrl'] as {
      required?: string[]
      properties?: { loc?: { description?: string } }
    }
    expect(url.required).toEqual(['loc', 'lastmod', 'route'])
    expect(url.properties?.loc?.description).toContain('byte-identical')
  })

  it('stays visible in every project spec despite owning no collection', () => {
    const spec = () =>
      JSON.parse(
        JSON.stringify({
          openapi: '3.1.0',
          info: { title: 't', version: '1' },
          paths: { ...CUSTOM_ENDPOINT_PATHS },
          components: { schemas: { ...CUSTOM_ENDPOINT_SCHEMAS } },
        }),
      ) as unknown as OpenAPISpec
    const rootEndpointPaths = rootEndpointPathsFrom([{ path: '/atlas/sitemap' }])
    for (const project of ['sahaj-atlas', 'wemeditate-web', 'wemeditate-app'] as const) {
      const filtered = filterSpec(spec(), { project, rootEndpointPaths })
      const operation = (
        filtered.paths?.['/api/atlas/sitemap'] as
          | Record<string, Record<string, unknown>>
          | undefined
      )?.get
      expect(operation, `GET /api/atlas/sitemap is missing for ${project}`).toBeDefined()
      expect(operation!['x-internal'], `hidden for ${project}`).toBeFalsy()
    }
  })
})

describe('rootEndpointPathsFrom', () => {
  it('prefixes each root endpoint path with the API route', () => {
    expect(rootEndpointPathsFrom([{ path: '/atlas/seo' }, { path: '/og' }])).toEqual([
      '/api/atlas/seo',
      '/api/og',
    ])
  })

  it('treats absent or disabled endpoints as none', () => {
    expect(rootEndpointPathsFrom(undefined)).toEqual([])
    expect(rootEndpointPathsFrom(false)).toEqual([])
  })
})
