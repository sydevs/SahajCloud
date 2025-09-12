import {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  FieldHook,
} from 'payload'
import { PayloadRequest } from 'payload'
import sharp from 'sharp'
import slugify from 'slugify'
import { extractFileMetadata, extractVideoThumbnail } from './fileUtils'
import tmp from 'tmp'
import fs from 'fs'
import { KeyframeData } from '@/components/admin/MeditationFrameEditor/types'

type FileType = 'image' | 'audio' | 'video'

// Maximum MBs for different file types
const MAX_FILE_SIZE = {
  image: 10,
  audio: 50,
  video: 100,
}

// Maximum seconds for different file types
const MAX_FILE_DURATION = {
  image: Infinity, // not applicable
  audio: 50,
  video: 62,
}

type ProcessFileHook = ({
  maxMB,
  maxMinutes,
}: {
  maxMB?: number
  maxMinutes?: number
}) => CollectionBeforeValidateHook

export const sanitizeFilename: CollectionBeforeOperationHook = async ({
  req,
}: {
  req: PayloadRequest
}) => {
  const file = req.file
  if (typeof file?.name === 'string') {
    const fileName = file.name.split('.', 2)

    file.name =
      slugify(fileName[0], { strict: true, lower: true }) +
      '-' +
      (Math.random() + 1).toString(36).substring(2) +
      '.' +
      fileName[1]
  }
}

export const processFile: ProcessFileHook = ({ maxMB, maxMinutes }) => {
  return async ({ data, req }) => {
    if (!req.file || !req.file.data) {
      return data
    }

    const { mimetype } = req.file
    const fileType = mimetype.split('/', 1)[0] as FileType
    maxMB ||= MAX_FILE_SIZE[fileType]
    maxMinutes ||= MAX_FILE_DURATION[fileType]

    // Validate file size
    const fileSize = req.file.size / 1024 / 1024 || 0
    if (req.file.size > maxMB * 1024 * 1024) {
      throw new Error(
        `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${maxMB}MB`,
      )
    }

    // Extract meta data
    const metadata = await extractFileMetadata(req.file)
    data ||= {}
    data.fileMetadata = metadata

    // Validate duration
    if (metadata && maxMinutes !== Infinity) {
      const duration = metadata.duration || 0
      const maxSeconds = maxMinutes * 60

      if (duration > maxSeconds) {
        throw new Error(
          `Duration (${Math.round(duration / 60)} minutes) exceeds maximum allowed duration of ${maxMinutes} minutes`,
        )
      }
    }

    return data
  }
}

export const convertFile: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (req.file && req.file.data && req.file.mimetype) {
    const { mimetype } = req.file

    if (mimetype.startsWith('image/')) {
      // For images, extract dimensions using Sharp
      const { width, height } = await sharp(req.file.data).metadata()
      if (width && height) {
        data.dimensions = { width, height }
      }

      // Auto-convert JPG to WEBP at 95% quality (similar to Media collection)
      if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
        const webpBuffer = await sharp(req.file.data).webp({ quality: 95 }).toBuffer()

        // Update the file data
        req.file.data = webpBuffer
        req.file.mimetype = 'image/webp'
        req.file.name = req.file.name.replace(/\.(jpe?g|png)$/i, '.webp')
      }
    }
  }

  return data
}

export const generateVideoThumbnailHook: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
}) => {
  if (operation !== 'create' || !doc.mimeType?.startsWith('video/') || !req.file?.data) {
    return doc
  }

  try {
    const thumbnailBuffer = await extractVideoThumbnail(req.file.data)
    const tmpFile = tmp.fileSync({ postfix: '.webp' })
    fs.writeFileSync(tmpFile.fd, thumbnailBuffer)

    const thumbnailMedia = await req.payload.create({
      collection: 'media',
      data: {
        alt: `Thumbnail for ${doc.filename}`,
      },
      filePath: tmpFile.name,
    })

    const updatedDoc = await req.payload.update({
      collection: 'frames',
      id: doc.id,
      data: {
        thumbnail: thumbnailMedia.id,
      },
    })

    return updatedDoc
  } catch (error) {
    console.warn(
      'Failed to store video thumbnail:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return doc
  }
}

export const deleteThumbnailHook: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (!doc?.thumbnail) {
    return
  }

  const thumbnailId = typeof doc.thumbnail === 'string' ? doc.thumbnail : doc.thumbnail.id

  if (thumbnailId) {
    await req.payload.delete({
      collection: 'media',
      id: thumbnailId,
    })
  }
}

export const setPreviewUrlHook: CollectionAfterReadHook = async ({ doc, req }) => {
  if (!doc) return doc

  // For video frames, use thumbnail if available
  if (doc.mimeType?.startsWith('video/') && doc.thumbnail) {
    // If thumbnail is just an ID, we need to populate it
    if (typeof doc.thumbnail === 'string') {
      try {
        const thumbnailDoc = await req.payload.findByID({
          collection: 'media',
          id: doc.thumbnail,
        })
        if (thumbnailDoc?.url) {
          doc.previewUrl = thumbnailDoc.url
          return doc
        }
      } catch (error) {
        console.warn('Failed to fetch thumbnail:', error)
      }
    } else if (typeof doc.thumbnail === 'object' && doc.thumbnail?.url) {
      doc.previewUrl = doc.thumbnail.url
      return doc
    }
  }

  // For images or fallback, use small size if available
  if (doc.sizes?.small?.url) {
    doc.previewUrl = doc.sizes.small.url
  } else {
    // Final fallback to main URL (but only for images, not videos)
    if (!doc.mimeType?.startsWith('video/')) {
      doc.previewUrl = doc.url
    }
  }

  return doc
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

export const buildKeyframeData: FieldHook = async ({ value, req }) => {
  if (!value || !Array.isArray(value)) return []
  const frames = value as KeyframeData[]

  // Fetch frame data
  const frameIds = frames.map((f) => f?.id).filter(Boolean)
  if (frameIds.length === 0) return []

  const frameDocs = await req.payload.find({
    collection: 'frames',
    where: { id: { in: frameIds } },
    limit: frameIds.length,
  })

  // Create map of relevant frame data
  const frameMap = Object.fromEntries(
    frameDocs.docs.map((frame) => [
      frame.id,
      {
        id: frame.id,
        url: frame.url,
        duration: frame.duration,
        previewUrl: frame.previewUrl,
        category: frame.category,
        tags: frame.tags,
        sizes: frame.sizes,
        width: frame.width,
        height: frame.height,
        mimeType: frame.mimeType,
      } as KeyframeData,
    ]),
  )

  // Add data to each frame and sort by timestamp
  return frames
    .map((v) => {
      if (!v.id) return null

      return {
        ...v,
        ...frameMap[v.id],
        timestamp: Math.round(v.timestamp),
      } as KeyframeData
    })
    .filter((v) => v != null)
    .sort((a, b) => a.timestamp - b.timestamp)
}
