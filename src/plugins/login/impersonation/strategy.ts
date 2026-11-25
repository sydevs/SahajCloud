import type { AuthStrategy, AuthStrategyFunctionArgs, PayloadRequest } from 'payload'

import { authenticateJWT, hydrateAuthUser, isOwnRow } from '@/plugins/access'

import { type ImpersonationClaims, impersonationCookie, readImpersonation } from './cookie'
import { type GateUser, isSupportAccount, mayBeImpersonated } from './gate'

const IMPERSONATION_STRATEGY = 'support-impersonation'

type AuthUser = NonNullable<PayloadRequest['user']>

/**
 * Stand the manager the cookie names in for the support account.
 *
 * Prepended to `managers` by `loginPlugin`, ahead of `localized-roles`. With no cookie it
 * yields no user and costs nothing, and the next strategy authenticates the
 * request as usual.
 *
 * ⚠ **Every request re-checks all of it** — support's own session, that the
 * account is still the support account, and that the target is still an
 * active manager — so a demotion or a sign-out on either side ends the
 * impersonation on the next request. A refused cookie answers with support
 * themself, and clears itself where the response can carry the header.
 *
 * ⚠ **The target goes through `hydrateAuthUser`**, the per-locale role load
 * an ordinary request gets. Loaded any other way it would carry flat,
 * default-locale roles, and the view support is debugging would be wrong.
 */
export const impersonationStrategy: AuthStrategy = {
  name: IMPERSONATION_STRATEGY,
  authenticate: async (args) => {
    const claims = await readImpersonation(args.payload, args.headers)
    if (!claims) return { user: null }

    const { user: actor } = await authenticateJWT(args, 'managers')
    if (!actor) return { user: null }

    // The cookie must still name this support account, on this very session.
    const target =
      isSupportAccount(actor) &&
      isOwnRow(actor.id, claims.actor) &&
      ((actor as GateUser)._sid ?? null) === claims.actorSession
        ? await readTarget(args, claims)
        : null
    if (!target) {
      return {
        user: await hydrateAuthUser(args.payload, actor),
        responseHeaders: new Headers({ 'Set-Cookie': impersonationCookie(args.payload, null) }),
      }
    }

    const user = {
      ...target,
      collection: 'managers',
      _strategy: IMPERSONATION_STRATEGY,
      currentProject: claims.project,
      impersonatedBy: { id: actor.id, email: (actor as GateUser).email! },
    } as AuthUser
    return { user: await hydrateAuthUser(args.payload, user) }
  },
}

/** The target as Payload's JWT strategy loads a user, while it may still be impersonated. */
async function readTarget(args: AuthStrategyFunctionArgs, claims: ImpersonationClaims) {
  const { auth } = args.payload.collections.managers.config
  const target = await args.payload.findByID({
    collection: 'managers',
    id: claims.target,
    depth: args.isGraphQL ? 0 : auth.depth,
    disableErrors: true,
    fallbackLocale: args.req?.fallbackLocale,
    locale: args.req?.locale,
    overrideAccess: true,
    req: args.req,
  })
  if (!target || !mayBeImpersonated(target)) return null
  return target
}
