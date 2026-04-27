---
paths: src/endpoints/**/*.ts
---

# Custom Endpoint Rules

Rules for writing custom PayloadCMS collection endpoint handlers.

## File Structure

```
src/endpoints/
├── index.ts                      # Barrel export (re-export all handlers)
└── framesByNarrator.ts           # Frames collection endpoint
```

## Handler Pattern

Each file exports a single `Endpoint` object from `payload`:

```typescript
import type { Endpoint } from 'payload'

export const myEndpoint: Endpoint = {
  path: '/my-path/:param',
  method: 'get',
  handler: async (req) => {
    // Validate params
    const param = req.routeParams?.param as string
    if (!param) {
      return Response.json({ error: 'Param required' }, { status: 400 })
    }

    // Use req.payload for database operations
    const result = await req.payload.find({ collection: 'my-collection', ... })

    return Response.json(result)
  },
}
```

## Registration

Import from barrel export and register on the collection:

```typescript
import { myEndpoint } from '@/endpoints'

export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  endpoints: [myEndpoint],
  // ...
}
```

## Key Points

- One handler per file, named after its function (e.g., `framesByNarrator`)
- Always export from `src/endpoints/index.ts`
- Use `req.routeParams` for URL parameters, `req.query` for query strings
- Return `Response.json()` for all responses
- Handle errors with appropriate HTTP status codes (400, 404, etc.)
- Use `req.payload` (not a separate import) for database operations

## When to use a Payload endpoint vs a Next.js route

| Use case | Where |
|---|---|
| URL belongs under a collection (e.g. `/api/frames/by-narrator/:narratorId`); operates on a single collection's docs; want automatic Payload auth/access integration | `src/endpoints/*.ts` (this file) |
| Webhooks, health checks, OpenAPI spec generation, seed triggers, or operations spanning multiple collections; need raw request body (HMAC verification); need Next.js streaming / `NextResponse.redirect` | `src/app/(payload)/api/**/route.ts` (see `.claude/rules/routes.md`) |

## Eliminating client-side race conditions

`usePayloadAPI` captures `initialParams` on first render via `useState`,
which makes chained client-side fetches (with `setParams`) race-prone.
Custom endpoints solve this cleanly: do the data join server-side, then
call the endpoint from a single `usePayloadAPI`.

```typescript
// ❌ Race-condition prone — two hooks chained via useEffect + setParams
const [{ data: parent }] = usePayloadAPI(`/api/parents/${id}`)
const [{ data: children }, { setParams }] = usePayloadAPI('/api/children')
useEffect(() => {
  if (parent?.type) setParams({ where: { type: { equals: parent.type } } })
}, [parent?.type])

// ✅ One endpoint, one fetch, no races
const [{ data, isLoading, isError }] = usePayloadAPI(
  narratorId ? `/api/frames/by-narrator/${narratorId}` : '',
)
```

Use a custom endpoint when you find yourself:
- Joining data from multiple collections in a client component
- Filtering on a related document's fields
- Avoiding N+1 queries on the client
- Adding `useEffect` chains to coordinate fetches
