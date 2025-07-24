import type { CollectionConfig } from 'payload'

export const Clients: CollectionConfig = {
  slug: 'clients',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true, // No password login for clients
  },
  admin: {
    group: 'Admin',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role', 'active', 'apiUsage.dailyRequests'],
    listSearchableFields: ['name', 'email', 'description'],
  },
  access: {
    // Only admins can manage clients
    create: ({ req: { user } }) => !!(user && user.collection !== 'clients'),
    read: ({ req: { user } }) => !!(user && user.collection !== 'clients'),
    update: ({ req: { user } }) => !!(user && user.collection !== 'clients'),
    delete: ({ req: { user } }) => !!(user && user.collection !== 'clients'),
    // Clients can't access their own collection via API
    readVersions: ({ req: { user } }) => !!(user && user.collection !== 'clients'),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Unique name to identify this API client',
      },
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      admin: {
        description: 'Contact email for this API client',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Describe the purpose and usage of this API client',
      },
    },
    {
      name: 'role',
      type: 'select',
      options: [
        {
          label: 'Full Access (Read Only)',
          value: 'full-access',
        },
      ],
      defaultValue: 'full-access',
      required: true,
      admin: {
        description: 'Access level for this client (all clients have read-only access)',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Deactivate to temporarily disable API access',
      },
    },
    {
      name: 'contacts',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Users who manage and receive notifications for this client',
      },
    },
    {
      name: 'lastUsed',
      type: 'date',
      admin: {
        readOnly: true,
        date: {
          displayFormat: 'yyyy-MM-dd HH:mm:ss',
        },
        description: 'Last time this API key was used',
      },
    },
    {
      name: 'apiUsage',
      type: 'group',
      admin: {
        description: 'API usage statistics',
      },
      fields: [
        {
          name: 'totalRequests',
          type: 'number',
          defaultValue: 0,
          min: 0,
          admin: {
            readOnly: true,
            description: 'Total API requests made by this client',
          },
        },
        {
          name: 'dailyRequests',
          type: 'number',
          defaultValue: 0,
          min: 0,
          admin: {
            readOnly: true,
            description: 'API requests made today',
            condition: (_data) => {
              // Condition functions must return boolean
              // Style properties are not supported in conditions
              return true
            },
          },
        },
        {
          name: 'lastResetDate',
          type: 'date',
          admin: {
            readOnly: true,
            date: {
              displayFormat: 'yyyy-MM-dd',
            },
            description: 'Last date when daily counter was reset',
          },
        },
      ],
    },
  ],
  hooks: {
    beforeOperation: [
      async ({ args, operation }) => {
        // Prevent clients from modifying anything
        if (
          args.req.user?.collection === 'clients' &&
          ['create', 'update', 'delete'].includes(operation)
        ) {
          throw new Error('API clients have read-only access')
        }
      },
    ],
  },
}