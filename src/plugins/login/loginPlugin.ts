import type { LoginCollectionConfig } from './types'
import type { CollectionBeforeOperationHook, CollectionConfig, Config, Field, Plugin } from 'payload'

import { redeemInvite } from './endpoints/redeemInvite'
import { redeemLink } from './endpoints/redeemLink'
import { redeemMagicLink } from './endpoints/redeemMagicLink'
import { requestMagicLink } from './endpoints/requestMagicLink'
import { managerJoins, MANAGERS_COLLECTION } from './grantSummary'
import {
  INVITATIONS_CRON,
  INVITATIONS_QUEUE,
  invitationFields,
  queueOnManagerField,
  queueOnRoles,
  sendInvitationsTask,
} from './invitations'

/**
 * When the outstanding sign-in link was minted.
 *
 * Three jobs in one timestamp: it is `requestMagicLink`'s throttle window, it
 * is the claim `redeemMagicLink` matches exactly (so a link works once), and
 * clearing it is what a fresh request does to the outstanding link.
 *
 * ⚠ **`update: () => false` is what keeps both endpoints its only writers.**
 * Self-access grants an account holder update on their own document, so without
 * it they could burn their own outstanding link, or stamp it in the future and
 * throttle their own sends forever. Both endpoints write it through
 * `overrideAccess: true`, so neither is affected.
 */
export const magicLinkIssuedAt: Field = {
  name: 'magicLinkIssuedAt',
  type: 'date',
  admin: {
    hidden: true,
  },
  access: {
    update: () => false,
  },
}

export interface LoginPluginOptions {
  /**
   * The auth collections to wire, one entry each. An empty list wires nothing.
   *
   * ⚠ A slug that names no collection is **silently ignored**, because plugins
   * fold before `sanitizeConfig` and throwing here would take the whole config
   * down on a typo. `tests/unit/login-plugin.spec.ts` pins that.
   */
  collections?: LoginCollectionConfig[]
  enabled?: boolean
  /**
   * Whether assignments queue invitations. Off for the seed scripts: an import
   * writes managers onto hundreds of regions and events, and the queue it left
   * behind would mail every one of them from production's next run. The fields
   * and the task are wired either way, so the schema never differs.
   */
  invitations?: boolean
}

/**
 * Payload's create sends its own "verify your email" whenever `auth.verify` is
 * configured, gated on nothing but an address. An account here is invited when
 * it is assigned something (`invitations.ts`), so the create sends nothing —
 * and `auth.verify` stays configured only for the `_verified` column it adds.
 *
 * `beforeOperation` because Payload reads `disableVerificationEmail` from the
 * args after those hooks run (`collections/operations/create.js`).
 */
const suppressCreateMail: CollectionBeforeOperationHook = ({ args, operation }) =>
  operation === 'create' ? { ...args, disableVerificationEmail: true } : args

/**
 * Drop a `password` sent on an update to a passwordless collection (#840).
 *
 * ⚠ **`create` ignores one under `disableLocalStrategy`; `update` does not.**
 * `collections/operations/utilities/update.js` hashes and stores a `password`
 * whenever `enableFields` is set — the object form `withoutPasswords` uses. No
 * route could spend it, but it would put back the hash the
 * `null_manager_password_hashes` migration removed, and self-access lets any
 * manager send one for their own row.
 *
 * `beforeOperation` because the utility reads `data.password` after it runs.
 */
const dropPassword: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (operation !== 'update' || !args.data || !('password' in args.data)) return args
  const { password: _dropped, ...data } = args.data as Record<string, unknown>
  return { ...args, data }
}

