/**
 * The request header a client-originated write carries its solved Turnstile token in.
 *
 * ⚠ **Cross-repo contract** with SahajAtlasWeb's `TURNSTILE_HEADER` (`src/config/api/mutate.ts`)
 * and WeMeditateWeb's `TURNSTILE_TOKEN_HEADER` (`lib/submissions.ts`). The Atlas widget sends it
 * from the visitor's browser, cross-origin, so it must also be in `cors.headers`
 * (`payload.config.ts`): a header missing from the preflight's allow-list makes the browser drop
 * the request before it is sent, and nothing reaches this server to log.
 */
export const TURNSTILE_TOKEN_HEADER = 'x-turnstile-token'
