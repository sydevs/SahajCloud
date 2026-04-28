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
 * Subtitle map schema shared by both player-data variants. Keys are
 * constrained to the known `LOCALES` codes via `propertyNames: { enum: ... }`
 * (JSON Schema 2020-12 / OpenAPI 3.1 — advisory for most validators, but
 * Scalar renders the constraint). Values are declared as URL-formatted
 * strings (`format: 'uri'` is also advisory but documents intent).
 */
const subtitlesSchema: OpenAPISchemaObject = {
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
        'Returns a uniform-random mix of full lectures and clips whose ' +
        'attached audiences match the supplied audience data (OR semantics ' +
        'across audiences). Each item is shaped into a flat, player-ready ' +
        'record; the response is discriminated by `type` — `lecture` items ' +
        'match `LecturePlayerData` and `lecture-clip` items match ' +
        '`LectureClipPlayerData`.',
      operationId: 'lecturesForAudience',
      parameters: [...audienceQueryParameters, forAudienceLimitParam(100)],
      responses: {
        '200': {
          description: 'Audience-filtered lecture and clip player records.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['docs'],
                properties: {
                  docs: {
                    type: 'array',
                    items: {
                      oneOf: [
                        { $ref: '#/components/schemas/LecturePlayerData' },
                        { $ref: '#/components/schemas/LectureClipPlayerData' },
                      ],
                      discriminator: { propertyName: 'type' },
                    },
                  },
                },
              },
            },
          },
        },
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

  '/api/meditations/{id}/related-lecture-clips': {
    get: {
      tags: ['Meditations'],
      summary: 'Suggested lecture clips for a meditation',
      description:
        'Returns lecture clips related to a meditation, ordered most-' +
        'relevant first. Pass the `userChoice` query param to limit ' +
        'results to a single mood/goal category, and `excludedLectureClipIds` ' +
        'to omit clips the user has already watched. Audience inputs ' +
        'filter the pool to clips eligible for this viewer.',
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
            'clips whose parent lecture has that user-choice in its ' +
            '`userChoices` hasMany.',
          schema: { type: 'integer' },
        },
        {
          name: 'excludedLectureClipIds',
          in: 'query',
          required: false,
          description:
            'Comma-separated lecture-clip IDs to exclude (e.g. clips the ' +
            'user has already watched).',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Audience- and topic-filtered lecture-clip records.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['docs'],
                properties: {
                  docs: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/LectureClipPlayerData' },
                  },
                },
              },
            },
          },
        },
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
 * slug). The two player-data schemas below (`LecturePlayerData` and
 * `LectureClipPlayerData`) are inlined as a `oneOf` on
 * `/api/lectures/for-audience`'s response — the endpoint returns a union
 * of those two shapes discriminated by `type`.
 *
 * Keep in lockstep with the matching types in
 * `src/endpoints/lecturesForAudience.ts` — the `api-explorer.int.spec.ts`
 * shape test is the tripwire.
 *
 * `additionalProperties: false` locks each variant so accidental fields
 * (most importantly `lectureId`, which is clip-only in the TS union) are
 * rejected by the docs' request/response validation. If you add a new
 * field to either type, update the matching schema here too.
 */
export const CUSTOM_ENDPOINT_SCHEMAS: Record<string, OpenAPISchemaObject> = {
  LecturePlayerData: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'type',
      'videoUrl',
      'thumbnailUrl',
      'subtitles',
      'startTime',
      'endTime',
      'duration',
    ],
    properties: {
      id: { type: 'integer' },
      type: { type: 'string', enum: ['lecture'] },
      title: { type: ['string', 'null'] },
      videoUrl: { type: 'string' },
      thumbnailUrl: { type: ['string', 'null'] },
      subtitles: subtitlesSchema,
      startTime: { type: 'integer', enum: [0] },
      endTime: { type: ['number', 'null'] },
      duration: { type: ['number', 'null'] },
    },
  },
  LectureClipPlayerData: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'type',
      'title',
      'videoUrl',
      'thumbnailUrl',
      'subtitles',
      'startTime',
      'endTime',
      'duration',
      'lectureId',
    ],
    properties: {
      id: { type: 'integer' },
      type: { type: 'string', enum: ['lecture-clip'] },
      title: { type: 'string' },
      videoUrl: { type: 'string' },
      thumbnailUrl: { type: ['string', 'null'] },
      subtitles: subtitlesSchema,
      startTime: { type: 'number' },
      endTime: { type: 'number' },
      duration: { type: 'number' },
      lectureId: { type: 'integer' },
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
