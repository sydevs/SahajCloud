import { adminOnlyAccess, createPermissionsField } from '@/lib/accessControl'
import type { CollectionConfig } from 'payload'

export const Managers: CollectionConfig = {
  slug: 'managers',
  access: adminOnlyAccess(),
  auth: {
    verify: false, // TODO: Re-enable this but ensure there are proper warnings.
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
  },
  admin: {
    hidden: ({ user }) => !user?.admin,
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'active', 'admin'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'admin',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Admin users bypass all permission restrictions and have complete access to all collections and features.',
      },
    },
    createPermissionsField({ excludedLevels: ['read'] }),
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Enable or disable this user',
      },
    },
  ],
}
