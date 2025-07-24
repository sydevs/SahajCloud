import type { Access, FieldAccess } from 'payload'

// Helper to check if user is an API client
export const isAPIClient = (user: any): boolean => {
  return user?.collection === 'clients'
}

// Read-only access for API clients
export const clientReadAccess: Access = ({ req: { user } }) => {
  // If no user, deny access
  if (!user) return false
  
  // If user is an API client, check if they're active
  if (isAPIClient(user)) {
    return (user as any).active === true
  }
  
  // Otherwise, allow access (for admin users)
  return true
}

// Deny all write operations for API clients
export const clientWriteAccess: Access = ({ req: { user } }) => {
  // If user is an API client, deny write access
  if (isAPIClient(user)) {
    return false
  }
  
  // Otherwise, allow access (for admin users)
  return !!user
}

// Field-level read access (same as collection level)
export const clientFieldReadAccess: FieldAccess = ({ req: { user } }) => {
  if (!user) return false
  
  if (isAPIClient(user)) {
    return (user as any).active === true
  }
  
  return true
}

// Field-level write access (deny for clients)
export const clientFieldWriteAccess: FieldAccess = ({ req: { user } }) => {
  if (isAPIClient(user)) {
    return false
  }
  
  return !!user
}

// Helper to apply client access control to a collection
export const applyClientAccessControl = (existingAccess: any = {}) => {
  return {
    read: existingAccess.read || clientReadAccess,
    create: existingAccess.create || clientWriteAccess,
    update: existingAccess.update || clientWriteAccess,
    delete: existingAccess.delete || clientWriteAccess,
    readVersions: existingAccess.readVersions || clientReadAccess,
    // Keep any other existing access controls
    ...Object.keys(existingAccess).reduce((acc, key) => {
      if (!['read', 'create', 'update', 'delete', 'readVersions'].includes(key)) {
        acc[key] = existingAccess[key]
      }
      return acc
    }, {} as any),
  }
}

// Helper to add API usage tracking hooks to a collection
export const addAPIUsageTracking = (existingHooks: any = {}) => {
  return {
    ...existingHooks,
    afterRead: [
      ...(existingHooks.afterRead || []),
      async ({ req }: any) => {
        // Only track if user is an API client
        if (req.user?.collection === 'clients') {
          // Dynamically import to avoid circular dependencies
          const { trackAPIUsage } = await import('./apiUsageTracking')
          await trackAPIUsage(req)
        }
      },
    ],
  }
}