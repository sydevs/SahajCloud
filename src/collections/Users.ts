import { adminOnlyAccess } from '@/lib/accessControl'
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  access: adminOnlyAccess(),
  auth: {
    verify: false, // TODO: Re-enable this but ensure there are proper warnings.
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
  },
  admin: {
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'active', 'role'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'super-admin',
      options: [
        {
          label: 'Full Access',
          value: 'super-admin',
        },
        // Future roles can be added here
      ],
      admin: {
        description: 'Access level for this client (currently only Full Access)',
      },
    },
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