/**
 * Close every password route on a served collection (#840).
 *
 * `login`, `forgotPassword`, `resetPassword`, `verifyEmail`, `unlock` and
 * `registerFirstUser` each throw `Forbidden` on their first lines once this is
 * set, so the cut-over is enforced by the framework rather than by us. No
 * stored hash can be spent, and the admin create form loses its password input
 * with no custom view. Verified against `payload@3.87.1`.
 *
 * ⚠ **The object form, never the bare `true` `Clients` uses.**
 * `getAuthFields.js` gates `email`, the verification columns, the account-lock
 * columns and `sessions` on `!disableLocalStrategy || …enableFields`, so bare
 * `true` drops all four from the collection. This collection needs every one:
 * `email` addresses the link, `_verified` is the accepted flag, and `sessions`
 * is what `createSession` mints into.
 *
 * ⚠ **Two operations read the option differently, and both change behaviour.**
 * `refresh.js` tests `!disableLocalStrategy`, so an object skips its session
 * branch — a refresh no longer extends the session row or prunes expired ones.
 * `logout.js` tests `!== true`, so an object still clears the session, which is
 * what keeps a logout final. `tests/int/manager-passwordless.int.spec.ts` pins
 * both.
 *
 * ⚠ **`maxLoginAttempts: 0` is not redundant.** Payload defaults it to 5
 * (`collections/config/defaults.js:140`) whether or not a collection names it,
 * and `getAuthFields` keys the `loginAttempts` / `lockUntil` columns on that
 * number being above zero. Leaving it unset would keep a lock nothing can set
 * and nothing can clear — `unlock` is `Forbidden` too.
 *
 * Applied by the plugin rather than written into the collection so that
 * removing `loginPlugin()` returns it to passwords in one edit — but only for
 * an entry that asks (`LoginCollectionConfig.passwordless`), because which
 * auth columns a collection carries is not a plugin-wide decision.
 */
function withoutPasswords(auth: CollectionConfig['auth']): CollectionConfig['auth'] {
  const base = typeof auth === 'object' ? auth : {}
  return { ...base, disableLocalStrategy: { enableFields: true }, maxLoginAttempts: 0 }
}

/**
 * Where the admin panel's sign-in view lives. A barrel whose default export is
 * the view, as Payload's import map requires.
 */
const SIGN_IN_VIEW = '@/components/admin/SignIn'

/**
 * Replace Payload's admin login view with the sign-in view (#840).
 *
 * ⚠ **It is the only way in there now.** `disableLocalStrategy` makes Payload's
 * own view skip `LoginForm` (`@payloadcms/next/dist/views/Login/index.js`),
 * which leaves a logo and nothing else — drop this and `/admin/login` offers
 * nobody a way to sign in.
 *
 * `views.login` is the key Payload's route resolver looks up for its login
 * route before falling back to the built-in view, and the route stays public
 * whatever renders there (`views/Root/getRouteData.js`, `isPublicAdminRoute`).
 *
 * ⚠ **Every key of `admin`, `admin.components` and `views` is spread, never
 * replaced.** `src/payload.config.ts` declares `providers`, `beforeNavLinks`,
 * `Nav`, `beforeDashboard`, `graphics` and two custom `views` there — assigning
 * a fresh object would delete the project selector, the custom nav and both
 * custom views, and nothing would fail until someone opened the admin panel.
 *
 * Only for the collection the admin panel authenticates, and only when it is
 * `passwordless`: the view has no password field, so on a collection that
 * still has passwords it would hide the form that uses them.
 */
function adminWithSignInView(
  admin: Config['admin'],
  byslug: Map<string, LoginCollectionConfig>,
): Config['admin'] {
  const entry = admin?.user ? byslug.get(admin.user) : undefined
  if (!entry?.passwordless) return admin

  return {
    ...admin,
    components: {
      ...admin?.components,
      views: {
        ...admin?.components?.views,
        login: { Component: SIGN_IN_VIEW },
      },
    },
  }
}

