import type { CollectionConfig, Payload, PayloadRequest } from 'payload'

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
 * The token is verified by accessPlugin's `localized-roles` strategy, which
 * wraps `JWTAuthentication` and registers ahead of `local-jwt`
 * (`src/plugins/access/localizedRolesAuth.ts`), so a minted token still passes
 * the session check and the `_verified` gate, and still gets its per-locale
 * `roles` hydrated.
 *
 * Returns the raw token. Cookie writing belongs to the caller.
 */
export async function mintManagerSessionToken(
  payload: Payload,
  managerId: number | string,
): Promise<string> {
  const collectionConfig = payload.collections[MANAGERS].config
  const { tokenExpiration } = collectionConfig.auth

  const user = await payload.findByID({ collection: MANAGERS, id: managerId, depth: 0 })

  const now = new Date()
  const sid = randomUUID()
  const session = {
    id: sid,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + tokenExpiration * 1000).toISOString(),
  }
  const live = (user.sessions ?? []).filter(({ expiresAt }) => new Date(expiresAt) > now)

  // `sessions` carries `access.update: () => false`, so this write depends on
  // the local API's default `overrideAccess: true`. Writing only `sessions`
  // also leaves the localized `roles` field at every locale untouched, which a
  // whole-document `db.updateOne` would flatten to the default locale.
  await payload.update({
    collection: MANAGERS,
    id: managerId,
    data: { sessions: [...live, session] },
  })

  const fieldsToSign = getFieldsToSign({
    // Payload passes its own sanitized config here; the published signature
    // names the unsanitized type.
    collectionConfig: collectionConfig as unknown as CollectionConfig,
    email: user.email,
    sid,
    user: { ...user, collection: MANAGERS } as PayloadRequest['user'],
  })

  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration })

  return token
}
