/**
 * Client Read Parameters Documentation for OpenAPI
 *
 * Defines reusable parameter definitions for `select`, `populate`, `depth`,
 * `limit`, and `page` — query params that API clients pass on every read.
 *
 * `payload-oapi` v0.2.5 does not surface these params in the generated spec
 * (auto-generated CRUD endpoints come with only path params + auth), so
 * `injectClientReadParameters()` in `specFilter.ts` walks the spec and adds
 * `$ref`s to these definitions on every collection GET operation.
 *
 * The descriptions emphasize PayloadCMS's bracket-notation requirement —
 * comma-separated strings get rejected by `validateClientQueryParamsHook` with
 * a 400. See `src/plugins/usage/AGENTS.md` for the format contract.
 */

const PARAMETER_BASE = {
  in: 'query' as const,
  required: false,
}

const DEEP_OBJECT_QUERY_PARAMETER = {
  ...PARAMETER_BASE,
  style: 'deepObject' as const,
  explode: true,
}

const FIELD_SELECTION_VALUE_SCHEMA = {
  oneOf: [
    { type: 'boolean' },
    {
      type: 'object',
      additionalProperties: true,
    },
  ],
}

/**
 * `select` parameter. Required for API clients on every read; rejected with 400
 * if missing or a non-object (e.g., comma-separated string). PayloadCMS REST
 * uses `qs-esm` bracket notation: `select[field]=true`.
 */
export const selectParameter = {
  ...DEEP_OBJECT_QUERY_PARAMETER,
  name: 'select',
  required: true,
  schema: {
    type: 'object',
    additionalProperties: FIELD_SELECTION_VALUE_SCHEMA,
  },
  description: `**Required for API clients.** Specifies which fields to include in the response.

**Format:** bracket notation, one key per field. Nested fields use nested brackets.

\`?select[title]=true&select[slug]=true\` → \`{ select: { title: true, slug: true } }\`

\`?select[meta][image]=true\` → \`{ select: { meta: { image: true } } }\`

⚠️ Comma-separated strings (\`?select=title,slug\`) are rejected with a 400 — PayloadCMS REST uses \`qs-esm\` to parse query strings into nested objects, not delimited strings.

**On rejection** the server returns:
\`\`\`json
{ "errors": [{ "message": "The \\"select\\" query parameter is required for API clients. Specify which fields you need in the response." }] }
\`\`\``,
}

/**
 * `populate` parameter. Required when `depth > 1`. Same bracket-notation rule
 * as `select`. Nested objects map collection slug → field selection.
 */
export const populateParameter = {
  ...DEEP_OBJECT_QUERY_PARAMETER,
  name: 'populate',
  schema: {
    type: 'object',
    additionalProperties: FIELD_SELECTION_VALUE_SCHEMA,
  },
  description: `**Required when \`depth > 1\`.** Specifies which fields to include on each populated relationship.

**Format:** bracket notation, keyed by collection slug.

\`?populate[narrators][name]=true&populate[narrators][slug]=true\` → \`{ populate: { narrators: { name: true, slug: true } } }\`

Populate \`true\` for an entire collection: \`?populate[narrators]=true\`.

⚠️ Same bracket-notation requirement as \`select\` — comma-separated or dot-path strings are rejected.

**On rejection at \`depth > 1\` without \`populate\`:**
\`\`\`json
{ "errors": [{ "message": "The \\"populate\\" query parameter is required when depth > 1." }] }
\`\`\``,
}

/**
 * `depth` parameter. Controls how many levels of relationships to populate.
 * Payload's server default is currently `2`; `0` returns raw IDs only; `>1`
 * requires `populate` to be set so clients can't accidentally fan out into the graph.
 * Capped at the server's `maxDepth` (3, set in `src/payload.config.ts`) — values
 * above it are clamped down, not rejected. Keep this `maximum` in sync with that config.
 */
export const depthParameter = {
  ...PARAMETER_BASE,
  name: 'depth',
  schema: {
    type: 'integer',
    minimum: 0,
    maximum: 3,
    default: 2,
  },
  description: `Number of relationship levels to populate.

- \`0\` — return raw relationship IDs (no nested objects).
- \`1\` — populate top-level relationships with their full doc.
- \`2\` — Payload's current server default when \`depth\` is omitted.
- \`3\` — maximum (server \`maxDepth\`); higher values are clamped down to 3, not rejected.
- \`>1\` — also populate the relationships **on** those docs. Requires \`populate\` to be set, or the request is rejected with a 400.

Pass \`depth=1\` or \`depth=0\` when you do not need nested relationship traversal. Keep \`depth\` as low as the client needs; deeper depths multiply query work.`,
}

/**
 * `limit` parameter. Default 10; cap at 100 for list endpoints.
 */
export const limitParameter = {
  ...PARAMETER_BASE,
  name: 'limit',
  schema: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 10,
  },
  description:
    'Maximum number of docs to return in the `docs` array. Defaults to 10. List endpoints typically cap at 100.',
}

/**
 * `page` parameter. 1-based.
 */
export const pageParameter = {
  ...PARAMETER_BASE,
  name: 'page',
  schema: {
    type: 'integer',
    minimum: 1,
    default: 1,
  },
  description: '1-based page number for paginated results. Combine with `limit` to slice the feed.',
}

/**
 * Map of all client-read parameters by name. Used by `injectClientReadParameters`
 * in `specFilter.ts` to register reusable definitions under
 * `components.parameters` and to look up which ones to attach per HTTP method.
 */
export const CLIENT_READ_PARAMETERS = {
  select: selectParameter,
  populate: populateParameter,
  depth: depthParameter,
  limit: limitParameter,
  page: pageParameter,
} as const

/**
 * Parameter names to attach to collection LIST GET endpoints (`/api/{collection}`).
 * Includes pagination params since the endpoint returns a paginated result.
 */
export const LIST_PARAMETERS = ['select', 'populate', 'depth', 'limit', 'page'] as const

/**
 * Parameter names to attach to findByID GET endpoints (`/api/{collection}/{id}`).
 * Excludes pagination since the response is a single doc.
 */
export const FIND_BY_ID_PARAMETERS = ['select', 'populate', 'depth'] as const
