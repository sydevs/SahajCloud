/**
 * Custom Endpoint OpenAPI Shims
 *
 * `payload-oapi` v0.2.5 does not generate path entries for custom Payload
 * collection endpoints (the ones defined in `src/endpoints/*` and wired via
 * a collection's `endpoints` array). This module hand-writes those path
 * definitions so they appear in the Scalar docs alongside the auto-generated
 * CRUD endpoints.
 *
 * Consumers:
 *   - `src/app/(payload)/api/openapi.json/route.ts` merges these into the
 *     spec between `generateV31Spec` and `filterSpec`.
 *   - `tests/int/api-explorer.int.spec.ts` asserts the shape is kept in sync
 *     with the actual handler return types and query params.
 *
 * When `payload-oapi` ships native custom-endpoint support, delete this
 * module and the merge block in the route handler.
 */

import { LOCALES } from '@/lib/locales'

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
        '404': errorResponse('Narrator not found.'),
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
        '200': jsonDocsResponse('#/components/schemas/LecturePlayerData'),
        '307': {
          description:
            'Redirects to the same endpoint without `excludedLectureIds` and ' +
            'with `limit=1` when all eligible lectures have been excluded. ' +
            'Follow the `Location` header to retrieve the fallback result.',
          headers: {
            Location: {
              description:
                'Fallback URL — same path and query params without `excludedLectureIds`, ' +
                'with `limit=1` and `audiences` normalised to the canonical sorted form.',
              schema: { type: 'string', format: 'uri' },
            },
          },
        },
        '400': errorResponse('Query param validation failed.'),
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
        '404': errorResponse('Meditation not found.'),
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
 * `src/endpoints/lecturesForAudience.ts` /
 * `src/endpoints/meditationLectures.ts` — the `api-explorer.int.spec.ts`
 * shape test is the tripwire. `additionalProperties: false` keeps the
 * shape tight so accidental fields are rejected.
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
