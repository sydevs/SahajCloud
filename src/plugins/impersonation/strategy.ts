import type {
  AuthStrategy,
  AuthStrategyFunctionArgs,
  AuthStrategyResult,
  PayloadRequest,
} from 'payload'

import { authenticateWithLocalizedRoles, hydrateAuthUser } from '@/plugins/access'

import { type ImpersonationClaims, readImpersonation } from './cookie'
import { type Impersonator, isSupportAccount, mayImpersonate } from './gate'

export const IMPERSONATION_STRATEGY = 'support-impersonation'

type AuthUser = NonNullable<PayloadRequest['user']>

/**
 * The support account, authenticated exactly as an ordinary request would be,
 * when it is the one the cookie names and is still entitled to impersonate.
 */
export async function authenticateImpersonator(
  args: AuthStrategyFunctionArgs,
  claims: ImpersonationClaims,
): Promise<AuthUser | null> {
  const { user } = await authenticateWithLocalizedRoles(args, 'managers')
  if (!user || !isSupportAccount(user)) return null
  if (String(user.id) !== String(claims.actor)) return null
  if (((user as { _sid?: string })._sid ?? null) !== claims.actorSession) return null
  return user
}

/**
 * Stand the manager the cookie names in for the support account.
 *
 * Runs ahead of `localized-roles` on `managers`. With no cookie it yields no
 * user, and the next strategy authenticates the request as usual — so does
 * every refusal, which is what makes a stale cookie harmless: support simply
 * reads as themself again.
 *
 * ⚠ **Every request re-checks all of it** — support's own session, that the
 * account is still the support address and an admin, and that the target is
 * still an active non-admin manager. A demotion, a sign-out or a role change
 * on either side ends the impersonation on the next request.
 *
 * ⚠ **The target goes through `hydrateAuthUser`**, the same per-locale role
 * load an ordinary request gets. Loaded any other way it would carry flat,
 * default-locale roles, and the view support is debugging would be wrong.
 */
export function createImpersonationStrategy(): AuthStrategy {
  return {
    name: IMPERSONATION_STRATEGY,
    authenticate: async (args): Promise<AuthStrategyResult> => {
      const claims = await readImpersonation(args.payload, args.headers)
      if (!claims) return { user: null }

      const actor = await authenticateImpersonator(args, claims)
      if (!actor) return { user: null }

      const collection = args.payload.collections.managers.config
      const target = await args.payload
        .findByID({
          collection: 'managers',
          id: claims.target,
          depth: args.isGraphQL ? 0 : collection.auth.depth,
          fallbackLocale: args.req?.fallbackLocale,
          locale: args.req?.locale,
          overrideAccess: true,
          req: args.req,
        })
        .catch(() => null)
      if (!target || !mayImpersonate(actor, target)) return { user: null }
      if (collection.auth.verify && !target._verified) return { user: null }

      const impersonatedBy: Impersonator = {
        id: actor.id,
        email: (actor as { email: string }).email,
        name: (actor as { name?: string | null }).name ?? null,
      }

      const user = await hydrateAuthUser(args.payload, {
        ...target,
        collection: 'managers',
        _strategy: IMPERSONATION_STRATEGY,
        currentProject: claims.project,
        impersonatedBy,
      } as unknown as AuthUser)

      return { user }
    },
  }
}
