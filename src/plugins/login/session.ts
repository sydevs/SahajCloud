import type {
  CollectionSlug,
  Payload,
  PayloadRequest,
  SanitizedCollectionConfig,
} from 'payload'

import { randomUUID } from 'node:crypto'

import { getFieldsToSign, jwtSign } from 'payload'
import { generatePayloadCookie } from 'payload/shared'

/** The auth fields `createSession` reads, narrowed out of `findByID`'s union. */
interface SessionDocument {
  email?: null | string
  sessions?: { createdAt: string; expiresAt: string; id?: null | string }[] | null
}

/**
 * Payload injects `sessions` only when the collection keeps the local strategy
 * and `useSessions` (`getAuthFields.ts`), so this one predicate refuses every
 * collection a session cannot be minted for. `clients` is the live case: it
 * sets `disableLocalStrategy`, so it carries neither `sessions` nor `email`,
 * and a token minted for it type-checks and authenticates nothing.
 */
function hasSessionsField(config: SanitizedCollectionConfig): boolean {
  return config.fields.some((field) => 'name' in field && field.name === 'sessions')
}

/**
 * Mint a session token for a user of any auth collection, without a password.
 *
 * This is the tail of Payload's own `resetPassword` operation, rebuilt from
 * its public exports: `getFieldsToSign` and `jwtSign`. `addSessionToUser` is
 * internal, so the session row is written here instead.
 *
 * ⚠ **The session row is not optional.** An auth collection inheriting
 * `useSessions: true` has a JWT strategy that returns no user when the token's
 * `sid` is absent from `sessions` — a token minted without one authenticates
 * nothing. `expiresAt` is equally load-bearing: `managers_sessions.expires_at`
 * is `NOT NULL`, so omitting it fails the insert rather than minting a token
 * that outlives its row.
 *
 * Writing the cookie is {@link sessionCookie}.
 *
 * @throws if `collection` carries no `sessions` field.
 */
export async function createSession(
  payload: Payload,
  collection: CollectionSlug,
  id: number | string,
): Promise<string> {
  const entity = payload.collections[collection]
  if (!entity?.config.auth || !hasSessionsField(entity.config)) {
    throw new Error(`createSession: '${collection}' cannot hold a session.`)
  }

  const collectionConfig = entity.config
  const { tokenExpiration } = collectionConfig.auth

  // No `select`: `getFieldsToSign` reads whichever fields carry `saveToJWT`,
  // so a field list here would silently drop the first one anybody adds.
  // `joins: false` is safe — `Managers` declares three join fields, and an
  // unset `joins` enables every one of them for a document nothing else reads.
  // The cast is the price of a run-time slug: `joins` narrows per collection,
  // and over the whole union it collapses to `undefined`.
  const user = (await payload.findByID({
    collection,
    id,
    depth: 0,
    joins: false as never,
  })) as SessionDocument & { id: number | string }

  const now = new Date()
  const sid = randomUUID()
  const session = {
    id: sid,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + tokenExpiration * 1000).toISOString(),
  }
  const live = (user.sessions ?? []).filter(({ expiresAt }) => new Date(expiresAt) > now)

  // `sessions` carries `access.update: () => false`, so this write depends on
  // the local API's default `overrideAccess: true`. Only `sessions` is sent:
  // `user` was read at one locale, so writing it back whole would flatten a
  // localized field (`roles`, on `managers`) onto that locale.
  await payload.update({
    collection,
    id,
    data: { sessions: [...live, session] } as never,
    depth: 0,
  })

  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    // Both guaranteed by the `sessions` guard above: Payload adds `sessions`
    // and `email` in the same branch of `getAuthFields`.
    email: user.email!,
    sid,
    user: { ...user, collection } as PayloadRequest['user'],
  })

  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration })

  return token
}

/**
 * The `Set-Cookie` value that puts a minted session in a browser — what the
 * redeem routes and the preview admin's request answer send. The expiry comes
 * from the collection's own `tokenExpiration`.
 */
export function sessionCookie(payload: Payload, collection: CollectionSlug, token: string): string {
  return generatePayloadCookie({
    collectionAuthConfig: payload.collections[collection]!.config.auth,
    cookiePrefix: payload.config.cookiePrefix,
    token,
  })
}

/** `Set-Cookie` attribute → `cookies().set` option, for every one Payload sends. */
const FLAG_KEYS = new Set(['httpOnly', 'partitioned', 'secure'])

const COOKIE_OPTION_KEYS: Record<string, string> = {
  domain: 'domain',
  expires: 'expires',
  httponly: 'httpOnly',
  'max-age': 'maxAge',
  partitioned: 'partitioned',
  path: 'path',
  priority: 'priority',
  samesite: 'sameSite',
  secure: 'secure',
}

/**
 * The same session cookie, split into the three arguments a Server Action's
 * `cookies().set` takes.
 *
 * ⚠ **Parsed from {@link sessionCookie}, never rebuilt.** Payload derives the
 * name, the expiry and the `secure` / `sameSite` / `domain` attributes from the
 * collection and the config; a second derivation here would drift from the one
 * the redeem routes send, and a session cookie that differs by one attribute
 * fails in a way only a browser shows. `session-cookie-parts.spec.ts` pins the two
 * against each other.
 */
export function sessionCookieParts(
  payload: Payload,
  collection: CollectionSlug,
  token: string,
): { name: string; options: Record<string, boolean | Date | number | string>; value: string } {
  const [pair, ...attributes] = sessionCookie(payload, collection, token).split('; ')
  const separator = pair!.indexOf('=')
  const options: Record<string, boolean | Date | number | string> = {}

  for (const attribute of attributes) {
    const at = attribute.indexOf('=')
    const raw = at === -1 ? undefined : attribute.slice(at + 1).trim()
    const key = COOKIE_OPTION_KEYS[(at === -1 ? attribute : attribute.slice(0, at)).trim().toLowerCase()]
    // An attribute Payload starts sending that Next has no option for is dropped
    // rather than guessed at — every one it sends today is in the map above, and
    // the spec fails the day that stops being true.
    if (!key) continue
    // ⚠ `HttpOnly=true` and `Secure=true`, not the bare flags — Payload spells
    // them with a value, and Next reads the string `'false'` as truthy. So the
    // flags are coerced rather than copied.
    if (raw === undefined) options[key] = true
    else if (FLAG_KEYS.has(key)) options[key] = raw !== 'false'
    else if (key === 'expires') options[key] = new Date(raw)
    else if (key === 'maxAge') options[key] = Number(raw)
    else options[key] = raw
  }

  return { name: pair!.slice(0, separator), options, value: pair!.slice(separator + 1) }
}
