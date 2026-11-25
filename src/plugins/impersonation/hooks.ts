import type { CollectionConfig, PayloadRequest } from 'payload'

import { Forbidden, getFieldsToSign, jwtSign } from 'payload'

import { readImpersonation } from './cookie'
import { impersonatorOf } from './gate'

type Hooks = NonNullable<CollectionConfig['hooks']>
type AuthUser = NonNullable<PayloadRequest['user']>

// `updateByID` and `deleteByID` reach `beforeOperation` as `update` and
// `delete`; only they carry an `id`.
const OWN_ROW_WRITES = new Set(['update', 'delete'])

/**
 * Refuse any write to the impersonated manager's own row. Support is acting
 * as them, not editing them, and every such write — their name, contact
 * details, notification preferences — would read later as theirs.
 * Other managers' rows stay writable, so an assignment's invitation still
 * queues. The project switcher never reaches this: it writes the cookie
 * instead (`setImpersonatedProject`).
 */
export const refuseOwnRowWrites: NonNullable<Hooks['beforeOperation']>[number] = ({
  args,
  operation,
  req,
}) => {
  if (!impersonatorOf(req.user) || !OWN_ROW_WRITES.has(operation)) return args
  if (String((args as { id?: number | string }).id) === String(req.user!.id)) {
    throw new Forbidden(req.t)
  }
  return args
}

/**
 * Refresh the support account's token, not the target's.
 *
 * ⚠ Payload's default re-signs a token for `req.user`, which is the target
 * here, carrying support's session id — a token that authenticates nobody, so
 * an open tab would sign support out on its first refresh.
 */
export const refreshImpersonatorToken: NonNullable<Hooks['refresh']>[number] = async ({
  args,
  user,
}) => {
  const req = args.req as PayloadRequest
  const impersonatedBy = impersonatorOf(req.user)
  if (!impersonatedBy) return undefined

  const claims = await readImpersonation(req.payload, req.headers)
  const collectionConfig = args.collection.config
  const { tokenExpiration } = collectionConfig.auth
  const responseUser = {
    ...user,
    collection: 'managers',
    currentProject: (req.user as { currentProject?: unknown }).currentProject ?? null,
    impersonatedBy,
  }

  // Local auto-login holds no session to refresh.
  if (!claims?.actorSession) {
    return {
      exp: Math.floor(Date.now() / 1000) + tokenExpiration,
      // Unsent: `setCookie: false` keeps the endpoint from writing it.
      refreshedToken: '',
      setCookie: false,
      user: responseUser,
    }
  }

  const actor = await req.payload.findByID({
    collection: 'managers',
    id: impersonatedBy.id,
    depth: 0,
    joins: false,
    overrideAccess: true,
  })
  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: actor.email,
    sid: claims.actorSession,
    user: { ...actor, collection: 'managers' } as AuthUser,
  })
  const { exp, token } = await jwtSign({
    fieldsToSign,
    secret: req.payload.secret,
    tokenExpiration,
  })

  return { exp, refreshedToken: token, setCookie: true, user: responseUser }
}

/**
 * `/me` re-reads the target's stored row, so put back what the strategy
 * overlays: the cookie's project, and who is impersonating — the banner and
 * the project switcher read both from `useAuth()`.
 */
export const afterMeImpersonation: NonNullable<Hooks['afterMe']>[number] = ({ req, response }) => {
  const impersonatedBy = impersonatorOf(req.user)
  const result = response as { user?: Record<string, unknown> | null } | null
  if (!impersonatedBy || !result?.user) return response

  return {
    ...result,
    user: {
      ...result.user,
      currentProject: (req.user as { currentProject?: unknown }).currentProject ?? null,
      impersonatedBy,
    },
  } as typeof response
}
