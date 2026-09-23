import type {
  CollectionSlug,
  Payload,
  PayloadRequest,
  SanitizedCollectionConfig,
} from 'payload'

import { randomUUID } from 'node:crypto'

import { getFieldsToSign, jwtSign } from 'payload'

/** The auth fields this helper needs, narrowed out of `findByID`'s union. */
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
 * Cookie writing belongs to the caller.
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
