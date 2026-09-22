import type { Payload } from 'payload'

import { randomUUID } from 'node:crypto'

import { getFieldsToSign, jwtSign } from 'payload'

const MANAGERS = 'managers'

/**
 * Mint a session token for a manager, without a password.
 *
 * This is the tail of Payload's own `resetPassword` operation, rebuilt from
 * its public exports: `getFieldsToSign` and `jwtSign`. `addSessionToUser` is
 * internal, so the session row is written here instead.
 *
 * ⚠ **The session row is not optional.** `Managers` inherits
 * `useSessions: true`, and the JWT strategy returns no user when the token's
 * `sid` is absent from `sessions` — a token minted without one authenticates
 * nothing. `expiresAt` is equally load-bearing: `managers_sessions.expires_at`
 * is `NOT NULL`, so omitting it fails the insert rather than minting a token
 * that outlives its row.
 *
 * Cookie writing belongs to the caller.
 */
export async function mintManagerSessionToken(
  payload: Payload,
  managerId: number | string,
): Promise<string> {
  const collectionConfig = payload.collections[MANAGERS].config
  const { tokenExpiration } = collectionConfig.auth

  // No `select`: `getFieldsToSign` reads whichever fields carry `saveToJWT`,
  // so a field list here would silently drop the first one anybody adds.
  // `joins: false` is safe — `Managers` declares three join fields, and an
  // unset `joins` enables every one of them for a document nothing else reads.
  const user = await payload.findByID({
    collection: MANAGERS,
    id: managerId,
    depth: 0,
    joins: false,
  })

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
  // `user` was read at one locale, so writing it back whole would flatten the
  // localized `roles` field onto that locale.
  await payload.update({
    collection: MANAGERS,
    id: managerId,
    data: { sessions: [...live, session] },
    depth: 0,
  })

  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: user.email,
    sid,
    user: { ...user, collection: MANAGERS },
  })

  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration })

  return token
}
