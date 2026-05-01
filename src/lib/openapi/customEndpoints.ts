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
 *     with `AUDIENCE_DEFINITIONS` and with the actual handler return types.
 *
 * When `payload-oapi` ships native custom-endpoint support, delete this
 * module and the merge block in the route handler.
 */

import { AUDIENCE_DEFINITIONS } from '@/collections/tags/Audiences'
import type { RuleDefinition } from '@/fields/rulesField'
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
}

// ── Audience query-param generator ────────────────────────────────────────────

/**
 * Maps a `RuleDefinition` to its OpenAPI 3.1 schema. Mirrors the Zod shape
 * produced by `buildAudienceDataShape` in `src/fields/rulesField.ts` — the
 * two must stay in lockstep so docs match runtime validation.
 *
 * Boolean-type caveat: the Zod shape currently accepts only the strings
 * `'true'` / `'false'` (`z.enum(['true', 'false'])`), while this OpenAPI
 * schema reports `type: 'boolean'`. Scalar and most generators serialize
 * boolean query params as literal `true`/`false` strings, so the two line
 * up today. If a generator emits `1`/`0` instead, Zod will reject the
 * request. There are no boolean rules in `AUDIENCE_DEFINITIONS` today; when
 * one is added, widen the Zod shape to accept numeric encodings too.
 */
function ruleToSchema(rule: RuleDefinition): OpenAPISchemaObject {
  switch (rule.type) {
    case 'range':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'select': {
      const schema: OpenAPISchemaObject = { type: 'string' }
      if (rule.options && rule.options.length > 0) {
        schema.enum = rule.options.map((opt) => opt.value)
      }
      return schema
    }
  }
}

/**
 * Produces one required query parameter per entry in `AUDIENCE_DEFINITIONS`.
 * Required matches the runtime contract (`buildAudienceDataShape` emits
 * non-optional Zod schemas), and the per-rule `description` is sourced from
 * `RuleDefinition.description` so the Scalar docs explain each input in the
 * same words as the admin UI. Generated at module load so adding a new rule
 * flows through automatically — the test `audience params stay in sync with
 * AUDIENCE_DEFINITIONS` in `api-explorer.int.spec.ts` fails loudly if this
 * drifts.
 */
const audienceQueryParameters: OpenAPIParameter[] = AUDIENCE_DEFINITIONS.map((rule) => ({
  name: rule.name,
  in: 'query',
  required: true,
  description:
    rule.description ??
    `Audience targeting input (${rule.type}) — evaluated against each doc's attached audiences.`,
  schema: ruleToSchema(rule),
}))

// ── Shared response fragments ─────────────────────────────────────────────────

const forAudienceLimitParam = (max: number): OpenAPIParameter => ({
  name: 'limit',
  in: 'query',
  required: true,
  description: `Maximum number of docs to return (1–${max}).`,
  schema: { type: 'integer', minimum: 1, maximum: max },
})

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
 * Lecture player-data subtitle map: `{ [localeCode]: subtitleFileUrl }`.
 * Distinct from the inline caption-data shape in `src/lib/subtitles.ts`
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
 * (see `src/lib/openapi/specFilter.ts`). Keeping the prefix lets the
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

  '/api/lectures/for-audience': {
    get: {
      tags: ['Lectures'],
      summary: 'Audience-targeted lecture feed',
      description:
        'Returns a uniform-random feed of lectures whose attached audiences ' +
        'match the supplied audience data (OR semantics across audiences). ' +
        'Each lecture is shaped into a flat, player-ready record matching ' +
        '`LecturePlayerData`. Records carrying `startTime`/`stopTime` denote ' +
        'a playback window within the lecture; `fullLectureId` (when set) ' +
        'points at a related lecture for editorial grouping.',
      operationId: 'lecturesForAudience',
      parameters: [...audienceQueryParameters, forAudienceLimitParam(100)],
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
        'filtered by audience eligibility (OR semantics across audiences) and ' +
        'weighted-random sampled by `weight`.',
      operationId: 'appCardsForAudience',
      parameters: [
        ...audienceQueryParameters,
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
        'the topical overlap between the meditation\'s on-screen chakras ' +
        '(its frames\' `subtleSystemNodes`, weighted by on-screen seconds) ' +
        'and each lecture\'s tagged `subtleSystemNodes`. ' +
        'By default, lectures with no chakra overlap are excluded — they ' +
        'have no relevance signal. ' +
        'When `userChoice` is set, the user-choice match is itself a ' +
        'sufficient relevance signal: all lectures matching the user-choice ' +
        'are returned regardless of chakra overlap. Positive-weight lectures ' +
        'rank first by descending weight; zero-overlap matches follow, ' +
        'ordered by id ascending. ' +
        'Audience inputs filter the candidate pool to lectures eligible for ' +
        'this viewer. Use `excludedLectureIds` to omit already-watched ' +
        'lectures.',
      operationId: 'meditationLectures',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'ID of the meditation whose context drives the ranking.',
          schema: { type: 'string' },
        },
        ...audienceQueryParameters,
        forAudienceLimitParam(100),
        {
          name: 'userChoice',
          in: 'query',
          required: false,
          description:
            'Optional ID of a UserChoices doc. Restricts candidates to ' +
            'lectures whose own `userChoices` hasMany contains that ID, AND ' +
            'relaxes the chakra-overlap filter so zero-overlap matches are ' +
            'kept (ranked after positive-overlap ones).',
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
        '400': errorResponse('Query param validation failed.'),
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
 * `src/lib/lectureShape.ts` and the shapers in
 * `src/endpoints/lecturesForAudience.ts` /
 * `src/endpoints/meditationLectures.ts` — the `api-explorer.int.spec.ts`
 * shape test is the tripwire. `additionalProperties: false` keeps the
 * shape tight so accidental fields are rejected.
 */
export const CUSTOM_ENDPOINT_SCHEMAS: Record<string, OpenAPISchemaObject> = {
  LecturePlayerData: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'hlsUrl',
      'videoUrl',
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
      videoUrl: {
        type: 'string',
        deprecated: true,
        description:
          'DEPRECATED: read `hlsUrl` instead. Will be removed after the mobile-app cutover (#319).',
      },
      thumbnailUrl: { type: ['string', 'null'] },
      subtitles: lectureSubtitleUrlsSchema,
      startTime: { type: 'number' },
      stopTime: { type: ['number', 'null'] },
      duration: { type: ['number', 'null'] },
      fullLectureId: { type: ['integer', 'null'] },
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
