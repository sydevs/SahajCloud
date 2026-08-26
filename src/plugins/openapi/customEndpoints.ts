/**
 * Custom Endpoint OpenAPI Shims
 *
 * `payload-oapi` v0.2.5 does not generate path entries for custom Payload
 * collection endpoints (the ones defined in `src/collections/<Name>/endpoints/*` and wired via
 * a collection's `endpoints` array). This module hand-writes those path
 * definitions so they appear in the Scalar docs alongside the auto-generated
 * CRUD endpoints.
 *
 * Consumers:
 *   - `src/app/(payload)/api/openapi.json/route.ts` merges these into the
 *     spec between `generateV31Spec` and `filterSpec`.
 *   - `tests/unit/openapi-custom-endpoints.spec.ts` asserts these paths + schemas
 *     stay registered (and that shaped endpoints expose no `select`/`populate`).
 *
 * When `payload-oapi` ships native custom-endpoint support, delete this
 * module and the merge block in the route handler.
 */

import { ROUTING_MODES } from '@/lib/clients/canonical'
import { EMBED_MODES, MAX_MOUNT_KEY_LENGTH } from '@/lib/clients/embedMetadata'
import { LOCALES } from '@/lib/locales'

import {
  depthParameter,
  limitParameter,
  pageParameter,
  populateParameter,
  selectParameter,
} from './clientReadParametersDocs'

/** Minimal OpenAPI 3.1 schema object — we only need the subset used below. */
type OpenAPISchemaObject = Record<string, unknown>

/** Minimal OpenAPI 3.1 path item. Matches the shape in specFilter.ts. */
interface OpenAPIPathItem {
  get?: OpenAPIOperation
  [key: string]: unknown
}

interface OpenAPIOperation {
  tags?: string[]
  summary?: string
  description?: string
  operationId?: string
  parameters?: OpenAPIParameter[]
  responses?: Record<string, OpenAPIResponse>
  [key: string]: unknown
}

interface OpenAPIParameter {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: OpenAPISchemaObject
  // Index signature keeps this structurally assignable to the
  // parameter shape expected by `specFilter.ts`
  // (`{ $ref?: string; [key: string]: unknown }`).
  [key: string]: unknown
}

interface OpenAPIResponse {
  description: string
  content?: Record<string, { schema: OpenAPISchemaObject }>
  headers?: Record<string, { description: string; schema: OpenAPISchemaObject }>
}

// ── Audience query params (hand-written) ─────────────────────────────────────

/**
 * Query parameters for `GET /api/audiences/for-user`.
 * All five params are required — four progress params + country.
 */
const audienceQueryParameters: OpenAPIParameter[] = [
  {
    name: 'pathProgress',
    in: 'query',
    required: true,
    description: 'Index of the current Path step the user has reached (0 = not started).',
    schema: { type: 'integer', minimum: 0 },
  },
  {
    name: 'meditationsPerWeek',
    in: 'query',
    required: true,
    description: 'Meditation sessions the user has completed in the past seven days.',
    schema: { type: 'integer', minimum: 0 },
  },
  {
    name: 'totalMeditationsViewed',
    in: 'query',
    required: true,
    description: 'Lifetime count of distinct meditations the user has opened.',
    schema: { type: 'integer', minimum: 0 },
  },
  {
    name: 'totalLecturesViewed',
    in: 'query',
    required: true,
    description: 'Lifetime count of distinct lectures the user has played.',
    schema: { type: 'integer', minimum: 0 },
  },
  {
    name: 'country',
    in: 'query',
    required: true,
    description: 'ISO 3166-1 alpha-2 country code of the user (e.g. `US`, `GB`).',
    schema: { type: 'string', minLength: 2, maxLength: 2 },
  },
]

// ── Shared response fragments ─────────────────────────────────────────────────

const forAudienceLimitParam = (max: number): OpenAPIParameter => ({
  name: 'limit',
  in: 'query',
  required: true,
  description: `Maximum number of docs to return (1–${max}).`,
  schema: { type: 'integer', minimum: 1, maximum: max },
})

/**
 * The `audiences` query parameter accepted by the three `/for-audience` data
 * endpoints. Comma-separated positive integers; server dedupes + sorts so
 * equivalent client requests collapse to the same edge-cache key. Mobile
 * clients are expected to call `/api/audiences/for-user` first and pass the
 * resulting ID list back.
 *
 * Mirrors the Zod schema in `src/lib/audiences/audiencesQueryParam.ts`.
 */
const audiencesIdsParam: OpenAPIParameter = {
  name: 'audiences',
  in: 'query',
  required: true,
  description:
    'Comma-separated audience IDs the caller qualifies for, e.g. `1,2,3`. ' +
    'Resolve via `GET /api/audiences/for-user`. Server-side the list is ' +
    'deduplicated and sorted ascending, so `3,1,2` and `2,3,1,2` are ' +
    'treated identically and share the same edge-cache key.',
  schema: { type: 'string', pattern: '^\\d+(,\\d+)*$' },
}

const jsonDocsResponse = (itemSchemaRef: string): OpenAPIResponse => ({
  description: 'Audience-filtered docs.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['docs'],
        properties: {
          docs: {
            type: 'array',
            items: { $ref: itemSchemaRef },
          },
        },
      },
    },
  },
})

/**
 * Full Payload paginated list envelope (`docs` + pagination metadata), matching
 * the built-in collection list endpoints. Use for custom endpoints that return
 * `Response.json({ ...payloadFindResult })` unchanged except for `docs` ordering.
 */
const paginatedDocsResponse = (itemSchemaRef: string, description: string): OpenAPIResponse => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: [
          'docs',
          'totalDocs',
          'limit',
          'totalPages',
          'page',
          'pagingCounter',
          'hasPrevPage',
          'hasNextPage',
          'prevPage',
          'nextPage',
        ],
        properties: {
          docs: { type: 'array', items: { $ref: itemSchemaRef } },
          totalDocs: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
          page: { type: 'integer' },
          pagingCounter: { type: 'integer' },
          hasPrevPage: { type: 'boolean' },
          hasNextPage: { type: 'boolean' },
          prevPage: { type: ['integer', 'null'] },
          nextPage: { type: ['integer', 'null'] },
        },
      },
    },
  },
})

/**
 * Lecture player-data subtitle map: `{ [localeCode]: subtitleFileUrl }`.
 * Distinct from the inline caption-data shape in `src/lib/utilities/subtitles.ts`
 * (which is what Videos / Lessons / Lecture authoring fields store).
 * Keys are constrained to the known `LOCALES` codes via
 * `propertyNames: { enum: ... }` (JSON Schema 2020-12 / OpenAPI 3.1 —
 * advisory for most validators, but Scalar renders the constraint).
 * Values are declared as URL-formatted strings (`format: 'uri'` is also
 * advisory but documents intent).
 */
const lectureSubtitleUrlsSchema: OpenAPISchemaObject = {
  type: 'object',
  description: 'Map of locale code to subtitle URL.',
  propertyNames: {
    enum: LOCALES.map((l) => l.code),
  },
  additionalProperties: {
    type: 'string',
    format: 'uri',
  },
}

/**
 * Shared error response shape. All three handlers return `{ errors: [...] }`
 * on 4xx — Zod-validated endpoints return `parsed.error.issues` directly,
 * and framesByNarrator's 404 emits `[{ message }]`. Both line up with the
 * `ErrorResponse` schema in `CUSTOM_ENDPOINT_SCHEMAS` below.
 */
