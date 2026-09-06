---
paths:
  - src/app/**/route.ts
---

# Next.js App Router Route Rules

Rules for route handlers under `src/app/(payload)/api/`.

## Allowed exports

A route file may export only specific names. Any other export causes a build-time error:

```
Type error: Route "path/to/route.ts" does not match the required types of a Next.js Route.
  "<name>" is not a valid Route export field.
```

**Allowed**: the HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`) and the config exports (`dynamic`, `revalidate`, `runtime`, `preferredRegion`, `fetchCache`, `dynamicParams`, `maxDuration`, `generateStaticParams`).

**Not allowed**: a helper function, a constant, a type, a schema, or anything else. Lint and tests pass on a bad export. Only `pnpm build` catches it.

## Pattern: thin route, pure helpers in `src/lib/`

When a route needs real logic, such as signature verification or branching, move it to a sibling file under `src/lib/`. Keep the route file a thin wrapper. A test can then call the logic directly, with no Payload boot.

```
src/plugins/storage/cloudflareStreamWebhook.ts             ← pure helpers (exported freely)
src/app/(payload)/api/webhooks/cloudflare-stream/route.ts  ← thin POST wrapper
tests/int/cloudflare-stream-webhook.int.spec.ts             ← imports helpers from @/lib/
```

Route wrapper shape, for a handler that is pure and needs no Payload access:

```typescript
import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { serverEnv } from '@/lib/env'
import { handleMyThing } from '@/lib/<domain>/myThingHandler'
import { createWorkerSafeLogger } from '@/lib/logger/workerSafeLogger'

// One logger per module, not one per request.
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

Prefer `createWorkerSafeLogger` over `getPayload({ config })` when the handler is pure. Booting Payload only for `payload.logger` slows the response. This matters for a webhook: Cloudflare Stream retries on a non-2xx response and on a timeout. Reach for `getPayload` only when the handler needs a real Payload feature, such as `payload.find` or `payload.auth`.

## Raw body vs JSON

To verify a signature (a webhook), or to read exact bytes for another reason, read the body as text first:

```typescript
const rawBody = await request.text() // exact bytes for HMAC
const parsed = JSON.parse(rawBody) // OK to parse AFTER capturing raw
```

Never call `request.json()` and then re-serialize the result. `JSON.stringify` does not guarantee byte-identical output.

## Payload endpoint vs Next.js route

See `docs/rules/endpoints.md` ("Root-level endpoints") and `docs/architecture.md` → "Custom Endpoints" for the full decision matrix. In short:

- **Payload endpoint** (`src/collections/<Name>/endpoints/*.ts`): an operation tied to one collection, such as `/api/frames/by-narrator/:id`. Register it on that collection's `endpoints` array. Payload supplies `req.payload` automatically.
- **Next.js route** (`src/app/(payload)/api/**/route.ts`): a webhook, a health check, OpenAPI spec generation, a seed trigger, or anything not scoped to one collection.
