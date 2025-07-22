import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    verify: false, // TODO: Re-enable this but ensure there are proper warnings.
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
}
