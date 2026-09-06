import type { CollectionConfig } from 'payload'

import { json as jsonFieldValidation } from 'payload/shared'
import { createElement } from 'react'

import {
  buildDefaultNotificationPreferences,
  NOTIFICATION_PREFERENCES_SCHEMA_URI,
  NOTIFICATION_TYPES,
  notificationPreferencesJsonSchema,
  validateNotificationPreferences,
} from '@/components/admin/NotificationPreferences/config'
import { ResetPasswordEmail } from '@/emails/ResetPasswordEmail'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { hideUntilCreated, legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { adminOnlyFieldAccess, getRoleOptions, getProjectOptions } from '@/plugins/access'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { setProject } from './endpoints/setProject'

export const Managers: CollectionConfig = {
  slug: 'managers',
  // Access control is applied by accessPlugin with self-access pattern
  // `setProject` is the lightweight self-only Current Project write path (#532).
  endpoints: [setProject],
  auth: {
    // Auth emails intentionally use the default brand (wemeditate-web) rather
    // than the recipient's currentProject — branding is an explicit per-send
    // choice, so the templates' `project` prop is left at its default here (#483).
    verify: {
      generateEmailHTML: ({ token, user }) =>
        renderEmail(
          createElement(VerifyEmail, {
            name: user.name || user.email,
            // The slug segment is required, and dropping it fails silently:
            // `isPublicAdminRoute` waves any `/verify/` path past the auth gate,
            // so `/admin/verify/:token` reaches the login form, not a 404 (#320).
            verifyUrl: `${getServerUrl()}/admin/managers/verify/${token}`,
          }),
        ),
      generateEmailSubject: () => `Verify Your Email — ${getEmailBrand().productName}`,
    },
    forgotPassword: {
      generateEmailHTML: (args) =>
        renderEmail(
          createElement(ResetPasswordEmail, {
            name: args?.user?.name || args?.user?.email || '',
            resetUrl: `${getServerUrl()}/admin/reset/${args?.token}`,
          }),
        ),
      generateEmailSubject: () => `Reset Your Password — ${getEmailBrand().productName}`,
    },
    cookies: {
      // Live preview is authenticated via the x-sahajcloud-preview-secret header,
      // not this cookie. Use Lax to avoid unnecessary cross-site exposure.
      secure: true, // HTTPS only
      sameSite: 'Lax', // Same-site cookies (Payload default)
    },
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
  },
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'type', '_verified'],
  },
  // NOTE: `roles` below is `localized`, and this collection is an auth collection.
  // accessPlugin detects that pair and attaches the auth strategy and the three
  // auth-response hooks that keep a manager's roles resolved at every locale —
  // see `src/plugins/access/localizedRolesAuth.ts` (#665). Nothing to wire here.
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
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
              options: getRoleOptions([
                'meditations-editor',
                'path-editor',
                'web-translator',
                'atlas-manager',
              ]),
              admin: {
                description:
                  'Assign roles for each locale. Different roles can be assigned for different languages.',
                condition: (data) => data.type === 'manager',
                components: {
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
          ],
        },
        {
          // All Contact-tab fields are self-editable — no adminOnlyFieldAccess.
          label: 'Contact',
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
              admin: { description: 'Messaging handles used to deliver notifications.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'platform',
                      type: 'select',
                      required: true,
                      options: [
                        { label: 'WhatsApp', value: 'whatsapp' },
                        { label: 'Telegram', value: 'telegram' },
                        { label: 'WeChat', value: 'wechat' },
                      ],
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
            {
              name: 'notificationPreferences',
              type: 'json',
              defaultValue: buildDefaultNotificationPreferences(),
              jsonSchema: {
                uri: NOTIFICATION_PREFERENCES_SCHEMA_URI,
                fileMatch: [NOTIFICATION_PREFERENCES_SCHEMA_URI],
                schema: notificationPreferencesJsonSchema,
              },
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
                custom: { notificationTypes: NOTIFICATION_TYPES },
                components: { Field: '@/components/admin/NotificationPreferences' },
              },
            },
            {
              // Watermark for the registration digest run: the start of the last
              // digest sent to this manager. The digest job covers registrations
              // created after it and advances it to the run's start, so no
              // registration lands in two digests and a retry re-sends nothing.
              // Only consulted when this manager's `event_registration` frequency
              // is a summary cadence; machine-managed, so hidden from the UI.
              name: 'lastRegistrationDigestSentAt',
              type: 'date',
              admin: { readOnly: true, hidden: true },
            },
          ],
        },
      ],
    },
    ...legacyMigrationFields(),
  ],
}