const errorResponse = (description: string): OpenAPIResponse => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
})

/**
 * Query parameters for `GET /api/events/geojson` — the standard client read
 * params (forwarded straight into the events read, so the same `select`/
 * `populate` rules apply) plus `where` / `sort` / `locale`.
 */
const eventGeoJsonParameters: OpenAPIParameter[] = [
  selectParameter,
  populateParameter,
  depthParameter,
  limitParameter,
  pageParameter,
  {
    name: 'where',
    in: 'query',
    required: false,
    description:
      'Standard Payload `where` filter in bracket notation, e.g. ' +
      '`where[eventType][equals]=offline`. Applied to the underlying events read.',
    schema: { type: 'object', additionalProperties: true },
  },
  {
    name: 'sort',
    in: 'query',
    required: false,
    description: 'Field to sort by; prefix with `-` for descending (e.g. `-createdAt`).',
    schema: { type: 'string' },
  },
  {
    name: 'locale',
    in: 'query',
    required: false,
    description: 'Locale for localized fields. Defaults to the request locale.',
    schema: { type: 'string', enum: LOCALES.map((l) => l.code) },
  },
]

// ── Path definitions ──────────────────────────────────────────────────────────

/**
 * Custom endpoint path definitions merged into the generated spec before
 * `filterSpec` runs. Keys include the `/api/` prefix because `filterSpec`'s
 * `getCollectionFromPath` extracts the collection slug from that position
 * (see `src/plugins/openapi/specFilter.ts`). Keeping the prefix lets the
 * existing project-based visibility rules apply automatically:
 *
 *   - `/api/frames/...`      → visible wherever `frames` is in the project
 *   - `/api/lectures/...`    → visible wherever `lectures` is in the project
 *   - `/api/app-cards/...`   → visible wherever `app-cards` is in the project
 */