/**
 * Passwordless sign-in: one hidden timestamp field plus the endpoints that
 * trade an emailed link for a session (#837).
 *
 * The endpoint definitions live under `./endpoints/` and are built per
 * configured collection, so the plugin owns the whole feature rather than wiring
 * definitions kept beside one collection. `./mail.ts` renders and addresses the
 * message for every served collection, so a `LoginCollectionConfig` supplies
 * only what reads a field this plugin cannot know the name of — the eligibility
 * predicate and the branding project. `src/collections/Managers/login.ts` is the
 * one in use.
 *
 * ⚠ Register it **before** `accessPlugin`, which must stay last. The reason is
 * `accessPlugin`'s own contract, **not** field survival: it re-maps
 * `collection.fields` only for a translatable collection, and `managers` is not
 * one.
 *
 * ⚠ Plugins are folded left to right, **before `sanitizeConfig`**, so
 * `collection.endpoints` may still be `undefined`. The array is spread onto
 * rather than replaced — `Managers` already declares `endpoints: [setProject]`,
 * and replacing it would delete the project switcher.
 *
 * Deliberately `onInit`-free: `config.onInit` is a single function, and
 * `src/payload.config.ts` already points it at `seedPreviewAdmin`.
 *
 * @example
 * ```typescript
 * import { managersLogin } from '@/collections/Managers/login'
 * import { loginPlugin } from '@/plugins/login'
 *
 * plugins: [
 *   loginPlugin({ collections: [managersLogin] }),
 *   // accessPlugin stays last
 * ]
 * ```
 */
export function loginPlugin(options: LoginPluginOptions = {}): Plugin {
  const { collections = [], enabled, invitations = true } = options
  if (enabled === false || collections.length === 0) return (config) => config

  const byslug = new Map(collections.map((entry) => [entry.slug as string, entry]))

  return (config) => {
    // Invitations need per-locale roles and manager joins, which only
    // `managers` has — see `grantSummary.ts`.
    const invitesFor = byslug.get(MANAGERS_COLLECTION)
    const joins = invitesFor
      ? managerJoins(config.collections?.find((c) => c.slug === MANAGERS_COLLECTION)?.fields ?? [])
      : []

    return {
      ...config,
      admin: adminWithSignInView(config.admin, byslug),
      collections: config.collections?.map((collection) => {
        const entry = byslug.get(collection.slug)
        const namesManagers = joins.filter((join) => join.collection === collection.slug)

        const withQueue =
          invitations && namesManagers.length > 0
            ? {
                ...collection,
                hooks: {
                  ...collection.hooks,
                  afterChange: [
                    ...(collection.hooks?.afterChange ?? []),
                    ...namesManagers.map((join) => queueOnManagerField(join.collection, join.on)),
                  ],
                },
              }
            : collection
        if (!entry) return withQueue

        const invites = entry === invitesFor
        return {
          ...withQueue,
          ...(entry.passwordless ? { auth: withoutPasswords(withQueue.auth) } : {}),
          fields: [...withQueue.fields, magicLinkIssuedAt, ...(invites ? invitationFields : [])],
          hooks: {
            ...withQueue.hooks,
            beforeOperation: [
              ...(withQueue.hooks?.beforeOperation ?? []),
              suppressCreateMail,
              ...(entry.passwordless ? [dropPassword] : []),
            ],
            afterChange: [
              ...(withQueue.hooks?.afterChange ?? []),
              ...(invites && invitations ? [queueOnRoles] : []),
            ],
          },
          endpoints: [
            ...(collection.endpoints || []),
            requestMagicLink(entry),
            // ⚠ `POST`-only, and that is the whole defence against a mail scanner
            // spending the link. The `GET` a delivered link performs is answered by
            // `requestPagePath`'s own page, which writes nothing.
            redeemMagicLink(entry),
            // The invitation's own audience, refused by the route above and
            // refusing its token in turn — see `redeemInvite`.
            redeemInvite(entry),
            // A reminder's link: signs in, then lands on the page it names.
            redeemLink(entry),
          ],
        }
      }),
      jobs: invitesFor
        ? {
            ...config.jobs,
            tasks: [...(config.jobs?.tasks ?? []), sendInvitationsTask(invitesFor)],
            // A schedule only enqueues; an `autoRun` entry is what runs the queue.
            autoRun: Array.isArray(config.jobs?.autoRun)
              ? [...config.jobs.autoRun, { cron: INVITATIONS_CRON, queue: INVITATIONS_QUEUE }]
              : config.jobs?.autoRun,
          }
        : config.jobs,
    }
  }
}
