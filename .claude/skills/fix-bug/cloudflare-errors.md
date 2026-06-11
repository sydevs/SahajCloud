# Cloudflare Edge Services Error Patterns

Stack-specific debugging for Cloudflare edge services (R2 storage, Stream, Images). The application runs on Railway + PostgreSQL; Cloudflare provides storage and CDN services in front.

**Legacy note:** Cloudflare Workers and D1 (SQLite) runtime were decommissioned during migration to Railway. For historical context, see archived sections at the end of this file.

## PostgreSQL errors (Railway)

**Symptoms:** "no such table", "FOREIGN KEY constraint failed", "connection refused".

Consult Payload's error logs in `.claude/skills/dev-server/state/server.log` and the `payload` skill for database-specific issues. Migrations are applied on server boot (see `src/payload.config.ts`: `prodMigrations`); for local/manual migration authoring, see `.claude/rules/migrations.md`.

## R2 storage errors

**Symptoms:** Upload returns 200 but file not in bucket, signed URL 403, MIME-type routing breaks.

**Where to look:**

- `src/plugins/storage/` — adapter routing logic
- `src/collections/Files.ts`, `src/collections/Frames.ts` — mixed-media collections
- Environment variables: `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (Railway secrets)

**Common causes:**

- Missing or incorrect R2 API credentials in Railway environment
- `r2Filename` hook not running → file uploaded but URL doesn't match
- MIME-type fallthrough: image expected but content is video, so it routes to Stream instead of Images
- Local dev: R2 falls back to local file storage; check the storage adapter's dev branch

## Cloudflare Stream errors

**Symptoms:** Video upload succeeds but `hlsUrl` is empty or the thumbnail never appears.

**Where to look:**

- `src/plugins/storage/cloudflareStreamAdapter.ts` — upload + Stream URL helpers
- `src/plugins/storage/urlFields.ts` — `hlsUrl` / `url` virtual fields

**Common causes:**

- Video still processing (Stream takes 1–N minutes); `readyToStream: false` until done
- API token lacks Stream permission
- `CLOUDFLARE_STREAM_DELIVERY_URL` unset → `url`/`hlsUrl` fall back to the local `/api/<collection>/file/...` route (500s in prod)

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

Cloudflare's Firewall Rate Limiting (configured at the WAF level on cloud.sydevelopers.com) provides rate limiting.

**Symptoms:** Sudden 429s in production, none in dev.

**Where to look:** Cloudflare dashboard → Rules → Rate limiting. Local dev is unaffected.

**Note:** If you see 429s locally, it's likely a local middleware or test config issue; check `src/lib/` for any custom rate-limit logic.

## When to use Cloudflare's MCP docs

For R2 / Stream / Images framework questions:

```
mcp__cloudflare-docs__search_cloudflare_documentation
```

## Application logs

**Local dev:** `.claude/skills/dev-server/state/server.log`

**Production (Railway):** View in Railway dashboard or tail logs via Railway CLI. S3 / Stream API errors appear in application logs with clear diagnostic info.
