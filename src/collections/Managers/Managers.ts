import type { CollectionConfig } from 'payload'

import { createElement } from 'react'

import {
  buildDefaultNotificationPreferences,
  NOTIFICATION_TYPES,
  validateNotificationPreferences,
} from '@/components/admin/NotificationPreferences/config'
import { ResetPasswordEmail } from '@/emails/ResetPasswordEmail'
import { VerifyEmail } from '@/emails/VerifyEmail'
import { legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { adminOnlyFieldAccess, getRoleOptions, getProjectOptions } from '@/plugins/access'
import { getEmailBrand, renderEmail } from '@/plugins/email'

export const Managers: CollectionConfig = {
  slug: 'managers',
  // Access control is applied by accessPlugin with self-access pattern
  auth: {
    verify: {
      generateEmailHTML: ({ token, user }) =>
        renderEmail(
          createElement(VerifyEmail, {
            name: user.name || user.email,
            verifyUrl: `${getServerUrl()}/admin/verify/${token}`,
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
      // This enables live preview
      secure: true, // Required for cross-origin
      sameSite: 'None', // Allow cross-origin cookie sharing
    },
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
  },
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'type', '_verified'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'currentProject',
      type: 'select',
      options: [
        { value: '', label: 'Sahaj Cloud' }, // Empty string represents admin view
        ...getProjectOptions(),
      ],
      admin: {
        hidden: true,
      },
      hooks: {
        // Convert null to empty string when saving to database
        beforeChange: [
          ({ value }) => {
            return value === '' ? null : value
          },
        ],
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
              options: getRoleOptions(['meditations-editor', 'path-editor', 'web-translator']),
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
              admin: { description: 'Pages this manager can edit.' },
            },
            {
              name: 'managedRegions',
              type: 'join',
              collection: 'regions',
              on: 'managers',
              admin: { description: 'Regions this manager is responsible for.' },
            },
            {
              name: 'managedEvents',
              type: 'join',
              collection: 'events',
              on: 'manager',
              admin: { description: 'Events this manager owns.' },
            },
          ],
        },
        {
          // All Contact-tab fields are self-editable — no adminOnlyFieldAccess.
          label: 'Contact',
          fields: [
            {
              name: 'languageCode',
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
              validate: (value: unknown) => validateNotificationPreferences(value),
              admin: {
                description: 'Choose how and how often to receive each kind of notification.',
                custom: { notificationTypes: NOTIFICATION_TYPES },
                components: { Field: '@/components/admin/NotificationPreferences' },
              },
            },
          ],
        },
      ],
    },
    ...legacyMigrationFields(),
  ],
}
