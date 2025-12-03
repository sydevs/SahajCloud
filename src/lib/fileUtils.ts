import { PayloadRequest } from 'payload'

export type FileMetadata = {
  width?: number
  height?: number
  duration?: number
  orientation?: number
}

/**
 * Extract file metadata
 * Note: With Cloudflare-native storage, metadata extraction is handled by:
 * - Cloudflare Images API for images (automatic WebP/AVIF conversion, dimensions)
 * - Cloudflare Stream API for videos (automatic encoding, thumbnails, duration)
 * - R2 for audio/files (basic metadata only)
 */
export const extractFileMetadata = async (file: NonNullable<PayloadRequest['file']>) => {
  // Metadata extraction now handled by Cloudflare services
  // Return empty object as placeholder
  return {} as FileMetadata
}

/**
 * Extract video thumbnail - DISABLED for Cloudflare Workers compatibility
 *
 * This function is temporarily disabled because it uses Sharp library which requires
 * native binaries and multi-threading not supported in Cloudflare Workers runtime.
 *
 * TODO: Migrate to Cloudflare Stream API or Cloudflare Images API in Phase 6
 */
export const extractVideoThumbnail = async (videoBuffer: Buffer | Uint8Array): Promise<Buffer> => {
  throw new Error(
    'Video thumbnail extraction is disabled for Cloudflare Workers compatibility. ' +
      'Will be migrated to Cloudflare Stream/Images API in Phase 6.',
  )
}

/*
// ORIGINAL IMPLEMENTATION - Commented out for Cloudflare Workers compatibility
export const extractVideoThumbnail = async (videoBuffer: Buffer | Uint8Array): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const inputFile = tmp.fileSync({ postfix: '.mp4' })
    const outputFile = tmp.fileSync({ postfix: '.png' })

    try {
      fs.writeFileSync(inputFile.fd, videoBuffer)

      ffmpeg(inputFile.name)
        .on('end', async () => {
          try {
            const thumbnailBuffer = await sharp(outputFile.name)
              .resize(320, 320, { fit: 'cover' })
              .webp({ quality: 95 })
              .toBuffer()

            inputFile.removeCallback()
            outputFile.removeCallback()
            resolve(thumbnailBuffer)
          } catch (error) {
            inputFile.removeCallback()
            outputFile.removeCallback()
            reject(error)
          }
        })
        .on('error', (err) => {
          inputFile.removeCallback()
          outputFile.removeCallback()
          reject(err)
        })
        .screenshots({
          timestamps: [0.1],
          filename: path.basename(outputFile.name),
          folder: path.dirname(outputFile.name),
          size: '320x320',
        })
    } catch (error) {
      inputFile.removeCallback()
      outputFile.removeCallback()
      reject(error)
    }
  })
}
*/
