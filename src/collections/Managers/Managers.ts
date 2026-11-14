import type { CollectionConfig } from 'payload'

import { json as jsonFieldValidation } from 'payload/shared'
import { z } from 'zod'

import { hideUntilCreated, legacyMigrationFields } from '@/fields'
import { jsonField } from '@/fields/jsonField'
import { getLanguageOptions } from '@/lib/locales'
import {
  CONTACT_PLATFORMS,
  buildDefaultNotificationPreferences,
  validateNotificationPreferences,
} from '@/lib/notifications/preferences'
import { adminOnlyFieldAccess, getRoleOptions, getProjectOptions } from '@/plugins/access'

import { lockManagerFieldReads } from './access'
import { setProject } from './endpoints/setProject'
import { MANAGER_NOTIFICATIONS_TAB } from './login'

export const Managers: CollectionConfig = {
  slug: 'managers',
  // Access control is applied by accessPlugin with self-access pattern
  // `setProject` is the lightweight self-only Current Project write path (#532).
  endpoints: [setProject],
  auth: {
    // 24 hours, in seconds (Payload's default is 2). It bounds the JWT, the
    // session row and the cookie alike, and `createSession` reads it, so a
    // sign-in link's session lasts as long.
    tokenExpiration: 60 * 60 * 24,
    // Configured for the `_verified` column, not for Payload's own verify mail:
    // the JWT strategy yields no user while that column is false, so it is the
    // accepted/not-accepted flag the invitation flow turns on. `loginPlugin`
    // stops the create from sending that mail — an account is invited when it
    // is assigned something instead (#839).
    verify: true,
    cookies: {
      // Live preview is authenticated via the x-sahajcloud-preview-secret header,
      // not this cookie. Use Lax to avoid unnecessary cross-site exposure.
      secure: true, // HTTPS only
      sameSite: 'Lax', // Same-site cookies (Payload default)
    },
    // No `forgotPassword`, `maxLoginAttempts` or `lockTime`: `loginPlugin` sets
    // `disableLocalStrategy`, so a password reaches no route to be spent, reset
    // or counted against a lock (#840).
  },
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'type', '_verified'],
    // The Events list's Manager column batch-fetches this collection whole,
    // four join subqueries per page. With this on, that batch selects `name`
    // alone.
    enableListViewSelectAPI: true,
  },
  // NOTE: `roles` below is `localized`, and this collection is an auth collection.
  // accessPlugin detects that pair and attaches the auth strategy and the three
  // auth-response hooks that keep a manager's roles resolved at every locale —
  // see `src/plugins/access/localizedRolesAuth.ts` (#665). Nothing to wire here.
  // Every field but `name` is locked to the row's holder and to admins (#908).
  fields: lockManagerFieldReads([
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    // Base auth fields, declared bare so the lock has something to merge onto.
    // ⚠ At the TOP LEVEL only: `mergeBaseFields` matches by name at the level
    // it is handed, so a copy in a tab appends a second field.
    // ⚠ Each restates its label, or the merge keeps the one `sanitizeFields`
    // derived from the name — a list column headed `_verified`.
    { name: 'email', type: 'email', label: ({ t }) => t('general:email') },
    { name: '_verified', type: 'checkbox', label: ({ t }) => t('authentication:verified') },
    {
      // `null` is the admin "All Content" view, and it has no option of its own.
      // The field is `admin.hidden`, so Payload never renders this select, and
      // `POST /api/managers/set-project` is the only writer. See #671 and
      // `tests/unit/manager-current-project.spec.ts`.
      name: 'currentProject',
      type: 'select',
      options: getProjectOptions(),
      admin: {
        hidden: true,
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Access',
          fields: [
            // Manager type field (segmented control for access level)
            {
              name: 'type',
              type: 'select',
              required: true,
              defaultValue: 'manager',
              options: [
                { label: 'Inactive', value: 'inactive' },
                { label: 'Manager', value: 'manager' },
                { label: 'Admin', value: 'admin' },
              ],
              admin: {
                description:
                  "Set the manager's access level. Admin grants full access, Manager uses role-based permissions, Inactive blocks all access.",
                components: {
                  Field: '@/components/admin/ToggleGroupField',
                },
              },
              access: {
                // Only admins can update the type field
                update: adminOnlyFieldAccess,
              },
            },

            // Roles field (localized multi-select)
            {
              name: 'roles',
              type: 'select',
              hasMany: true,
              localized: true,
              // The derived roles are deliberately absent: each is read off a
              // page, region or event listing, and `getRoleOptions` refuses one here.
              // `RolesField` still shows a held one, as a chip nothing removes.
              options: getRoleOptions(['meditations-editor', 'path-editor', 'web-translator']),
              admin: {
                description:
                  'Assign roles for each locale. Different roles can be assigned for different languages.',
                condition: (data) => data.type === 'manager',
                components: {
                  Field: '@/components/admin/RolesField',
                  afterInput: ['@/components/admin/PermissionsTable'],
                },
              },
              access: {
                // Only admins can update roles
                update: adminOnlyFieldAccess,
              },
            },

            // Read-only inverses of the document-level manager relationships.
            // Each is the join side of a `managers`/`manager` field that grants
            // this manager document-level read + edit access (see
            // src/plugins/access/documentManagers.ts).
            {
              name: 'managedPages',
              type: 'join',
              collection: 'pages',
              on: 'managers',
              admin: {
                condition: hideUntilCreated,
                description: 'Pages this manager can edit.',
              },
            },
            {
              name: 'managedRegions',
              type: 'join',
              collection: 'regions',
              on: 'managers',
              admin: {
                condition: hideUntilCreated,
                description: 'Regions this manager is responsible for.',
              },
            },
            {
              name: 'managedEvents',
              type: 'join',
              collection: 'events',
              on: 'manager',
              admin: {
                condition: hideUntilCreated,
                description: 'Events this manager owns.',
              },
            },
            {
              name: 'managedClients',
              type: 'join',
              collection: 'clients',
              on: 'managers',
              // ⚠ Atlas services only: this join is the `atlas-service-manager`
              // role, and a manager listed on an app's key looks after no atlas.
              where: { roles: { contains: 'sahaj-atlas-client' } },
              admin: {
                condition: hideUntilCreated,
                description: 'Sahaj Atlas services — websites — this manager looks after.',
              },
            },
          ],
        },
        {
          // All Contact-tab fields are self-editable — no adminOnlyFieldAccess.
          // Its label is what an invitation's "Configure notifications" opens.
          label: MANAGER_NOTIFICATIONS_TAB,
          fields: [
            {
              name: 'language',
              type: 'select',
              options: getLanguageOptions(),
              admin: { description: "The manager's preferred language." },
            },
            {
              name: 'contactDetails',
              type: 'array',
              labels: { singular: 'Contact Method', plural: 'Contact Methods' },
              admin: {
                description:
                  'Messaging handles used to deliver notifications. Email goes to the sign-in address above the tabs.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'platform',
                      type: 'select',
                      required: true,
                      // The preferences table names a chosen platform from the
                      // same list, so neither can offer one the other cannot say.
                      options: [...CONTACT_PLATFORMS],
                    },
                    {
                      name: 'identifier',
                      type: 'text',
                      required: true,
                      label: 'Phone / Username',
                      admin: { description: 'Phone number or username for this platform.' },
                    },
                    {
                      name: 'verified',
                      type: 'checkbox',
                      admin: {
                        readOnly: true,
                        description: 'Set by the import / a future verification flow.',
                      },
                    },
                  ],
                },
              ],
            },
            jsonField({
              name: 'notificationPreferences',
              defaultValue: buildDefaultNotificationPreferences(),
              // Open keys, typed value. `NOTIFICATION_TYPES` stays the source
              // of truth for which keys the admin renders, and the frequency is
              // checked as a string rather than against `frequencyOptions`:
              // retiring a type or an option must not strand the managers still
              // on it. Why there are no per-key `properties`, and why the value
              // is typed at all, are in `src/collections/AGENTS.md` under "A
              // JSON column declares its shape".
              schemaTitle: 'NotificationPreferences',
              schema: z.record(
                z.string(),
                // The value stays open for the same reason the keys do.
                z.looseObject({
                  frequency: z.string().optional(),
                  method: z.string().optional(),
                }),
              ),
              // Composed, not replaced: supplying `validate` takes over from the
              // built-in one, which is what runs the schema above. The extra
              // rule — a method is required unless the frequency is "Never" —
              // spans two keys, so no schema can carry it.
              validate: (value, options) => {
                const shape = jsonFieldValidation(value, options)
                if (shape !== true) return shape
                return validateNotificationPreferences(value)
              },
              admin: {
                description: 'Choose how and how often to receive each kind of notification.',
                components: { Field: '@/components/admin/NotificationPreferences' },
              },
            }),
            // The digest run's per-role, per-section watermarks (`SendDigests`).
            // Open at both levels for the reason `src/collections/AGENTS.md`
            // gives for a job-written JSON column.
            // ⚠ **`access.update: () => false` makes it the job's alone**: a
            // manager who could rewind a mark could have their email re-sent.
            jsonField({
              name: 'digestWatermarks',
              schemaTitle: 'DigestWatermarks',
              schema: z
                .record(
                  z.string(),
                  z.record(
                    z.string(),
                    z.string().describe('ISO start of the last run whose email carried this key.'),
                  ),
                )
                .nullable(),
              access: { update: () => false },
              admin: { readOnly: true, hidden: true },
            }),
          ],
        },
      ],
    },
    ...legacyMigrationFields(),
  ]),
}
