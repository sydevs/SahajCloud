---
paths: src/endpoints/**/*.ts
---

# Custom Endpoint Rules

Rules for writing custom PayloadCMS collection endpoint handlers.

## File Structure

```
src/endpoints/
├── index.ts                      # Barrel export (re-export all handlers)
├── framesByNarrator.ts           # Frames collection endpoint
└── meditationTagsByTiming.ts     # MeditationTags collection endpoint
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
