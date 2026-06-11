---
paths:
  - src/app/**/route.ts
---

# Next.js App Router Route Rules

Rules for writing Next.js route handlers under `src/app/(payload)/api/`.

## Allowed Exports (Critical)

Next.js App Router route files may **only** export specific named values.
Exporting anything else causes a build-time type error:

```
Type error: Route "path/to/route.ts" does not match the required types of a Next.js Route.
  "<name>" is not a valid Route export field.
```

**Allowed exports**:

- HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Config: `dynamic`, `revalidate`, `runtime`, `preferredRegion`, `fetchCache`, `dynamicParams`, `maxDuration`, `generateStaticParams`

**Not allowed**: arbitrary helper functions, constants, types, schemas, or anything else.
Lint and tests will pass — only `pnpm build` catches this.

## Pattern: Thin Route + Pure Helpers in `src/lib/`

When a route has non-trivial logic (signature verification, complex branching,
side-effect orchestration), extract the logic to a sibling file under
`src/lib/` and keep the route file as a thin wrapper. This also makes the
logic trivially unit-testable without booting Payload.

```
src/lib/<domain>/myThingHandler.ts          ← pure helpers (exported freely)
src/app/(payload)/api/<path>/route.ts        ← thin POST wrapper
tests/int/my-thing.int.spec.ts              ← imports + tests the pure helpers
```

**Route wrapper shape** (when the handler is pure and doesn't need Payload):

```typescript
import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { serverEnv } from '@/lib/env'
import { handleMyThing } from '@/lib/<domain>/myThingHandler'
import { createWorkerSafeLogger } from '@/lib/logger/workerSafeLogger'

// Module-level logger so it isn't re-initialised on every request.
const logger = createWorkerSafeLogger(serverEnv.NEXT_PUBLIC_LOG_LEVEL ?? 'info')

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()

  const result = await handleMyThing({
    rawBody,
    /* ...injected deps... */
    logger,
  })

  return NextResponse.json(result.body, { status: result.status })
}
```

**Prefer `createWorkerSafeLogger` over `getPayload({ config })`** when the handler is pure. Booting Payload just for `payload.logger` is heavy and slows the response — which matters for webhooks (e.g. the Cloudflare Stream webhook retries on non-2xx and on timeouts). Only reach for `getPayload` when the handler genuinely needs Payload features (`payload.find`, `payload.auth`, etc.).

## Raw Body vs JSON

If the handler needs to verify a signature (webhooks) or otherwise operate on
exact bytes, always read the body as text first:

```typescript
const rawBody = await request.text() // exact bytes for HMAC
const parsed = JSON.parse(rawBody) // OK to parse AFTER capturing raw
```

Never call `request.json()` and then try to re-serialize — `JSON.stringify`
does not guarantee byte-identical output.

## When to use a route handler vs a Payload endpoint

See `.claude/rules/endpoints.md` ("When to use a Payload endpoint vs a
Next.js route") and `.claude/docs/architecture.md` → "Custom Endpoints"
for the full decision matrix. Short version:

- **`src/collections/<Name>/endpoints/*.ts` (Payload endpoint)**: operations tied to a specific
  collection (e.g., `/api/frames/by-narrator/:id`). Registered via the
  collection's `endpoints` array. Has `req.payload` automatically.
- **`src/app/(payload)/api/**/route.ts` (Next.js route)\*\*: webhooks, health
  checks, OpenAPI spec generation, seed triggers, or anything not scoped to
  a single collection.
