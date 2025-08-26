import { CollectionBeforeChangeHook, CollectionBeforeOperationHook } from 'payload'
import { PayloadRequest } from 'payload'
import slugify from 'slugify'

export const sanitizeFilename: CollectionBeforeOperationHook = async ({
  req,
}: {
  req: PayloadRequest
}) => {
  const file = req.file
  if (typeof file?.name === 'string') {
    file.name =
      (Math.random() + 1).toString(36).substring(2) +
      slugify(file.name, { strict: true, lower: true })
  }
}

export const generateSlug: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
}) => {
  // Generate slug from title
  if (operation === 'create' && data.title && !data.slug) {
    data.slug = slugify(data.title, { strict: true, lower: true })
  } else if (operation === 'update' && originalDoc) {
    data.slug = originalDoc.slug
  }

  return data
}
