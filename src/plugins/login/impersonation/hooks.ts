import type {
  CollectionAfterLogoutHook,
  CollectionAfterReadHook,
  CollectionBeforeOperationHook,
  CollectionRefreshHook,
} from 'payload'

import { Forbidden } from 'payload'

import { isOwnRow } from '@/plugins/access'

import { signSessionToken } from '../session'
import { impersonationCookie, readImpersonation } from './cookie'
import { type GateUser, impersonatorOf } from './gate'

/**
 * Refuse any write to the impersonated manager's own row. Support is acting
 * as them, not editing them, and every such write — their name, contact
 * details, notification preferences — would read later as theirs. Another
 * manager's row stays writable by id, so an assignment's invitation still
 * queues. The project switcher never reaches this: it writes the cookie
 * instead (`setImpersonatedProject`).
 */
export const refuseOwnRowWrites: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (!impersonatorOf(req.user) || (operation !== 'update' && operation !== 'delete')) return args
  // A bulk write names no row, so its `where` could reach the manager's own.
  if (!('id' in args) || isOwnRow(req.user!.id, args.id as number | string)) {
    throw new Forbidden(req.t)
  }
  return args
}

/**
 * Every read of the impersonated manager's own row — `/me`, and the user a
 * refresh answers with — carries what the strategy set on `req.user`: the
 * cookie's project, and who is impersonating. The banner and the project
 * switcher read both from `useAuth()`.
 */
export const overlayImpersonation: CollectionAfterReadHook = ({ doc, req }) => {
  const user = req.user as GateUser | null
  const impersonatedBy = impersonatorOf(user)
  if (!impersonatedBy || !isOwnRow(user!.id!, doc.id)) return doc
  return { ...doc, currentProject: user!.currentProject ?? null, impersonatedBy }
}

/**
 * Refresh the support account's token, not the target's.
 *
 * ⚠ Payload's default re-signs a token for `req.user`, which is the target
 * here, carrying no session of theirs — a token that authenticates nobody, so
 * an open tab would sign support out on its first refresh.
 */
export const refreshImpersonatorToken: CollectionRefreshHook = async ({ args, user }) => {
  const { req } = args
  const impersonatedBy = impersonatorOf(req.user)
  if (!impersonatedBy) return

  const claims = await readImpersonation(req.payload, req.headers)
  // Local auto-login holds no session to refresh.
  if (!claims?.actorSession) {
    const exp = Math.floor(Date.now() / 1000) + args.collection.config.auth.tokenExpiration
    return { exp, refreshedToken: '', setCookie: false, user }
  }

  const actor = await req.payload.findByID({
    collection: 'managers',
    id: impersonatedBy.id,
    depth: 0,
    joins: false,
    overrideAccess: true,
  })
  const { exp, token } = await signSessionToken(req.payload, 'managers', actor, claims.actorSession)
  return { exp, refreshedToken: token, setCookie: true, user }
}

/**
 * Sign-out ends support's own session, and the impersonation with it.
 *
 * ⚠ Payload's logout removes `req.user`'s session, and `req.user` is the
 * target here — so without this, support's session row would outlive the
 * sign-out.
 */
export const endImpersonationOnLogout: CollectionAfterLogoutHook = async ({ req }) => {
  if (!impersonatorOf(req.user)) return

  const claims = await readImpersonation(req.payload, req.headers)
  if (claims?.actorSession) {
    const { sessions } = await req.payload.findByID({
      collection: 'managers',
      id: claims.actor,
      depth: 0,
      joins: false,
      overrideAccess: true,
      select: { sessions: true },
      req,
    })
    const allSessions = req.searchParams?.get('allSessions') === 'true'
    await req.payload.update({
      collection: 'managers',
      id: claims.actor,
      data: {
        sessions: allSessions
          ? []
          : (sessions ?? []).filter(({ id }) => id !== claims.actorSession),
      },
      depth: 0,
      req,
    })
  }

  const headers = new Headers(req.responseHeaders)
  headers.append('Set-Cookie', impersonationCookie(req.payload, null))
  req.responseHeaders = headers
}
