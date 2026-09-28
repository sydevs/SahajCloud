import type { LoginCollectionConfig } from './types'
import type { CollectionBeforeOperationHook, Config, Field, Plugin } from 'payload'

import { redeemInvite } from './endpoints/redeemInvite'
import { redeemLink } from './endpoints/redeemLink'
import { redeemMagicLink } from './endpoints/redeemMagicLink'
import { requestMagicLink } from './endpoints/requestMagicLink'
import { managerJoins, ROLES_COLLECTION } from './grantSummary'
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
 * ⚠ **A second `/` or `\` makes it off-origin.** This value reaches
 * `RequestSignInLink`'s `to` unprefixed, and a browser normalises `/\host` to
 * the protocol-relative `//host` — so testing for `//` alone leaves a way onto
 * the login form. The plugin's other two consumers compose it after an absolute
 * origin, which is why this is the only place that has to ask.
 */
const isSiteAbsolute = (path: string) => path.startsWith('/') && !/^\/[/\\]/.test(path)

/**
 * Put the "Email me a sign-in link" control under the admin login form.
 *
 * ⚠ **Every key of `admin` and of `admin.components` is spread, never
 * replaced.** `src/payload.config.ts` declares `providers`, `beforeNavLinks`,
 * `Nav`, `beforeDashboard`, `graphics` and `views` there — assigning a fresh
 * object would delete the project selector, the custom nav and both custom
 * views, and nothing would fail until someone opened the admin panel.
 *
 * Only the collection the admin panel authenticates gets one: `afterLogin` is a
 * slot on that one form, so a second served collection has no form to add to.
 */
function adminWithSignInLink(
  admin: Config['admin'],
  byslug: Map<string, LoginCollectionConfig>,
): Config['admin'] {
  const entry = admin?.user ? byslug.get(admin.user) : undefined
  if (!entry || !isSiteAbsolute(entry.requestPagePath)) return admin

  return {
    ...admin,
    components: {
      ...admin?.components,
      afterLogin: [
        ...(admin?.components?.afterLogin ?? []),
        {
          path: '@/components/admin/RequestSignInLink',
          clientProps: { href: entry.requestPagePath },
        },
      ],
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
    const invitesFor = byslug.get(ROLES_COLLECTION)
    const joins = invitesFor
      ? managerJoins(config.collections?.find((c) => c.slug === ROLES_COLLECTION)?.fields ?? [])
      : []

    return {
      ...config,
      admin: adminWithSignInLink(config.admin, byslug),
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
          fields: [...withQueue.fields, magicLinkIssuedAt, ...(invites ? invitationFields : [])],
          hooks: {
            ...withQueue.hooks,
            beforeOperation: [...(withQueue.hooks?.beforeOperation ?? []), suppressCreateMail],
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
