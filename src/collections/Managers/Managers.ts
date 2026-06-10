import type { CollectionConfig } from 'payload'

import {
  buildDefaultNotificationPreferences,
  NOTIFICATION_TYPES,
  validateNotificationPreferences,
} from '@/components/admin/NotificationPreferences/config'
import { legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { adminOnlyFieldAccess, getRoleOptions, getProjectOptions } from '@/plugins/access'

export const Managers: CollectionConfig = {
  slug: 'managers',
  // Access control is applied by accessPlugin with self-access pattern
  auth: {
    verify: {
      generateEmailHTML: ({ token, user }) => {
        const verifyURL = `${getServerUrl()}/admin/verify/${token}`
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #F07855 0%, #FF9477 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0;">We Meditate Admin</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: #F07855; margin-top: 0;">Verify Your Email Address</h2>
    <p>Hello <strong>${user.name || user.email}</strong>,</p>
    <p>Thank you for creating an account with We Meditate Admin. To complete your registration and access the admin panel, please verify your email address by clicking the button below:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyURL}" style="background: linear-gradient(135deg, #F07855 0%, #FF9477 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
        Verify Email Address
      </a>
    </div>
    <p style="color: #666; font-size: 14px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${verifyURL}" style="color: #F07855; word-break: break-all;">${verifyURL}</a>
    </p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; margin: 0;">
      If you didn't create this account, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
        `.trim()
      },
      generateEmailSubject: () => 'Verify Your Email - We Meditate Admin',
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

            // Custom Resource Access
            {
              name: 'customResourceAccess',
              type: 'relationship',
              relationTo: ['pages'],
              hasMany: true,
              admin: {
                description:
                  'Grant update access to specific documents. Useful for giving access to individual pages without broader permissions.',
                condition: (data) => data.type === 'manager',
              },
              access: {
                // Only admins can update custom resource access
                update: adminOnlyFieldAccess,
              },
            },

            // Read-only inverse of the region/event responsibility relationships.
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
                  name: 'platform',
                  type: 'select',
                  required: true,
                  options: [
                    { label: 'WhatsApp', value: 'whatsapp' },
                    { label: 'Telegram', value: 'telegram' },
                    { label: 'WeChat', value: 'wechat' },
                  ],
                  admin: { components: { Field: '@/components/admin/ToggleGroupField' } },
                },
                {
                  name: 'identifier',
                  type: 'text',
                  required: true,
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
