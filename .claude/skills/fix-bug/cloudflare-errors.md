# Cloudflare Workers / D1 / R2 Error Patterns

Stack-specific debugging for the Cloudflare runtime, D1 (SQLite), R2 storage, and Cloudflare Stream/Images.

## Worker bootstrap errors

**Symptoms:** "Worker exceeded CPU limit on startup", "Binding X is undefined", 500 with empty body on every request.

**Where to look:**

- `src/worker.ts` — Worker entry, Sentry wrapping
- `src/payload.config.ts` — Payload bootstrap, D1/R2 initialization
- `wrangler.toml` — bindings (D1, R2, Rate Limiter), env selection

**Common causes:**

- Missing binding in `wrangler.toml` for the current environment (top-level vs `[env.dev]`)
- Binding declared but not deployed (run `wrangler deploy` after `wrangler.toml` changes)
- `getCloudflareContext()` called before context is ready → check call site
- Env validation failure at module load (`src/lib/env.ts` Zod errors)

## D1 errors

**Symptoms:** "no such table", "FOREIGN KEY constraint failed", "table X already exists", migration partially applied.

### D1 PRAGMA foreign_keys gotcha (project-known)

D1 does **not** honor `PRAGMA foreign_keys=OFF` across `db.run()` calls. Migrations that rebuild child tables before parent tables will cascade-null FK columns.

**Rule:** Always rebuild parent tables first, or use a single SQL transaction string.

See [feedback_d1_pragma_foreign_keys](file:///Users/devindra/.claude/projects/-Users-devindra-Documents-Projects-sy-devs-cms/memory/feedback_d1_pragma_foreign_keys.md) memory.

### Common D1 errors

| Symptom                         | Likely cause                                                          |
| ------------------------------- | --------------------------------------------------------------------- |
| `no such table: X`              | Migration not run (`pnpm payload migrate`) or wrong env (dev vs prod) |
| `FOREIGN KEY constraint failed` | Cascade-null bug, or actual data integrity issue                      |
| `UNIQUE constraint failed`      | Slug/email collision; check the field's `unique: true` setting        |
| `database is locked`            | Concurrent write during dev; usually clears on retry                  |

### Local vs remote D1

- Local D1 (dev): `.wrangler/state/v3/d1/...` SQLite file
- Remote D1 (prod): `wrangler d1 execute sahajcloud --remote --command "..."`
- `wrangler.toml` `database_id = "local"` for `[env.dev]`; real UUID for top-level

## R2 storage errors

**Symptoms:** Upload returns 200 but file not in bucket, signed URL 403, MIME-type routing breaks.

**Where to look:**

- `src/lib/storage/` — adapter routing logic
- `src/collections/Files.ts`, `src/collections/Frames.ts` — mixed-media collections

**Common causes:**

- R2 binding missing in wrangler.toml for the env
- `r2Filename` hook not running → file uploaded but URL doesn't match
- MIME-type fallthrough: image expected but content is video, so it routes to Stream instead of Images
- Local dev: R2 falls back to local file storage; check the storage adapter's dev branch

## Cloudflare Stream errors

**Symptoms:** Video upload succeeds but `hlsUrl` empty, thumbnail never appears, webhook never fires.

**Where to look:**

- `src/app/(payload)/api/webhooks/cloudflare-stream/route.ts` — webhook handler
- `src/lib/storage/cloudflareStreamAdapter.ts` (or similar)

**Common causes:**

- Webhook secret mismatch → Cloudflare can't reach the handler
- Video still processing (Stream takes 1–N minutes); `readyToStream: false` until done
- API token lacks Stream permission

## Cloudflare Images errors

**Symptoms:** Image upload fails silently, `url` field empty, image returns 404.

**Where to look:**

- `src/collections/Images.ts`
- `CLOUDFLARE_IMAGES_DELIVERY_URL` env var

**Common causes:**

- Account ID mismatch between upload and delivery URL hash
- API key lacks Images permission
- File exceeds Cloudflare Images size/format limits (check Cloudflare's Images docs)

## Rate limiting

The `[[ratelimits]]` binding in `wrangler.toml` provides rate limiting (500/min per default).

**Symptoms:** Sudden 429s in production, none in dev.

**Where to look:** `API_RATE_LIMITER` binding usage in routes.

**Note:** Rate limiting is **automatically disabled in dev** (see `.claude/docs/environment.md`). If you see 429s locally, something's misconfigured.

## When to use Cloudflare's MCP docs

For Workers / D1 / R2 / Stream / Images framework questions:

```
mcp__cloudflare-docs__search_cloudflare_documentation
```

(Or, if not yet migrated: `mcp__plugin_sydevs-web_cloudflare-docs__*`.)

## Worker logs

```bash
# Production (streams real-time)
wrangler tail sahajcloud --format pretty

# Filter by status, sampling rate, etc.
wrangler tail sahajcloud --status error
```

Local dev logs are in `.claude/skills/dev-server/state/server.log`.
