import { describe, expect, it } from 'vitest'

import { WIX_PREFIX_MAX_LENGTH, WIX_PREFIX_PATTERN } from '../../src/lib/atlas/wixPrefix'
import { ROUTING_MODES } from '../../src/lib/clients/canonical'
import { EMBED_MODES, MAX_MOUNT_KEY_LENGTH } from '../../src/lib/clients/embedMetadata'
import { LOCALES } from '../../src/lib/locales'
import { getProjectSlugs } from '../../src/plugins/access/config/projects'
import { limitParameter, pageParameter } from '../../src/plugins/openapi/clientReadParametersDocs'
import {
  CUSTOM_ENDPOINT_PATHS,
  CUSTOM_ENDPOINT_SCHEMAS,
} from '../../src/plugins/openapi/customEndpoints'
import {
  ALWAYS_HIDDEN_COLLECTIONS,
  filterSpec,
  rootEndpointPathsFrom,
  type OpenAPISpec,
} from '../../src/plugins/openapi/specFilter'
import { MAX_CLIENT_LIMIT, MAX_CLIENT_PAGE } from '../../src/plugins/usage/constants'

/** A fresh copy, so one case's filtering cannot leak into the next. */
const customSpec = (): OpenAPISpec =>
  JSON.parse(
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: { ...CUSTOM_ENDPOINT_PATHS },
      components: { schemas: { ...CUSTOM_ENDPOINT_SCHEMAS } },
    }),
  ) as unknown as OpenAPISpec

describe('Atlas events custom endpoints (OpenAPI)', () => {
  // `specFilter` applies `security: [{ 'API-Key': [] }]` to the whole spec, so an
  // operation that accepts no credential has to clear it or the contract demands one.
  it('publishes the calendar feed as taking no credential', () => {
    expect(CUSTOM_ENDPOINT_PATHS['/api/events/calendar/{token}.ics']?.get?.security).toEqual([])
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
          '/api/user-submissions': {
            get: { operationId: 'userSubmissionsList' },
            post: { operationId: 'userSubmissionsCreate' },
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

    it('hides the auto-generated base-collection POST (create)', () => {
      expect(op('/api/events', 'post')['x-internal']).toBe(true)
    })

    it('keeps the geojson GET and the standard events list GET visible', () => {
      expect(op('/api/events/geojson', 'get')['x-internal']).toBeFalsy()
      expect(op('/api/events', 'get')['x-internal']).toBeFalsy()
    })

    it('hides the user-submissions POST — ALLOW_POST_FOR is necessary but not sufficient', () => {
      // Two independent tiers can hide a POST, and the unified intake clears
      // only one of them. `ALLOW_POST_FOR` stops the create-specific rule from
      // hiding it, but tier 2 hides every path whose collection is in no
      // project — and `user-submissions` is deliberately in none, because
      // project membership is what grants implicit read to a project's roles,
      // and this collection carries every kind of personal data it takes in.
      //
      // So the public intake is discoverable from the generated types (which is
      // how the Atlas SDK consumes it) rather than from /api/docs. Anyone who
      // wants this POST documented needs to change project membership, not this
      // list — which would also open reads.
      expect(op('/api/user-submissions', 'post')['x-internal']).toBe(true)
    })
  })
})

describe('LecturePlayerData schema (OpenAPI)', () => {
  // `customEndpoints.ts` says to keep this schema in lockstep with
  // `LecturePlayerData` in `src/lib/lectures/lectureShape.ts`. Only a comment
  // said so, so adding a field to the type and forgetting the schema — or the
  // reverse — drifted silently. `additionalProperties: false` does not catch
  // it: nothing validates a response against this schema at runtime.
  it('documents exactly the keys the shaper emits', () => {
    const schema = CUSTOM_ENDPOINT_SCHEMAS['LecturePlayerData'] as {
      additionalProperties?: boolean
      properties?: Record<string, unknown>
    }
    // The same list `lectures-for-audience` and `meditation-lectures` pin
    // against a real response.
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
      'duration',
      'fullLectureId',
      'hlsUrl',
      'id',
      'startTime',
      'stopTime',
      'subtitles',
      'thumbnailUrl',
      'title',
      'userChoices',
    ])
    expect(schema.additionalProperties).toBe(false)
  })
})

describe('limit and page parameters (OpenAPI)', () => {
  // The published range is the only statement of the gate's bound an
  // integrator reads, and nothing but this spec ties the two together. A
  // `minimum` above what `assertWithinBound` accepts makes a generated
  // client refuse, ahead of the server, a request the server answers 200.
  it('publishes the bounds the gate enforces', () => {
    expect(limitParameter.schema.maximum).toBe(MAX_CLIENT_LIMIT)
    expect(pageParameter.schema.maximum).toBe(MAX_CLIENT_PAGE)
  })

  // `limit=0` is payload's "no limit" spelling, refused since #889, so the
  // published floor is 1. `page` is 1-based, and 0 still reaches the server:
  // `find.js` reads it as page 1, and `assertWithinBound` admits it because
  // one rule covers both numbers. So these two 1s mean different things —
  // `limit` publishes a bound the gate enforces, `page` publishes a shape.
  it('publishes limit=1 as the floor and keeps page 1-based', () => {
    expect(limitParameter.schema.minimum).toBe(1)
    expect(pageParameter.schema.minimum).toBe(1)
  })
})

