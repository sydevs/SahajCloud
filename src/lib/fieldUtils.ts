import { BeforeChangeHook } from 'node_modules/payload/dist/collections/config/types'

export const generateSlug: BeforeChangeHook = ({ data, operation, originalDoc }) => {
  // Generate slug from title
  if (operation === 'create' && data.title) {
    // Always generate slug on create, ignore any provided slug
    data.slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  } else if (operation === 'update' && originalDoc) {
    // Preserve original slug on update
    data.slug = originalDoc.slug
  }

  return data
}
