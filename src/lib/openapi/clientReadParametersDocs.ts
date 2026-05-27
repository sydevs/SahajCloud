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
 * a 400. See `.claude/rules/api-clients.md` for the format contract.
 */

const PARAMETER_BASE = {
  in: 'query' as const,
  required: false,
}

/**
 * `select` parameter. Required for API clients on every read; rejected with 400
 * if missing or a non-object (e.g., comma-separated string). PayloadCMS REST
 * uses `qs-esm` bracket notation: `select[field]=true`.
 */
export const selectParameter = {
  ...PARAMETER_BASE,
  name: 'select',
  required: true,
  schema: {
    type: 'object',
    additionalProperties: { type: 'boolean' },
  },
  description: `**Required for API clients.** Specifies which top-level fields to include in the response.

**Format:** bracket notation, one key per field.

\`?select[title]=true&select[slug]=true\` → \`{ select: { title: true, slug: true } }\`

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
  ...PARAMETER_BASE,
  name: 'populate',
  schema: {
    type: 'object',
    additionalProperties: {
      type: 'object',
      additionalProperties: { type: 'boolean' },
    },
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
 * Default `1` is fine for most reads; `0` returns raw IDs only; `>1` requires
 * `populate` to be set so clients can't accidentally fan out into the graph.
 */
export const depthParameter = {
  ...PARAMETER_BASE,
  name: 'depth',
  schema: {
    type: 'integer',
    minimum: 0,
    maximum: 10,
    default: 1,
  },
  description: `Number of relationship levels to populate.

- \`0\` — return raw relationship IDs (no nested objects).
- \`1\` — populate top-level relationships with their full doc (default).
- \`>1\` — also populate the relationships **on** those docs. Requires \`populate\` to be set, or the request is rejected with a 400.

Keep \`depth\` as low as the client needs; deeper depths multiply query work.`,
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