describe('clients embed-report custom endpoint (OpenAPI)', () => {
  it('sources its enums from the collection constants, so they cannot drift', () => {
    const schema = CUSTOM_ENDPOINT_SCHEMAS['ClientEmbedReportRequest'] as {
      properties?: Record<string, { enum?: string[]; maxLength?: number }>
    }
    expect(schema.properties?.mode?.enum).toEqual([...EMBED_MODES])
    expect(schema.properties?.routing?.enum).toEqual([...ROUTING_MODES])
    // The whole point of the ticket's routing decision — a canonical URL a
    // crawler cannot follow is not a canonical URL.
    expect(schema.properties?.routing?.enum).not.toContain('hash')
    expect(schema.properties?.origin?.maxLength).toBe(MAX_MOUNT_KEY_LENGTH)
    expect(schema.properties?.pathname?.maxLength).toBe(MAX_MOUNT_KEY_LENGTH)
  })

  // `clients` is in ALWAYS_HIDDEN_COLLECTIONS and belongs to no project, so
  // filterSpec marks this x-internal. Deliberate — it is the first-party
  // widget's telemetry channel, not a third-party integration surface — and
  // pinned here so a future filter change does not publish it by accident.
  it('stays x-internal in the public spec', () => {
    const filtered = filterSpec(customSpec(), { project: 'sahaj-atlas' })
    const operation = (
      filtered.paths?.['/api/clients/report'] as Record<string, Record<string, unknown>>
    )?.post
    expect(operation, 'POST /api/clients/report is missing from the filtered spec').toBeDefined()
    expect(operation['x-internal']).toBe(true)
  })
})

describe('atlas SEO root endpoint (OpenAPI)', () => {
  // The union in `responseTypes.ts` gained a third member (#739). An event's
  // content also carries a `paragraphs` array, so an open root shape would
  // match two branches of the `content` oneOf and a strict validator would
  // reject a correct event response.
  it('closes every content shape, so the oneOf stays unambiguous', () => {
    for (const schema of ['AtlasSeoRootContent', 'AtlasSeoRegionContent', 'AtlasSeoEventContent']) {
      const shape = CUSTOM_ENDPOINT_SCHEMAS[schema] as { additionalProperties?: boolean }
      expect(shape.additionalProperties, `${schema} is open`).toBe(false)
    }
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

describe('transcripts (OpenAPI)', () => {
  // ⚠ **ALWAYS_HIDDEN_COLLECTIONS is now the only tier hiding it.** The
  // collection joined the two projects that carry `meditations`, so the project
  // tier publishes it — a transcript is read alongside its recording, and the
  // spec is deliberately still silent about the base paths, because a reader
  // reaches a transcript through the meditation it belongs to.
  const baseSpec = () =>
    ({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/transcripts': { get: {}, post: {} },
        '/api/transcripts/{id}': { get: {} },
      },
      components: { schemas: {} },
    }) as unknown as OpenAPISpec

  const expectHidden = (filtered: OpenAPISpec, tier: string) => {
    for (const path of ['/api/transcripts', '/api/transcripts/{id}']) {
      const operations = filtered.paths?.[path] as Record<string, Record<string, unknown>>
      expect(operations, `${path} is missing for ${tier}`).toBeDefined()
      for (const [method, operation] of Object.entries(operations)) {
        expect(
          operation['x-internal'],
          `${method.toUpperCase()} ${path} is published for ${tier}`,
        ).toBe(true)
      }
    }
  }

  it('is a collection the spec never publishes', () => {
    expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('transcripts')
  })

  // Read from the config rather than listed here, so a fourth project cannot
  // publish these paths without this failing.
  it('hides every base path from every project tier', () => {
    for (const project of getProjectSlugs()) {
      expectHidden(filterSpec(baseSpec(), { project }), project)
    }
  })

  it('hides them with no project named, where the role union applies instead', () => {
    expectHidden(filterSpec(baseSpec(), {}), 'no project')
  })

  // No transcript endpoint exists since #968, so this guards the one #984 may
  // re-add: a manager-only action reaches the spec only through an explicit
  // opt-in. `POST /api/user-submissions/:id/review` was the precedent,
  // deliberately absent for the same reason until #909 deleted it outright.
  // `framesByNarrator` is listed because it admits published clients.
  it('publishes neither transcript endpoint', () => {
    expect(CUSTOM_ENDPOINT_PATHS['/api/meditations/{id}/transcribe']).toBeUndefined()
  })

  // `POST /api/files/:id/transcribe` (#1016) is the same kind of door: gated on
  // `files: create`, called only by the admin panel's Transcript panel, and so
  // out of the spec and out of the schema map. `docs/rules/endpoints.md` scopes
  // both to public, client-facing endpoints.
  it('publishes no file transcribe endpoint, nor a schema for one', () => {
    expect(CUSTOM_ENDPOINT_PATHS['/api/files/{id}/transcribe']).toBeUndefined()
    expect(Object.keys(CUSTOM_ENDPOINT_SCHEMAS)).not.toContainEqual(
      expect.stringMatching(/transcri|subtitles/i),
    )
  })
})

describe('the Wix router endpoints (OpenAPI)', () => {
  it('publishes the prefix rule the handler enforces, never a copy of it', () => {
    const sitemap = CUSTOM_ENDPOINT_PATHS['/api/atlas/wix/sitemap']?.get
    // Three copies of this regex meant the tab could accept a prefix the
    // endpoint then 400s, which is the failure the tab exists to prevent.
    const prefix = sitemap?.parameters?.[0] as { schema?: { pattern?: string; maxLength?: number } }
    expect(prefix.schema?.pattern).toBe(WIX_PREFIX_PATTERN.source)
    expect(prefix.schema?.maxLength).toBe(WIX_PREFIX_MAX_LENGTH)
  })
})
