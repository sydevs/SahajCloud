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
 * Produces one optional query parameter per entry in `AUDIENCE_DEFINITIONS`.
 * Generated at module load so adding a new rule flows through automatically
 * (the test `audience params stay in sync with AUDIENCE_DEFINITIONS` in
 * `api-explorer.int.spec.ts` fails loudly if this drifts).
 */
const audienceQueryParameters: OpenAPIParameter[] = AUDIENCE_DEFINITIONS.map((rule) => ({
  name: rule.name,
  in: 'query',
  required: false,
  description: `Audience targeting input (${rule.type}) — evaluated against each doc's attached audiences.`,
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
      tags: ['frames'],
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
        '400': { description: 'Missing or invalid narratorId.' },
        '404': { description: 'Narrator not found.' },
      },
    },
  },

  '/api/lectures/for-audience': {
    get: {
      tags: ['lectures'],
      summary: 'Audience-targeted lecture feed',
      description:
        'Returns a uniform-random mix of full lectures and clips whose attached ' +
        'audiences match the supplied `audienceData` (OR semantics across ' +
        'audiences). Each item is shaped into a flat `ItemPlayerData` record ' +
        'ready for the player — the response is discriminated by `type` ' +
        "(`'lecture'` vs `'lecture-clip'`).",
      operationId: 'lecturesForAudience',
      parameters: [...audienceQueryParameters, forAudienceLimitParam(100)],
      responses: {
        '200': jsonDocsResponse('#/components/schemas/ItemPlayerData'),
        '400': { description: 'Query param validation failed.' },
      },
    },
  },

  '/api/app-cards/for-audience': {
    get: {
      tags: ['app-cards'],
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
          schema: { type: 'string', enum: ['hero', 'highlights'] },
        },
        forAudienceLimitParam(20),
      ],
      responses: {
        '200': jsonDocsResponse('#/components/schemas/AppCards'),
        '400': { description: 'Query param validation failed.' },
      },
    },
  },
}

// ── Schema definitions ────────────────────────────────────────────────────────

/**
 * Hand-authored schemas referenced by `CUSTOM_ENDPOINT_PATHS`. `Frames` and
 * `AppCards` are already produced by `payload-oapi` (camelized collection
 * slug), so we only need to define `ItemPlayerData` — the discriminated
 * union returned by `/api/lectures/for-audience`.
 *
 * Keep in lockstep with the `ItemPlayerData` type in
 * `src/endpoints/lecturesForAudience.ts` — the `api-explorer.int.spec.ts`
 * shape test is the tripwire.
 */
export const CUSTOM_ENDPOINT_SCHEMAS: Record<string, OpenAPISchemaObject> = {
  ItemPlayerData: {
    oneOf: [
      {
        type: 'object',
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
          subtitles: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of locale code to subtitle URL.',
          },
          startTime: { type: 'integer', enum: [0] },
          endTime: { type: ['number', 'null'] },
          duration: { type: ['number', 'null'] },
        },
      },
      {
        type: 'object',
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
          subtitles: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of locale code to subtitle URL.',
          },
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          duration: { type: 'number' },
          lectureId: { type: 'integer' },
        },
      },
    ],
    discriminator: { propertyName: 'type' },
  },
}
