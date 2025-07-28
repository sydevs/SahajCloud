import type { Access, CollectionConfig, PayloadRequest, TypedUser } from 'payload'

/**
 * Check if the authenticated user is an API client
 */
export const isAPIClient = (user: TypedUser | null) => {
  return user?.collection === 'clients'
}

export const accessControl = (access: CollectionConfig['access'] = {}): CollectionConfig['access'] => {
  return {
    ...access,
    read: ({ req }) => basicAccess(req, access?.read || true),
    create: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.create || true),
    update: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.update || true),
    delete: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.delete || true),
  }
}

export const readApiAccess = (access: CollectionConfig['access'] = {}): CollectionConfig['access'] => {
  return {
    ...access,
    read: ({ req }) => basicAccess(req, access?.read || true),
    create: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.create || true),
    update: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.update || true),
    delete: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.delete || true),
  }
}

export const adminOnlyAccess = (access: CollectionConfig['access'] = {}): CollectionConfig['access'] => {
  return {
    ...access,
    read: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.read || true),
    create: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.create || true),
    update: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.update || true),
    delete: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.delete || true),
  }
}

function basicAccess(req: PayloadRequest, value?: Access | boolean) {
  const user = req.user as TypedUser
  
  if (!user?.active) {
    return false
  } else if (typeof value === 'function') {
    return value({ req })
  } else {
    return value !== undefined ? value : true
  }
}