export const CUSTOM_ENDPOINT_PATHS: Record<string, OpenAPIPathItem> = {
  '/api/frames/by-narrator/{narratorId}': {
    get: {
      tags: ['Meditation Frames'],
      summary: 'List frames for a narrator',
      description:
        "Returns frames filtered by the narrator's gender (`imageSet`), sorted " +
        'to show images before videos. Up to 100 frames are returned.',
      operationId: 'framesByNarrator',
      parameters: [
        {
          name: 'narratorId',
          in: 'path',
          required: true,
          description: 'ID of the narrator whose frames to fetch.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Frames collection response.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Frames' },
            },
          },
        },
        '400': errorResponse('Missing or invalid narratorId.'),
        '403': errorResponse('Caller does not have frames read access.'),
        '404': errorResponse('Narrator not found.'),
      },
    },
  },

  '/api/events/geojson': {
    get: {
      tags: ['Events'],
      summary: 'Events as a GeoJSON FeatureCollection',
      description:
        'A thin GeoJSON wrapper over a standard published-events read. Accepts the ' +
        'same query params as `GET /api/events` (`where`, `select`, `populate`, ' +
        '`depth`, `limit`, `page`, `sort`, `locale`) and enforces the same client ' +
        'rules: `select` is required (400 if missing) and `populate` is required ' +
        "when `depth > 1`. Each feature's `geometry` is a `Point` at " +
        '`[address.longitude, address.latitude]` — select those fields to populate ' +
        'it; events without coordinates (online events, or coords not selected) ' +
        'return `geometry: null` and are still included. `properties` is the ' +
        'selected/populated event document verbatim (internal field names). Payload ' +
        'pagination metadata is returned as foreign members alongside `features`. ' +
        'Sets `Cache-Control: public, max-age=300, s-maxage=300`.\n\n' +
        '**Finished events are excluded.** An event is finished once its schedule ' +
        'has fully run out — `schedule.lastDate`, the end of the final ' +
        "occurrence's *local* day, is in the past — so an event running today stays " +
        'in the feed until midnight in its own timezone. Events with no fixed end ' +
        '(an open-ended recurrence) and dormant `inactive` events are never ' +
        'finished. The filter is part of the underlying read, so `totalDocs` and ' +
        'pagination reflect the filtered set, and **your `where` cannot re-include ' +
        'finished events here**.\n\n' +
        '`GET /api/events` applies the same default, but there it *can* be ' +
        'overridden: a `where` that references `schedule.lastDate` (e.g. ' +
        '`where[schedule.lastDate][less_than]=2026-01-01T00:00:00Z`) opts out and ' +
        'returns past events. `GET /api/events/{id}` is never filtered — a finished ' +
        'event still resolves, with a working `webPath` / `webUrl`, so old links ' +
        'keep opening.',
      operationId: 'eventsGeoJson',
      parameters: eventGeoJsonParameters,
      responses: {
        '200': {
          description: 'A GeoJSON FeatureCollection of events.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EventFeatureCollection' },
            },
          },
        },
        '400': errorResponse('`select` missing, or `populate` missing at `depth > 1`.'),
        '403': errorResponse('Caller is not a published API client.'),
      },
    },
  },

  '/api/events/{id}/register': {
    post: {
      tags: ['Events'],
      summary: 'Register a user for an event',
      description:
        'The Sahaj Atlas widget write path. Requires a published client key. Upserts ' +
        'the registrant `user` by normalized email (elevated access, since `users` ' +
        'is admin-only) and creates a `registration` with a fresh uuid. The event ' +
        '(`:id`) must be one the client can read (published); an event the client ' +
        'can read but whose state is closed to registration is refused with a `409` ' +
        'and a machine-readable `errors[0].code` — `external_registration`, ' +
        '`event_ended`, `registration_closed`, or `event_full`.',
      operationId: 'registerForEvent',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'ID of the event to register for.',
          schema: { type: 'integer' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/EventRegistrationRequest' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Registration created.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EventRegistrationResponse' },
            },
          },
        },
        '400': errorResponse('Invalid event id, or request body failed validation.'),
        '403': errorResponse('Caller is not a published API client.'),
        '404': errorResponse('Event not found or not open for registration.'),
        '409': errorResponse(
          'Registration refused because the event state conflicts with registering. ' +
            '`errors[0].code` is one of `external_registration`, `event_ended`, ' +
            '`registration_closed`, or `event_full`. Distinct from 404: the event exists ' +
            'and is readable (a finished event stays published), its state just conflicts.',
        ),
      },
    },
  },

  /**
   * Registered so the contract is written down and reachable from
   * `/api/openapi-raw.json`, but `clients` is in `ALWAYS_HIDDEN_COLLECTIONS`
   * (and in no project), so `filterSpec` marks this `x-internal` and the public
   * Scalar UI does not render it. That is the right outcome: this is the
   * first-party widget's telemetry channel, not a surface a third-party
   * integrator calls, and advertising it only invites forged reports.
   */
  '/api/clients/report': {
    post: {
      tags: ['Clients'],
      summary: 'Report an observed embed mount',
      description:
        'The Sahaj Atlas widget reports what it observed about the page it is ' +
        'installed on. Records accumulate keyed by **origin + pathname**, so a site ' +
        'with several embeds produces one record per mount rather than overwriting a ' +
        'single one. Requires a published client key. `url` must be origin + pathname ' +
        'only — a query string or fragment is rejected (`400`), not silently stripped, ' +
        'because the widget already strips them and a payload carrying either means it ' +
        'is misbehaving. Both the request `Origin`/`Referer` **and** the reported ' +
        '`url`’s host must be in the client’s `allowedDomains`. The report is ' +
        'observation only: it decides whether a mount currently *qualifies* as ' +
        'canonical, never which mount *is* canonical — a human sets that on the ' +
        'client. Repeating a recent identical observation is answered `updated: false` ' +
        'without a write.',
      operationId: 'clientEmbedReport',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ClientEmbedReportRequest' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Report accepted. `updated` is false when nothing changed.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClientEmbedReportResponse' },
            },
          },
        },
        '400': errorResponse(
          'Request body failed validation, or `url` was not an absolute http(s) URL of ' +
            'origin + pathname only. `errors[0].code` is `invalid_url`, ' +
            '`unsupported_scheme`, `query_or_fragment`, `credentials`, or `too_long`.',
        ),
        '403': errorResponse(
          'Caller is not a published API client, its `Origin`/`Referer` is not in the ' +
            'client’s `allowedDomains`, or the reported `url` is on a host that is not.',
        ),
      },
    },
  },

  '/api/contact-admin': {
    post: {
      tags: ['Contact'],
      summary: 'Send a message to the Sahaj Cloud admins',
      description:
        'A shared channel for a client app to send us a message on a viewer’s behalf — ' +
        'a bug report, stale venue data, or any free-text note. Requires a published ' +
        'client key and a valid Cloudflare Turnstile token; the token is verified ' +
        'server-side before any other work, and is single-use (replaying one fails). ' +
        '**Email only** — nothing is persisted and there is no admin UI, so the send ' +
        'is the entire deliverable: a delivery failure returns `502`, never a false ' +
        '`200`. When `email` is supplied it becomes the message’s `Reply-To`, so a ' +
        'reply reaches the sender directly; without it the message is anonymous and ' +
        'unanswerable. `subject` is your label for the channel (e.g. `Issue report`) ' +
        'and becomes the email subject as `[<client name>] <subject>`; `context` is a ' +
        'free bag of optional keys rendered into the email’s details block, each row ' +
        'omitted when you don’t send it. Both exist so a second client app can reuse ' +
        'this endpoint with its own framing and no schema change.',
      operationId: 'contactAdmin',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ContactAdminRequest' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Message accepted and emailed.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ContactAdminResponse' },
            },
          },
        },
        '400': errorResponse('Request body failed validation.'),
        '403': errorResponse(
          'Caller is not a published API client, its `Origin`/`Referer` is not in the ' +
            'client’s `allowedDomains`, or the Turnstile token was invalid, expired, or ' +
            'already redeemed. The captcha case — and only that case — carries ' +
            '`errors[0].code: "captcha_failed"`, so a caller can reset its widget and ' +
            'let the sender retry rather than treating the refusal as fatal.',
        ),
        '500': errorResponse('The captcha could not be verified (server-side failure).'),
        '502': errorResponse(
          'The message was accepted but the email could not be delivered. Nothing was ' +
            'stored, so the message is lost — tell the sender it did not go through.',
        ),
      },
    },
  },

  '/api/atlas/seo': {
    get: {
      tags: ['Atlas'],
      summary: 'SEO metadata and page content for one atlas route',
      description:
        'Everything a host page needs to render a single atlas route: its `<head>` ' +
        'metadata **and** the content it renders as children of `<sahaj-atlas>`, in ' +
        'one call. Pass the `?atlas=` route your page already holds — ' +
        '`/gb/london` for a region, `/gb/london/1204` for a class — and this works ' +
        'out which it names, using the same rule the widget applies to the same ' +
        'string. A route is keyed by its **terminal segment** — a region slug is ' +
        'globally unique and an event id needs no ancestry — so view segments ' +
        '(`/register`, `/share`, `/calendar`, …), legacy prefixes (`/events/…`) ' +
        'and stale ancestry all still resolve, and the `route` and `canonical` in ' +
        'the answer name the URL you should redirect to. **Things not to guess ' +
        'at:** the `alternates` locale set is **configured by an operator** on the ' +
        'Sahaj Atlas configuration global, so it can change without a deploy — ' +
        'read it from the response rather than hardcoding a list. `canonical` ' +
        'is the document’s own `webUrl`, read rather than recomputed, so it is ' +
        'byte-identical to every other surface — and it is **locale-free**, as is ' +
        'the `x-default` alternate, because nothing in the atlas is translated per ' +
        'locale (locales differ only in the widget’s own UI language, which the ' +
        '`alternates` carry as `?locale=`). `jsonLd` is **already serialized and ' +
        'escaped** for a `<script type="application/ld+json">` — emit it verbatim, ' +
        'do not re-serialize it and do not HTML-escape it again. **No HTML crosses ' +
        'this wire**: a description arrives as `content.paragraphs`, plain text, ' +
        'one entry per block. A **region has no description** in the CMS, so ' +
        '`description` is `null` and `og:description` is absent on a region route — ' +
        'write that line yourself, in your own language. `og:site_name` is ' +
        'deliberately absent for the same reason. A region’s `content.events` ' +
        'covers the region **and every region beneath it** (so a city page includes ' +
        'classes at its shared venues), capped at 50 with the true total in ' +
        '`content.eventCount`; finished classes are excluded, as they are from ' +
        '`GET /api/events/geojson`. A route naming neither a region nor an event — ' +
        'the atlas root, or a bare `/search` — is a `404`: you own your landing ' +
        'page’s metadata, and there is no document here to describe it with. ' +
        'Sets `Cache-Control: public, max-age=300, s-maxage=300`.',
      operationId: 'atlasSeo',
      parameters: [
        {
          name: 'route',
          in: 'query',
          required: true,
          description:
            'The atlas route to describe, e.g. `/gb/london` or `/gb/london/1204` — ' +
            'the value of your page’s `?atlas=` parameter. Must not carry a query ' +
            'string or fragment of its own.',
          schema: { type: 'string', minLength: 1, maxLength: 512 },
        },
        {
          name: 'locale',
          in: 'query',
          required: false,
          description:
            'Locale to render for. Defaults to `en`. Affects `og:locale` and the ' +
            'echoed `locale`; it does **not** change `canonical`, which is ' +
            'locale-free by design.',
          schema: { type: 'string', enum: LOCALES.map((l) => l.code) },
        },
      ],
      responses: {
        '200': {
          description: 'Metadata and content for the resolved region or event.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AtlasSeoResponse' },
            },
          },
        },
        '400': errorResponse('`route` is missing/too long, or `locale` is not a known locale.'),
        '403': errorResponse(
          'Caller is not a published API client, or its `Origin`/`Referer` is not in ' +
            'the client’s `allowedDomains`.',
        ),
        '404': errorResponse(
          'The route names no region or event — an unknown slug, an unpublished or ' +
            'missing event, or a route that resolves to neither (the atlas root, a ' +
            'bare view route).',
        ),
        '500': errorResponse('The metadata could not be built.'),
      },
    },
  },

  '/api/atlas/sitemap': {
    get: {
      tags: ['Atlas'],
      summary: 'Every atlas URL this client owns, for a sitemap',
      description:
        'Enumerates the atlas routes **your client owns** as the canonical URLs you ' +
        'would publish for them, so you can build a sitemap without composing atlas ' +
        'URLs yourself. Each `loc` is the document’s own `webUrl` — the identical ' +
        'value `GET /api/atlas/seo` returns as `canonical` for the `route` beside it, ' +
        'read from the identical place, so a sitemap and a page’s ' +
        '`<link rel="canonical">` can never disagree. **Do not derive this from ' +
        '`/api/regions` + `/api/events/geojson`**: that would be a second ' +
        'implementation of the URL rule, free to disagree about mount joining, ' +
        'trailing slashes and query-vs-path routing — and a sitemap that disagrees is ' +
        'a set of 404s submitted to a crawler on purpose. **Things not to guess at:** ' +
        'ownership is per-subtree with the **nearest** declaring client winning, so a ' +
        'country-level client’s answer excludes a city another client owns — those ' +
        'pages are canonically that client’s, not yours. A client that owns no subtree ' +
        'gets `{ "urls": [] }` and a `200`, **not a 404** — owning nothing is a state, ' +
        'not an error, and the count is your signal. A document whose canonical cannot ' +
        'be published (nothing in its ancestry owns it, or a blank slug in the chain) ' +
        'is **omitted**, never sent as `null`. A region with **no classes anywhere ' +
        'beneath it is still published** — regions are curated by hand rather than ' +
        'generated from a geography feed, so an empty one is a place expecting classes ' +
        'shortly, and a stable URL tells a crawler more than one that flickers in and ' +
        'out as the last class expires. **Finished classes are excluded**, as ' +
        'they are from `GET /api/events/geojson` and from a region page’s listing — ' +
        'they stay reachable by direct link, but a sitemap asks a crawler to index a ' +
        'page, and a class that no longer happens is not one to index. There is **no ' +
        'pagination**: a client owns a subtree of a corpus in the low thousands, and a ' +
        'truncated sitemap that did not say so would be worse than a slow one. ' +
        '`lastmod` is the document’s `updatedAt` — the one field you genuinely cannot ' +
        'derive. Entries are sorted by `route`, so unchanged ownership yields an ' +
        'unchanged list; `generated` is the one field that moves between two otherwise ' +
        'identical answers, so diff `urls` rather than the whole body. Unlike ' +
        '`/api/atlas/seo`, **this answer is per-client**; it ' +
        'is cached on `Vary: Authorization`, so each API key gets its own variant. ' +
        'Sets `Cache-Control: public, max-age=300, s-maxage=300`.',
      operationId: 'atlasSitemap',
      parameters: [],
      responses: {
        '200': {
          description:
            'Every canonical URL this client owns. Empty `urls` when it owns no subtree.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AtlasSitemapResponse' },
            },
          },
        },
        '403': errorResponse(
          'Caller is not a published API client, or its `Origin`/`Referer` is not in ' +
            'the client’s `allowedDomains`.',
        ),
        '500': errorResponse('The sitemap could not be built.'),
      },
    },
  },

  '/api/audiences/for-user': {
    get: {
      tags: ['Audiences'],
      summary: 'Resolve eligible audience IDs for a user',
      description:
        'Resolves the Audiences a user qualifies for based on progress data ' +
        '(path step, meditation/lecture counts) and context (country, timezone). ' +
        'All six query params are required. Returns the combined IDs of matching ' +
        'progress and context audiences. ' +
        'Progress audiences are evaluated via a SQL WHERE query. ' +
        'Context audiences (country gate) are fetched and JS-filtered. ' +
        'Mobile clients call this once per state change and pass the result ' +
        'as `audiences` to the `/for-audience` data endpoints, keeping those ' +
        'endpoints edge-cacheable. ' +
        'IDs are returned sorted ascending for byte-stable responses. ' +
        'Sets `Cache-Control: public, max-age=300, s-maxage=300`.',
      operationId: 'audiencesForUser',
      parameters: [...audienceQueryParameters],
      responses: {
        '200': {
          description: 'List of eligible audience IDs.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AudienceIdList' },
            },
          },
        },
        '400': errorResponse('Query param validation failed.'),
        '403': errorResponse('Caller is not an active API client.'),
      },
    },
  },

  '/api/lectures/for-audience': {
    get: {
      tags: ['Lectures'],
      summary: 'Audience-targeted lecture feed',
      description:
        'Returns a feed of lectures whose attached audiences overlap the ' +
        'supplied `audiences` ID list (OR semantics). Lectures with ' +
        '`priority > 0` are always returned first, sorted by priority ' +
        'descending; ties within a priority level are randomised. The ' +
        'remaining lectures (priority ≤ 0) are returned in random order. ' +
        'Each lecture is shaped into a flat, player-ready record matching ' +
        '`LecturePlayerData`. Records carrying `startTime`/`stopTime` denote ' +
        'a playback window within the lecture; `fullLectureId` (when set) ' +
        'points at a related lecture for editorial grouping. ' +
        'Resolve `audiences` first via `GET /api/audiences/for-user`; this ' +
        'endpoint sets `Cache-Control: public, max-age=600, s-maxage=600`.',
      operationId: 'lecturesForAudience',
      parameters: [audiencesIdsParam, forAudienceLimitParam(100)],
      responses: {
        '200': jsonDocsResponse('#/components/schemas/LecturePlayerData'),
        '400': errorResponse('Query param validation failed.'),
        '403': errorResponse('Caller is not an active API client.'),
      },
    },
  },

  '/api/app-cards/for-audience': {
    get: {
      tags: ['App Cards'],
      summary: 'Audience-targeted app cards',
      description:
        'Returns published app cards targeting the requested `targetSection`, ' +
        'filtered to those whose `audiences` overlap the supplied list (OR ' +
        'semantics), and further restricted to cards whose `conditions` are ' +
        'all present in the supplied list (AND semantics — all condition ' +
        'audience IDs on the card must appear in `audiences`; cards with no ' +
        'conditions pass automatically). Results are weighted-random sampled ' +
        'by `weight`. ' +
        'Resolve `audiences` first via `GET /api/audiences/for-user`; this ' +
        'endpoint sets `Cache-Control: public, max-age=600, s-maxage=600`.',
      operationId: 'appCardsForAudience',
      parameters: [
        audiencesIdsParam,
        {
          name: 'targetSection',
          in: 'query',
          required: true,
          description: 'Section of the app where the card will be shown.',
          schema: { type: 'string', enum: ['hero', 'highlights', 'lectures'] },
        },
        forAudienceLimitParam(20),
      ],
      responses: {
        '200': jsonDocsResponse('#/components/schemas/AppCards'),
        '400': errorResponse('Query param validation failed.'),
        '403': errorResponse('Caller is not an active API client.'),
      },
    },
  },

  '/api/meditations/{id}/related-lectures': {
    get: {
      tags: ['Meditations'],
      summary: 'Lectures related to a meditation',
      description:
        'Returns lectures contextually relevant to a meditation, ranked by ' +
        "the topical overlap between the meditation's on-screen chakras " +
        "(its frames' `subtleSystemNodes`, weighted by on-screen seconds) " +
        "and each lecture's tagged `subtleSystemNodes`. " +
        'By default, lectures with no chakra overlap are excluded — they ' +
        'have no relevance signal. ' +
        'When `userChoice` is set, candidates expand to lectures that ' +
        'either carry that tag OR have positive chakra overlap (OR ' +
        'semantics). Results are split into two groups: Group 1 — ' +
        'userChoice-tagged lectures (weight DESC, id ASC, including ' +
        'zero-overlap ones); Group 2 — non-tagged lectures with positive ' +
        'overlap (weight DESC, id ASC). ' +
        'Pass `audiences` (resolved via `GET /api/audiences/for-user`) to ' +
        'restrict the candidate pool to lectures eligible for this viewer. ' +
        'Use `excludedLectureIds` to omit already-watched lectures. ' +
        'When no lecture matches the relevance criteria, the response falls ' +
        'back to the generic audience feed (same selection as ' +
        '`GET /api/lectures/for-audience`); the `source` field reports which ' +
        'strategy was used, and `excludedLectureIds` are relaxed only if they ' +
        'would otherwise leave the feed empty. ' +
        'This endpoint sets `Cache-Control: public, max-age=600, s-maxage=600`.',
      operationId: 'meditationLectures',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'ID of the meditation whose context drives the ranking.',
          schema: { type: 'string' },
        },
        audiencesIdsParam,
        forAudienceLimitParam(100),
        {
          name: 'userChoice',
          in: 'query',
          required: false,
          description:
            'Optional ID of a UserChoices doc. Expands candidates to ' +
            'lectures that either carry this tag OR have positive ' +
            'subtle-system-node overlap with the meditation (OR semantics). ' +
            'Tagged lectures are returned first as a group (weight DESC, ' +
            'including zero-weight); non-tagged positive-overlap lectures ' +
            'follow.',
          schema: { type: 'integer' },
        },
        {
          name: 'excludedLectureIds',
          in: 'query',
          required: false,
          description:
            'Comma-separated lecture IDs to exclude (e.g. lectures the ' +
            'user has already watched).',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description:
            'Related lectures. `source` is `relevance` when `docs` are ranked ' +
            'by chakra overlap, or `audience-fallback` when nothing matched and ' +
            '`docs` come from the generic audience feed instead. `relevanceCount` ' +
            'is the number of leading `docs` that are genuine relevance matches ' +
            '(equals `docs.length` for `relevance`, `0` for `audience-fallback`).',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['docs', 'source', 'relevanceCount'],
                properties: {
                  docs: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/LecturePlayerData' },
                  },
                  source: {
                    type: 'string',
                    enum: ['relevance', 'audience-fallback'],
                    description: 'Which selection strategy produced `docs`.',
                  },
                  relevanceCount: {
                    type: 'integer',
                    description: 'Number of leading `docs` that are genuine relevance matches.',
                  },
                },
              },
            },
          },
        },
        '400': errorResponse('Query param validation failed.'),
        '403': errorResponse('Caller is not an active API client.'),
        '404': errorResponse('Meditation not found.'),
      },
    },
  },

  '/api/meditations/{id}/songs': {
    get: {
      tags: ['Meditations'],
      summary: 'Background-music songs for a meditation',
      description:
        'Returns the songs offered as background music for a meditation: every ' +
        "song tagged with the meditation's single `songTag` that is flagged " +
        '`includeForMeditations`, returned in randomized order (the set is ' +
        'deterministic for a fixed meditation; only ordering varies). Capped at ' +
        'an internal limit of 100 — there is no client-facing `limit` param. ' +
        'Each song is trimmed to `id`, `title`, `url`, and `tags` (an array of ' +
        'song-tag IDs); the `select` query param narrows the response within ' +
        'that allowlist (`id` is always present). A meditation with no `songTag` ' +
        'returns an empty paginated response. The body matches the built-in ' +
        'Payload list shape (`docs` plus pagination metadata).',
      operationId: 'meditationSongs',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'ID of the meditation whose background-music songs to fetch.',
          schema: { type: 'string' },
        },
        {
          name: 'select',
          in: 'query',
          required: false,
          description:
            'Optional Payload REST bracket-notation select to narrow the ' +
            'returned fields within the `{ id, title, url, tags }` allowlist, ' +
            'e.g. `?select[title]=true`. Out-of-allowlist keys are ignored; ' +
            '`id` is always returned; omitting `select` returns all four fields.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': paginatedDocsResponse(
          '#/components/schemas/MeditationSong',
          'Paginated list of background-music songs (randomized order).',
        ),
        '400': errorResponse('Missing or invalid meditation id.'),
        '403': errorResponse('Caller is not an active API client.'),
        '404': errorResponse('Meditation not found.'),
      },
    },
  },

  '/api/lectures/{id}/related-meditations': {
    get: {
      tags: ['Lectures'],
      summary: 'Meditations related to a lecture',
      description:
        'Returns daily meditations contextually relevant to a lecture, ranked by ' +
        "the topical overlap between the lecture's tagged `subtleSystemNodes` and " +
        "each candidate meditation's cached on-screen node weights " +
        '(`subtleSystemNodeWeights`). The mirror of ' +
        '`GET /api/meditations/{id}/related-lectures`. Zero-overlap meditations are ' +
        'dropped; if fewer than `limit` relevance matches survive shaping, the ' +
        'remaining slots are topped up with daily meditations by recency ' +
        '(`createdAt` DESC). Each result is a flat `MeditationCardData` card — the ' +
        'response shape is fixed, so there are no `select`/`populate` params (unlike ' +
        'passthrough endpoints such as `/api/events/geojson`). Sets ' +
        '`Cache-Control: public, max-age=600, s-maxage=600`.',
      operationId: 'lectureRelatedMeditations',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'ID of the lecture whose context drives the ranking.',
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          required: true,
          description: 'Maximum number of meditation cards to return (1–100).',
          schema: { type: 'integer', minimum: 1, maximum: 100 },
        },
        {
          name: 'excludedMeditationIds',
          in: 'query',
          required: false,
          description:
            'Comma-separated meditation IDs to exclude (e.g. meditations the user ' +
            'has already seen), e.g. `3,4,5`.',
          schema: { type: 'string', pattern: '^\\d+(,\\d+)*$' },
        },
      ],
      responses: {
        '200': {
          description:
            'Related meditations. `source` is `relevance` when every card is a ' +
            'genuine topical-overlap match, or `fallback` when recency top-ups were ' +
            'mixed in (or relevance matched nothing). `relevanceCount` is the number ' +
            'of leading `docs` that are genuine relevance matches (equals ' +
            '`docs.length` when `source` is `relevance`; `0` when relevance matched ' +
            'nothing).',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['docs', 'source', 'relevanceCount'],
                properties: {
                  docs: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/MeditationCardData' },
                  },
                  source: {
                    type: 'string',
                    enum: ['relevance', 'fallback'],
                    description: 'Which selection strategy produced `docs`.',
                  },
                  relevanceCount: {
                    type: 'integer',
                    description: 'Number of leading `docs` that are genuine relevance matches.',
                  },
                },
              },
            },
          },
        },
        '400': errorResponse('Missing lecture id, or query param validation failed.'),
        '403': errorResponse('Caller is not an active API client.'),
        '404': errorResponse('Lecture not found.'),
      },
    },
  },
}

// ── Schema definitions ────────────────────────────────────────────────────────

/**
 * Hand-authored schemas referenced by `CUSTOM_ENDPOINT_PATHS`. `Frames` and
 * `AppCards` are already produced by `payload-oapi` (camelized collection
 * slug).
 *
 * Keep `LecturePlayerData` in lockstep with the matching type in
 * `src/lib/lectures/lectureShape.ts` and the shapers in
 * `src/collections/Lectures/endpoints/forAudience.ts` /
 * `src/collections/Meditations/endpoints/lectures.ts` — kept in sync by hand
 * (the `api-explorer.int.spec.ts` shape test that used to enforce this was
 * removed in the #434 audit). `additionalProperties: false` keeps the shape
 * tight so accidental fields are rejected.
 */
export const CUSTOM_ENDPOINT_SCHEMAS: Record<string, OpenAPISchemaObject> = {
  /**
   * Response shape for `GET /api/audiences/for-user`. Sorted ascending so
   * the body is byte-stable across calls.
   */
  AudienceIdList: {
    type: 'object',
    additionalProperties: false,
    required: ['audiences'],
    properties: {
      audiences: {
        type: 'array',
        items: { type: 'integer' },
      },
    },
  },
  LecturePlayerData: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'hlsUrl',
      'thumbnailUrl',
      'subtitles',
      'startTime',
      'stopTime',
      'duration',
      'fullLectureId',
    ],
    properties: {
      id: { type: 'integer' },
      title: { type: ['string', 'null'] },
      hlsUrl: { type: 'string' },
      thumbnailUrl: { type: ['string', 'null'] },
      subtitles: lectureSubtitleUrlsSchema,
      startTime: { type: 'number' },
      stopTime: { type: ['number', 'null'] },
      duration: { type: ['number', 'null'] },
      fullLectureId: { type: ['integer', 'null'] },
    },
  },
  /**
   * Flat, card-ready meditation returned by `GET /api/lectures/{id}/related-meditations`.
   * Keep in lockstep with `MeditationCardData` in `src/lib/meditations/meditationShape.ts` —
   * the shaper drops any meditation missing `title` / `durationMinutes` / a thumbnail URL,
   * so those three are always present (non-null); `narratorName` is best-effort (nullable).
   * `additionalProperties: false` keeps the shape tight so no other Meditation field leaks.
   */
  MeditationCardData: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'title', 'durationMinutes', 'thumbnailUrl', 'narratorName'],
    properties: {
      id: { type: 'integer' },
      title: { type: 'string' },
      durationMinutes: { type: 'number' },
      thumbnailUrl: { type: 'string' },
      narratorName: { type: ['string', 'null'] },
    },
  },
  /**
   * Trimmed song doc returned by `GET /api/meditations/{id}/songs`. `url` is the
   * virtual R2 file URL; `tags` is an array of song-tag IDs (depth: 0). Keep in
   * lockstep with the allowlist in `src/collections/Meditations/endpoints/songs.ts`.
   * `additionalProperties: false` keeps the shape tight so no other Song field leaks.
   */
  MeditationSong: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'integer' },
      title: { type: ['string', 'null'] },
      url: { type: ['string', 'null'] },
      tags: {
        type: 'array',
        items: { type: 'integer' },
      },
    },
  },
  /** GeoJSON Point; `coordinates` is `[longitude, latitude]` (lon-first axis order). */
  GeoJsonPoint: {
    type: 'object',
    required: ['type', 'coordinates'],
    properties: {
      type: { type: 'string', enum: ['Point'] },
      coordinates: {
        type: 'array',
        description: '[longitude, latitude]',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
      },
    },
  },
  /**
   * One feature in `GET /api/events/geojson`. `geometry` is a Point when the
   * event's coordinates were selected and set, else `null`. `properties` is the
   * selected/populated event document verbatim — its field set is driven by the
   * request's `select`/`populate`/`depth`, so it's an open object.
   */
  EventFeature: {
    type: 'object',
    required: ['type', 'id', 'geometry', 'properties'],
    properties: {
      type: { type: 'string', enum: ['Feature'] },
      id: { type: 'integer' },
      geometry: { oneOf: [{ $ref: '#/components/schemas/GeoJsonPoint' }, { type: 'null' }] },
      properties: {
        type: 'object',
        additionalProperties: true,
        description:
          'The selected/populated event document verbatim (field set varies by select/populate/depth).',
      },
    },
  },
  /**
   * `GET /api/events/geojson` response: a GeoJSON FeatureCollection plus Payload
   * pagination metadata as foreign members (the same fields `GET /api/events`
   * returns alongside `docs`).
   */
  EventFeatureCollection: {
    type: 'object',
    required: ['type', 'features'],
    properties: {
      type: { type: 'string', enum: ['FeatureCollection'] },
      features: { type: 'array', items: { $ref: '#/components/schemas/EventFeature' } },
      totalDocs: { type: 'integer' },
      limit: { type: 'integer' },
      totalPages: { type: 'integer' },
      page: { type: 'integer' },
      pagingCounter: { type: 'integer' },
      hasPrevPage: { type: 'boolean' },
      hasNextPage: { type: 'boolean' },
      prevPage: { type: ['integer', 'null'] },
      nextPage: { type: ['integer', 'null'] },
    },
  },
  /** `POST /api/events/{id}/register` request body. */
  EventRegistrationRequest: {
    type: 'object',
    required: ['email', 'name'],
    properties: {
      email: { type: 'string', format: 'email' },
      name: { type: 'string', minLength: 1 },
      startingAt: {
        type: 'string',
        format: 'date-time',
        description: 'ISO 8601 datetime the registrant will attend.',
      },
      questions: {
        type: 'object',
        additionalProperties: true,
        description: 'Raw registrant answers (questions / experience / aspirations / referral).',
      },
      subscribe: {
        type: 'boolean',
        description:
          'Mailing-list consent (opt-in). When true, the registration is stamped with ' +
          '`mailingListSubscribedAt`; absent/false records no consent.',
      },
      locale: {
        type: 'string',
        enum: [...LOCALES.map((locale) => locale.code)],
        description:
          "The registrant's language, used to localize the confirmation email (and later " +
          'reminders). Must be one of the configured app locales; an unknown code is ' +
          'rejected with a 400. Defaults to `en`.',
      },
    },
  },
  /** `POST /api/events/{id}/register` success body. */
  EventRegistrationResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'registration'],
    properties: {
      ok: { type: 'boolean', enum: [true] },
      registration: {
        type: 'object',
        required: ['id', 'uuid'],
        properties: {
          id: { type: 'integer' },
          uuid: { type: 'string' },
        },
      },
    },
  },
  /**
   * `POST /api/clients/report` request body. The enums are sourced from the
   * collection's own constants, so adding an embed mode or routing mode updates
   * the spec for free rather than drifting from the Zod schema in
   * `src/collections/Clients/endpoints/report.ts`.
   */
  ClientEmbedReportRequest: {
    type: 'object',
    additionalProperties: false,
    required: [
      'origin',
      'pathname',
      'mode',
      'topLevel',
      'urlWritable',
      'paramPersisted',
      'routing',
    ],
    properties: {
      origin: {
        type: 'string',
        maxLength: MAX_MOUNT_KEY_LENGTH,
        description:
          'Bare origin of the host page, e.g. `https://sahajayoga.nl`. No path, query or fragment.',
      },
      pathname: {
        type: 'string',
        maxLength: MAX_MOUNT_KEY_LENGTH,
        description:
          'Path of the host page, e.g. `/locatelessons`. No query string or fragment — the one ' +
          'exception is a WordPress default permalink, `?p=<digits>`, which is kept because such ' +
          'sites cannot name their page any other way.',
      },
      mode: {
        type: 'string',
        enum: [...EMBED_MODES],
        description:
          '`iframe` when the widget is running inside a frame it did not create, ' +
          '`inline` when it rendered directly into the host document.',
      },
      topLevel: {
        type: 'boolean',
        description: 'Whether the widget is running in the top-level browsing context.',
      },
      urlWritable: {
        type: 'boolean',
        description: 'Whether the widget can write to the host page’s URL.',
      },
      paramPersisted: {
        type: 'boolean',
        description: 'Whether a written URL parameter survived a reload of the host page.',
      },
      routing: {
        type: 'string',
        enum: [...ROUTING_MODES],
        description: 'How the widget encodes its state into that URL. There is no `hash` option.',
      },
    },
  },
  /** `POST /api/clients/report` success body. */
  ClientEmbedReportResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'mounts', 'updated'],
    properties: {
      ok: { type: 'boolean', enum: [true] },
      mounts: {
        type: 'integer',
        description: 'Distinct mounts stored for this service after the merge.',
      },
      updated: {
        type: 'boolean',
        description: 'False when the report repeated a recent, identical observation.',
      },
    },
  },
  /**
   * `POST /api/contact-admin` request body. Keep in lockstep with
   * `ContactAdminRequest` in `src/endpoints/responseTypes.ts` and the Zod schema
   * in `src/endpoints/contactAdmin.ts` — the bounds are the contract, since a
   * public caller can otherwise post unbounded JSON.
   */
  ContactAdminRequest: {
    // No `additionalProperties: false` — unknown keys are *stripped*, not
    // rejected, so a newer caller sending a key this server doesn't know yet
    // still gets its message through.
    type: 'object',
    required: ['message', 'turnstileToken'],
    properties: {
      message: {
        type: 'string',
        minLength: 10,
        maxLength: 5000,
        description: 'The sender’s message. Trimmed; whitespace-only bodies are rejected.',
      },
      turnstileToken: {
        type: 'string',
        maxLength: 2048,
        description: 'Cloudflare Turnstile token from your captcha widget. Single-use.',
      },
      email: {
        type: 'string',
        format: 'email',
        maxLength: 254,
        description:
          'The sender’s address. Becomes the email’s `Reply-To`; omit for an anonymous ' +
          'message, which cannot be replied to.',
      },
      subject: {
        type: 'string',
        maxLength: 200,
        description:
          'Your label for this channel, e.g. `Issue report`. The email subject is ' +
          '`[<client name>] <subject>`; defaults to `Message`.',
      },
      context: {
        type: 'object',
        description:
          'Optional context rendered into the email’s details block. Every key is ' +
          'optional and each row is omitted when its value is absent.',
        properties: {
          path: { type: 'string', maxLength: 500, description: 'Route the sender was on.' },
          hostUrl: {
            type: 'string',
            maxLength: 500,
            description: 'Absolute URL of the host page.',
          },
          locale: { type: 'string', maxLength: 20, description: 'Locale the sender was using.' },
          error: {
            type: 'string',
            maxLength: 2000,
            description: 'Error text/stack being reported.',
          },
          userAgent: { type: 'string', maxLength: 500, description: 'The sender’s user agent.' },
        },
      },
    },
  },
  /** `POST /api/contact-admin` success body. Nothing is persisted, so there's nothing to return. */
  ContactAdminResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: {
      ok: { type: 'boolean', enum: [true] },
    },
  },
  /** One `<link rel="alternate">` row from `GET /api/atlas/seo`. */
  AtlasSeoAlternate: {
    type: 'object',
    additionalProperties: false,
    required: ['hreflang', 'href'],
    properties: {
      hreflang: {
        type: 'string',
        // The CMS locale set, which is the *superset* this can draw from. The
        // effective list is operator-configured on the `sy-atlas-config`
        // global, so it is runtime data and this statically-built spec cannot
        // name it — read `alternates` to see what a given page actually offers.
        enum: [...LOCALES.map((l) => l.code), 'x-default'],
        description:
          'An enabled atlas locale, or `x-default` — which points at the bare, ' +
          'locale-free canonical rather than at English. The enabled set is ' +
          'configured by an operator and can change without a deploy; this enum ' +
          'is the superset it is drawn from.',
      },
      href: { type: 'string', format: 'uri' },
    },
  },
  /** One rung of the region ancestry, root first. */
  AtlasSeoBreadcrumb: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'route', 'url'],
    properties: {
      name: { type: 'string' },
      route: { type: 'string', description: 'Atlas route for that rung, e.g. `/gb/london`.' },
      url: {
        type: ['string', 'null'],
        description:
          'Canonical URL for that rung. Resolved per rung, because ownership is ' +
          'per-subtree — `/gb` and `/gb/greater-london` can be different domains. ' +
          '`null` when no owner can publish one.',
      },
    },
  },
  /** A postal address, plus the one-line rendering most hosts display. */
  AtlasSeoAddress: {
    type: 'object',
    additionalProperties: false,
    required: [
      'venueName',
      'street',
      'room',
      'city',
      'region',
      'postCode',
      'country',
      'latitude',
      'longitude',
      'oneLine',
    ],
    properties: {
      venueName: { type: ['string', 'null'] },
      street: { type: ['string', 'null'] },
      room: { type: ['string', 'null'] },
      city: { type: ['string', 'null'] },
      region: { type: ['string', 'null'] },
      postCode: { type: ['string', 'null'] },
      country: { type: ['string', 'null'] },
      latitude: { type: ['number', 'null'] },
      longitude: { type: ['number', 'null'] },
      oneLine: {
        type: 'string',
        description: '`street, room, city, region, country postCode` — blank parts dropped.',
      },
    },
  },
  /** When a class happens, in renderable and machine-readable form. */
  AtlasSeoSchedule: {
    type: 'object',
    additionalProperties: false,
    required: [
      'oneLine',
      'startDate',
      'endDate',
      'timezone',
      'recurrence',
      'weekdays',
      'endTime',
      'inactive',
    ],
    properties: {
      oneLine: {
        type: 'string',
        description:
          'e.g. `Every week on Saturday at 9:26 AM`. Empty for a dormant class, ' +
          'which by definition has no active schedule.',
      },
      startDate: { type: ['string', 'null'], format: 'date-time' },
      endDate: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'End of the final occurrence; `null` for an open-ended recurrence.',
      },
      timezone: { type: ['string', 'null'], description: 'IANA zone for the wall-clock times.' },
      recurrence: { type: ['string', 'null'], enum: ['DAILY', 'WEEKLY', 'MONTHLY', null] },
      weekdays: {
        type: 'array',
        items: { type: 'string', enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] },
        description: 'Empty unless the class recurs weekly.',
      },
      endTime: { type: ['string', 'null'], description: '`HH:MM` local end time, when declared.' },
      inactive: { type: 'boolean', description: 'True for a dormant class.' },
    },
  },
  /** An image, ready for `og:image` or an `<img>` in the rendered children. */
  AtlasSeoImage: {
    type: 'object',
    additionalProperties: false,
    required: ['url', 'alt'],
    properties: {
      url: { type: 'string', format: 'uri' },
      alt: { type: ['string', 'null'] },
    },
  },
  /** One class in a region's listing. */
  AtlasSeoEventCard: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'route', 'url', 'title', 'schedule', 'address', 'online'],
    properties: {
      id: { type: 'integer' },
      route: { type: ['string', 'null'], description: 'e.g. `/gb/london/1204`.' },
      url: { type: ['string', 'null'], description: 'Canonical URL for that route.' },
      title: { type: 'string' },
      schedule: { type: 'string', description: 'One-line schedule.' },
      address: { type: 'string', description: 'One-line address; empty for an online class.' },
      online: { type: 'boolean' },
    },
  },
  /** Body content for an event route. */
  AtlasSeoEventContent: {
    type: 'object',
    additionalProperties: false,
    required: [
      'title',
      'languages',
      'schedule',
      'address',
      'onlineUrl',
      'website',
      'paragraphs',
      'images',
    ],
    properties: {
      title: { type: 'string' },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'ISO 639-1 codes the class is conducted in.',
      },
      schedule: { $ref: '#/components/schemas/AtlasSeoSchedule' },
      address: {
        oneOf: [{ $ref: '#/components/schemas/AtlasSeoAddress' }, { type: 'null' }],
        description: '`null` for an online class.',
      },
      onlineUrl: { type: ['string', 'null'] },
      website: { type: ['string', 'null'] },
      paragraphs: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The description as plain text, one entry per block, ready to wrap in ' +
          'your own markup. **No HTML is emitted** — a consumer that echoes this ' +
          'into a template without a sanitizer is safe by construction.',
      },
      images: { type: 'array', items: { $ref: '#/components/schemas/AtlasSeoImage' } },
    },
  },
  /** Body content for a region route. */
  AtlasSeoRegionContent: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'subtitle', 'level', 'events', 'eventCount'],
    properties: {
      name: { type: 'string' },
      subtitle: { type: ['string', 'null'] },
      level: { type: 'string', enum: ['country', 'region', 'city', 'venue'] },
      events: {
        type: 'array',
        items: { $ref: '#/components/schemas/AtlasSeoEventCard' },
        description:
          'Classes in this region **and every region beneath it**, so a city page ' +
          'includes classes at its shared venues. Capped at 50.',
      },
      eventCount: {
        type: 'integer',
        description: 'The true total, which `events` may be capped below.',
      },
    },
  },
  /**
   * `GET /api/atlas/seo` success body. Keep in lockstep with `AtlasSeoResponse`
   * in `src/endpoints/responseTypes.ts` — a discriminated union on `type`, so a
   * consumer narrows once and gets that variant's content shape rather than a
   * flat object half of whose fields are null on any given route.
   */
  AtlasSeoResponse: {
    type: 'object',
    required: [
      'type',
      'id',
      'route',
      'locale',
      'title',
      'description',
      'canonical',
      'alternates',
      'openGraph',
      'jsonLd',
      'breadcrumbs',
      'content',
    ],
    properties: {
      type: { type: 'string', enum: ['region', 'event'] },
      id: { type: 'integer' },
      route: {
        type: 'string',
        description:
          'The normalized route this answer describes — the document’s own path, ' +
          'so a legacy or stale prefix is answered with the route it should use.',
      },
      locale: { type: 'string' },
      title: {
        type: 'string',
        description:
          'The document’s own name — a region’s is qualified by its country, since ' +
          'region names collide across the tree. Append your own site name; we ' +
          'compose no prose, because nothing here is translated and an invented ' +
          'sentence would be English in somebody else’s `<head>`.',
      },
      description: {
        type: ['string', 'null'],
        description:
          'Plain-text meta description, bounded to ~160 characters. `null` on a ' +
          'region route — a region carries no description in the CMS. For an event ' +
          'with no description of its own, this falls back to its schedule and ' +
          'address, which are data rather than prose.',
      },
      canonical: {
        type: ['string', 'null'],
        description:
          'The document’s own `webUrl`, read and never recomputed, and locale-free. ' +
          '`null` when no owning client can publish one.',
      },
      alternates: {
        type: 'array',
        items: { $ref: '#/components/schemas/AtlasSeoAlternate' },
        description: 'The widget’s locales plus `x-default`. Empty when there is no canonical.',
      },
      openGraph: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description:
          'Open Graph properties keyed by their `property` attribute, so you can ' +
          'emit them in a loop. `og:site_name` is absent — you know what site you ' +
          'are, and we don’t.',
      },
      jsonLd: {
        type: 'string',
        description:
          'A complete JSON-LD document, already serialized and escaped for direct ' +
          'embedding in `<script type="application/ld+json">`. `<`, `>`, `&` and ' +
          'the two Unicode line separators are escaped here, once, so a ' +
          'CMS-authored string containing `</script>` or `<!--` cannot break out. ' +
          'Emit it verbatim.',
      },
      breadcrumbs: {
        type: 'array',
        items: { $ref: '#/components/schemas/AtlasSeoBreadcrumb' },
        description: 'Region ancestry, root first, ending at this page.',
      },
      content: {
        oneOf: [
          { $ref: '#/components/schemas/AtlasSeoRegionContent' },
          { $ref: '#/components/schemas/AtlasSeoEventContent' },
        ],
        description: 'Keyed by `type`: a region’s listing, or an event’s facts.',
      },
    },
  },
  /** One `<url>` element from `GET /api/atlas/sitemap`. */
  AtlasSitemapUrl: {
    type: 'object',
    required: ['loc', 'lastmod', 'route'],
    properties: {
      loc: {
        type: 'string',
        description:
          'The canonical URL to publish — byte-identical to the `canonical` that ' +
          '`GET /api/atlas/seo` returns for the `route` beside it, because both are ' +
          'the document’s own `webUrl`, read rather than recomputed.',
      },
      lastmod: {
        type: 'string',
        format: 'date-time',
        description: 'When the document was last edited — its `updatedAt`.',
      },
      route: {
        type: 'string',
        description:
          'The atlas route this URL is of, e.g. `/nl/amsterdam` — the `?atlas=` value ' +
          'to pass back to `GET /api/atlas/seo`.',
      },
    },
  },
  /**
   * `GET /api/atlas/sitemap` success body. Keep in lockstep with
   * `AtlasSitemapResponse` in `src/endpoints/responseTypes.ts`.
   */
  AtlasSitemapResponse: {
    type: 'object',
    required: ['generated', 'urls'],
    properties: {
      generated: {
        type: 'string',
        format: 'date-time',
        description: 'When this answer was built.',
      },
      urls: {
        type: 'array',
        items: { $ref: '#/components/schemas/AtlasSitemapUrl' },
        description:
          'Every URL this client owns, ascending by `route`. Empty — not a 404 — when ' +
          'the client owns no region subtree. Unpaginated.',
      },
    },
  },
  /**
   * Shape of 4xx response bodies emitted by the custom endpoints. Zod errors
   * use `{ errors: ZodIssue[] }` (each issue has at minimum `message` + `path`);
   * framesByNarrator's 404 emits `{ errors: [{ message }] }`. Both flow through
   * this schema — `path` is declared optional to cover the narrator-not-found
   * case.
   */
  ErrorResponse: {
    type: 'object',
    required: ['errors'],
    properties: {
      errors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            path: {
              type: 'array',
              items: { type: ['string', 'integer'] },
            },
            code: { type: 'string' },
          },
        },
      },
    },
  },
}
